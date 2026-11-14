import { expect, test } from "bun:test";
import {
  updateMatchingBlocks,
  type UpdateMatchingBlocksGateway,
} from "./update-matching-blocks.ts";

function fixture() {
  const story = {
    id: 1,
    full_slug: "home",
    content: {
      component: "page",
      _uid: "page",
      body: [
        {
          component: "hero-section",
          _uid: "a",
          eyebrow: "Welcome",
          headline: "Old A",
          text: "One",
        },
        {
          component: "hero-section",
          _uid: "b",
          eyebrow: "Other",
          headline: "Old B",
          text: "Two",
        },
        {
          component: "hero-section",
          _uid: "c",
          eyebrow: "Welcome",
          headline: "Old C",
          text: "Three",
        },
      ],
    },
  };
  let writes = 0,
    concurrent = false;
  const gateway: UpdateMatchingBlocksGateway = {
    findStoryBySlug: async () => ({ id: 1 }) as never,
    getStory: async () => {
      const copy = structuredClone(story);
      if (concurrent) copy.content.body[1]!.text = "Changed";
      return copy as never;
    },
    listComponents: async () =>
      [
        {
          name: "hero-section",
          schema: {
            eyebrow: { type: "text" },
            headline: { type: "text" },
            text: { type: "text" },
          },
        },
      ] as never,
    updateStoryContent: async (_space, _id, content) => {
      writes++;
      story.content = content as typeof story.content;
      return structuredClone(story) as never;
    },
  };
  return {
    gateway,
    story,
    writes: () => writes,
    change: () => {
      concurrent = true;
    },
  };
}
const input = {
  spaceId: 42,
  story: "home",
  component: "hero-section",
  where: { field: "eyebrow", equals: "Welcome" },
  fields: { headline: "Hello" },
};

test("previews and updates all matching blocks, leaving other fields intact", async () => {
  const f = fixture();
  const plan = await updateMatchingBlocks(f.gateway, input);
  expect(plan).toMatchObject({
    status: "planned",
    matched: 2,
    blocks: [
      { uid: "a", path: "/body/0" },
      { uid: "c", path: "/body/2" },
    ],
  });
  expect(f.writes()).toBe(0);
  expect(
    (await updateMatchingBlocks(f.gateway, { ...input, apply: true })).status,
  ).toBe("updated");
  expect(f.story.content.body.map((block) => block.headline)).toEqual([
    "Hello",
    "Old B",
    "Hello",
  ]);
  expect(f.story.content.body.map((block) => block.text)).toEqual([
    "One",
    "Two",
    "Three",
  ]);
  expect(
    (await updateMatchingBlocks(f.gateway, { ...input, apply: true })).status,
  ).toBe("unchanged");
  expect(f.writes()).toBe(1);
});

test("reports no matches and rejects invalid fields without writing", async () => {
  const f = fixture();
  expect(
    (
      await updateMatchingBlocks(f.gateway, {
        ...input,
        where: { field: "eyebrow", equals: "missing" },
        apply: true,
      })
    ).status,
  ).toBe("no_matches");
  await expect(
    updateMatchingBlocks(f.gateway, {
      ...input,
      fields: { missing: "x" },
      apply: true,
    }),
  ).rejects.toMatchObject({ code: "NOT_FOUND" });
  await expect(
    updateMatchingBlocks(f.gateway, { ...input, fields: { _uid: "x" } }),
  ).rejects.toMatchObject({ code: "INVALID_INPUT" });
  expect(f.writes()).toBe(0);
});

test("fails before writing if another edit occurs", async () => {
  const f = fixture(),
    get = f.gateway.getStory;
  let reads = 0;
  f.gateway.getStory = async (...args) => {
    if (++reads === 2) f.change();
    return get(...args);
  };
  await expect(
    updateMatchingBlocks(f.gateway, { ...input, apply: true }),
  ).rejects.toMatchObject({ code: "CONFLICT" });
  expect(f.writes()).toBe(0);
});

test("rejects a string replacement for a nested blocks field", async () => {
  const f = fixture();
  f.gateway.listComponents = async () =>
    [
      {
        name: "hero-section",
        schema: { eyebrow: { type: "text" }, headline: { type: "bloks" } },
      },
    ] as never;
  await expect(
    updateMatchingBlocks(f.gateway, { ...input, apply: true }),
  ).rejects.toMatchObject({ code: "INVALID_INPUT" });
  expect(f.writes()).toBe(0);
});
