import { describe, expect, test } from "bun:test";
import { ClientError } from "@storyblok/management-api-client";
import {
  ensureTranslatedSlugs,
  type TranslatedSlugsGateway,
} from "./library-translated-slugs.ts";

describe("ensureTranslatedSlugs", () => {
  test("updates and creates requested translations, preserves others, and skips a repeat", async () => {
    let current = [
      { id: 11, lang: "it", slug: "old", name: "Old" },
      { id: 12, lang: "de", slug: "uber" },
    ];
    const writes: unknown[] = [];
    const gateway = {
      listInstalledApps: async () => [{ slug: "translatable-slugs" }],
      listLanguages: async () => [{ code: "it" }, { code: "fr" }],
      findStoryBySlug: async () => ({ id: 1 }),
      getStory: async () => ({
        id: 1,
        full_slug: "about",
        translated_slugs: current,
      }),
      updateTranslatedSlugs: async (
        _space: number,
        _id: number,
        updates: unknown[],
      ) => {
        writes.push(updates);
        current = [
          { id: 11, lang: "it", slug: "chi-siamo", name: "Chi siamo" },
          { id: 12, lang: "de", slug: "uber" },
          { id: 13, lang: "fr", slug: "a-propos" },
        ];
      },
    } as unknown as TranslatedSlugsGateway;
    const input = {
      spaceId: 42,
      story: "/about/",
      translations: [
        { language: "it", slug: "/chi-siamo/", name: "Chi siamo" },
        { language: "fr", slug: "a-propos" },
      ],
    };
    expect(await ensureTranslatedSlugs(gateway, input)).toEqual({
      status: "updated",
    });
    expect(writes).toEqual([
      [
        { id: 11, slug: "chi-siamo", name: "Chi siamo" },
        { lang: "fr", slug: "a-propos" },
      ],
    ]);
    expect(current.find((item) => item.lang === "de")?.slug).toBe("uber");
    expect(await ensureTranslatedSlugs(gateway, input)).toEqual({
      status: "unchanged",
    });
    expect(writes).toHaveLength(1);
  });

  test("rejects invalid input before API calls", async () => {
    let calls = 0;
    const gateway = {
      listInstalledApps: async () => {
        calls++;
        return [];
      },
    } as unknown as TranslatedSlugsGateway;
    await expect(
      ensureTranslatedSlugs(gateway, {
        spaceId: 1,
        story: "about",
        translations: [
          { language: "it", slug: "a" },
          { language: "it", slug: "b" },
        ],
      }),
    ).rejects.toMatchObject({ code: "INVALID_INPUT" });
    await expect(
      ensureTranslatedSlugs(gateway, {
        spaceId: 1,
        story: "about",
        translations: [],
      }),
    ).rejects.toMatchObject({ code: "INVALID_INPUT" });
    expect(calls).toBe(0);
  });

  test("classifies missing prerequisites, ambiguous data and API failures", async () => {
    let writes = 0;
    const gateway = {
      listInstalledApps: async () => [{ slug: "translatable-slugs" }],
      listLanguages: async () => [{ code: "it" }],
      findStoryBySlug: async () => ({ id: 1 }),
      getStory: async () => ({
        id: 1,
        full_slug: "about",
        translated_slugs: [
          { id: 1, lang: "it", slug: "a" },
          { id: 2, lang: "it", slug: "b" },
        ],
      }),
      updateTranslatedSlugs: async () => {
        writes++;
      },
    } as unknown as TranslatedSlugsGateway;
    const input = {
      spaceId: 1,
      story: "about",
      translations: [{ language: "it", slug: "new" }],
    };
    await expect(
      ensureTranslatedSlugs(
        { ...gateway, listInstalledApps: async () => [] },
        input,
      ),
    ).rejects.toMatchObject({ code: "CONFLICT" });
    await expect(
      ensureTranslatedSlugs(
        { ...gateway, listLanguages: async () => [] },
        input,
      ),
    ).rejects.toMatchObject({ code: "NOT_FOUND" });
    await expect(ensureTranslatedSlugs(gateway, input)).rejects.toMatchObject({
      code: "AMBIGUOUS",
    });
    await expect(
      ensureTranslatedSlugs(
        { ...gateway, findStoryBySlug: async () => undefined },
        input,
      ),
    ).rejects.toMatchObject({ code: "NOT_FOUND" });
    const apiError = new ClientError("denied", {
      status: 403,
      statusText: "Forbidden",
      data: null,
    });
    await expect(
      ensureTranslatedSlugs(
        {
          ...gateway,
          listInstalledApps: async () => {
            throw apiError;
          },
        },
        input,
      ),
    ).rejects.toMatchObject({ code: "PERMISSION_DENIED", cause: apiError });
    await expect(
      ensureTranslatedSlugs(
        {
          ...gateway,
          getStory: async () =>
            ({ id: 1, full_slug: "about", translated_slugs: [] }) as never,
          updateTranslatedSlugs: async () => {
            throw apiError;
          },
        },
        input,
      ),
    ).rejects.toMatchObject({ code: "PERMISSION_DENIED", cause: apiError });
    expect(writes).toBe(0);
  });
});
