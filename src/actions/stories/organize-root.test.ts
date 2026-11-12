import { expect, test } from "bun:test";
import { organizeRoot, type OrganizeRootGateway } from "./organize-root.ts";

const rootEntries = [
  { id: 1, slug: "first", full_slug: "first", parent_id: 0, is_folder: false },
  { id: 2, slug: "second", full_slug: "second", parent_id: 0, is_folder: true },
] as never;

test("checks all destination conflicts before making any changes", async () => {
  let writes = 0;
  const gateway: OrganizeRootGateway = {
    listStories: async () => rootEntries,
    findStoryFolderBySlug: async (_space, path) =>
      path === "global"
        ? { id: 5 }
        : path === "global/second"
          ? { id: 7 }
          : undefined,
    findStoryBySlug: async () => undefined,
    moveStory: async () => {
      writes++;
      throw new Error("unexpected");
    },
  };
  await expect(
    organizeRoot(gateway, { spaceId: 42, destination: "global", keep: ["uk"] }),
  ).rejects.toMatchObject({ code: "CONFLICT" });
  expect(writes).toBe(0);
});

test("reports each confirmed move before a later failure", async () => {
  const moved: string[] = [];
  const gateway: OrganizeRootGateway = {
    listStories: async () => rootEntries,
    findStoryFolderBySlug: async (_space, path) =>
      path === "global" ? { id: 5 } : undefined,
    findStoryBySlug: async () => undefined,
    moveStory: async (_space, id) => {
      if (id === 2) throw new Error("failed");
      return { id, parent_id: 5, full_slug: "global/first" } as never;
    },
  };
  await expect(
    organizeRoot(
      gateway,
      { spaceId: 42, destination: "global", keep: [] },
      (item) => moved.push(item.from),
    ),
  ).rejects.toThrow();
  expect(moved).toEqual(["first"]);
});
