import { expect, test } from "bun:test";
import { getStory, updateStoryBlock } from "./content.ts";

test("retrieves full story content when looking up a slug", async () => {
  const gateway = {
    findStoryBySlug: async () => ({ id: 2 }) as never,
    getStory: async (_spaceId: number, storyId: number) =>
      ({ id: storyId, content: { component: "page" } }) as never,
  };
  const story = await getStory(gateway, 1, "home");
  expect(story.id).toBe(2);
  expect(story.content).toEqual({ component: "page" });
});

test("updates only the selected block and preserves other content", async () => {
  const content = {
    component: "page",
    body: [
      { _uid: "hero", component: "hero", color: "red", cta: "Old" },
      { _uid: "other", component: "text", text: "Keep" },
    ],
  };
  let saved: Record<string, unknown> | undefined;
  const gateway = {
    getStory: async () => ({ content }) as never,
    updateStoryContent: async (
      _s: number,
      _id: number,
      next: Record<string, unknown>,
    ) => {
      saved = next;
      return {} as never;
    },
  };
  await updateStoryBlock(gateway, 1, 2, "hero", { color: "blue", cta: "New" });
  expect(saved).toEqual({
    component: "page",
    body: [
      { _uid: "hero", component: "hero", color: "blue", cta: "New" },
      content.body[1],
    ],
  });
  expect(content.body[0]?.color).toBe("red");
  await expect(
    updateStoryBlock(gateway, 1, 2, "missing", { color: "blue" }),
  ).rejects.toThrow("found 0");
  await expect(
    updateStoryBlock(gateway, 1, 2, "hero", { unknown: "x" }),
  ).rejects.toThrow("does not exist");
});
