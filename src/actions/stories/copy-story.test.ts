import { expect, test } from "bun:test";
import { copyStory, type CopyStoryGateway } from "./copy-story.ts";

test("copies source draft content once and preserves an existing target", async () => {
  let target = false;
  const writes: unknown[] = [];
  const gateway: CopyStoryGateway = {
    findStoryBySlug: async (_space, slug) =>
      slug === "global/site-config"
        ? ({ id: 1 } as never)
        : slug === "site-config" && target
          ? ({ id: 2 } as never)
          : undefined,
    findStoryFolderBySlug: async () => undefined,
    getStory: async () =>
      ({
        id: 1,
        full_slug: "global/site-config",
        name: "Site config",
        content: {
          component: "site-config",
          _uid: "original",
          title: "Example",
        },
      }) as never,
    createStory: async (_space, story) => {
      writes.push(story);
      target = true;
      return { id: 2, full_slug: "site-config" } as never;
    },
  };
  const input = {
    spaceId: 42,
    source: "global/site-config",
    target: "site-config",
  };
  expect(await copyStory(gateway, input)).toMatchObject({
    status: "created",
    storyId: 2,
  });
  expect(await copyStory(gateway, input)).toMatchObject({
    status: "unchanged",
    storyId: 2,
  });
  expect(writes).toEqual([
    {
      name: "Site config",
      slug: "site-config",
      content: { component: "site-config", _uid: "original", title: "Example" },
    },
  ]);
});

test("does not write when the source is missing or a target folder exists", async () => {
  let writes = 0,
    sourceExists = false;
  const gateway: CopyStoryGateway = {
    findStoryBySlug: async (_space, slug) =>
      sourceExists && slug === "global/site-config"
        ? ({ id: 1 } as never)
        : undefined,
    findStoryFolderBySlug: async () => ({ id: 9 }),
    getStory: async () => ({}) as never,
    createStory: async () => {
      writes++;
      return {} as never;
    },
  };
  const input = {
    spaceId: 42,
    source: "global/site-config",
    target: "site-config",
  };
  await expect(copyStory(gateway, input)).rejects.toMatchObject({
    code: "NOT_FOUND",
  });
  sourceExists = true;
  await expect(copyStory(gateway, input)).rejects.toMatchObject({
    code: "CONFLICT",
  });
  expect(writes).toBe(0);
});
