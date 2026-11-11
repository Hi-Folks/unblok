import { expect, test } from "bun:test";
import { ClientError } from "@storyblok/management-api-client";
import { compareStoryLanguages } from "./compare-languages.ts";

function gateway() {
  return {
    findStoryBySlug: async () => ({ id: 7 }),
    getStory: async () => ({
      id: 7,
      full_slug: "home",
      content: {
        component: "page",
        _uid: "root",
        title: "Hello",
        title__i18n__de: "Hallo",
        title__i18n__it: "",
        internal: "do not compare",
        body: [
          {
            component: "hero",
            _uid: "one",
            headline: "Discover",
            headline__i18n__de: "Entdecken",
            sub: null,
            sub__i18n__de: null,
          },
          { component: "hero", _uid: "two", headline: "More" },
        ],
      },
    }),
    listComponents: async () => [
      {
        name: "page",
        schema: {
          title: { type: "text", translatable: true },
          internal: { type: "text" },
          body: { type: "bloks", translatable: true },
        },
      },
      {
        name: "hero",
        schema: {
          headline: { type: "text", translatable: true },
          sub: { type: "text", translatable: true },
        },
      },
    ],
    listLanguages: async () => [
      { code: "de", name: "German" },
      { code: "it", name: "Italian" },
    ],
  };
}

test("compares configured translatable fields in nested blocks and preserves missing versus empty", async () => {
  const result = await compareStoryLanguages(gateway() as never, {
    spaceId: 42,
    story: "home",
    languages: ["de", "it"],
  });
  expect(result.story).toEqual({ id: 7, fullSlug: "home" });
  expect(result.fields).toMatchObject([
    {
      path: "/title",
      blockUid: "root",
      source: { status: "present", value: "Hello" },
      translations: [
        { language: "de", status: "present", value: "Hallo" },
        { language: "it", status: "empty", value: "" },
      ],
    },
    {
      path: "/body/0/headline",
      blockUid: "one",
      translations: [
        { language: "de", status: "present", value: "Entdecken" },
        { language: "it", status: "missing" },
      ],
    },
    {
      path: "/body/0/sub",
      source: { status: "empty", value: null },
      translations: [
        { language: "de", status: "empty", value: null },
        { language: "it", status: "missing" },
      ],
    },
    {
      path: "/body/1/headline",
      blockUid: "two",
      translations: [
        { language: "de", status: "missing" },
        { language: "it", status: "missing" },
      ],
    },
    {
      path: "/body/1/sub",
      source: { status: "missing" },
      translations: [
        { language: "de", status: "missing" },
        { language: "it", status: "missing" },
      ],
    },
  ]);
  expect(result.summary).toEqual({
    fields: 5,
    present: 2,
    empty: 2,
    missing: 6,
  });
  expect(JSON.stringify(result)).not.toContain("do not compare");
});

test("rejects invalid inputs before any API request", async () => {
  let calls = 0;
  const client = {
    ...gateway(),
    findStoryBySlug: async () => {
      calls++;
      return { id: 7 };
    },
  };
  for (const input of [
    { spaceId: 0, story: "home", languages: ["de"] },
    { spaceId: 42, story: "home", languages: [] },
    { spaceId: 42, story: "home", languages: ["de", "de"] },
  ])
    await expect(
      compareStoryLanguages(client as never, input),
    ).rejects.toMatchObject({ code: "INVALID_INPUT" });
  expect(calls).toBe(0);
});

test("does not claim completeness when a language or component schema is unavailable", async () => {
  const client = gateway();
  await expect(
    compareStoryLanguages(client as never, {
      spaceId: 42,
      story: "7",
      languages: ["es"],
    }),
  ).rejects.toMatchObject({ code: "NOT_FOUND" });
  await expect(
    compareStoryLanguages(
      { ...client, listComponents: async () => [] } as never,
      { spaceId: 42, story: "7", languages: ["de"] },
    ),
  ).rejects.toMatchObject({ code: "NOT_FOUND" });
  await expect(
    compareStoryLanguages(
      {
        ...client,
        listComponents: async () => [{ name: "page", schema: null }],
      } as never,
      { spaceId: 42, story: "7", languages: ["de"] },
    ),
  ).rejects.toMatchObject({ code: "CONFLICT" });
  await expect(
    compareStoryLanguages(
      {
        ...client,
        getStory: async () => {
          throw new ClientError("Forbidden", {
            status: 403,
            statusText: "Forbidden",
            data: {},
          });
        },
      } as never,
      { spaceId: 42, story: "7", languages: ["de"] },
    ),
  ).rejects.toMatchObject({ code: "PERMISSION_DENIED", status: 403 });
});
