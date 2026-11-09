import { expect, test } from "bun:test";
import { ensureStoryFolder, type StoryFolderGateway } from "./ensure-folder.ts";

test("creates missing nested folders in order and reuses them", async () => {
  const folders = new Map<string, number>();
  const created: unknown[] = [];
  const gateway: StoryFolderGateway = {
    findStoryFolderBySlug: async (_space, slug) =>
      folders.has(slug) ? { id: folders.get(slug)! } : undefined,
    findStoryBySlug: async () => undefined,
    createStoryFolder: async (_space, input) => {
      created.push(input);
      const path = input.parentId === 0 ? input.slug : `folder1/${input.slug}`;
      const id = folders.size + 1;
      folders.set(path, id);
      return { id };
    },
  };
  const input = { spaceId: 42, path: "folder1/subfolder2" };
  expect(await ensureStoryFolder(gateway, input)).toEqual({
    status: "created",
    path: input.path,
    folderId: 2,
    created: ["folder1", "folder1/subfolder2"],
  });
  expect(created).toEqual([
    { name: "folder1", slug: "folder1", parentId: 0 },
    { name: "subfolder2", slug: "subfolder2", parentId: 1 },
  ]);
  expect(await ensureStoryFolder(gateway, input)).toEqual({
    status: "unchanged",
    path: input.path,
    folderId: 2,
    created: [],
  });
});

test("rejects invalid paths before requests and stops on a story collision", async () => {
  let writes = 0;
  const gateway: StoryFolderGateway = {
    findStoryFolderBySlug: async () => undefined,
    findStoryBySlug: async () => ({ id: 3 }) as never,
    createStoryFolder: async () => {
      writes++;
      return { id: 1 };
    },
  };
  await expect(
    ensureStoryFolder(gateway, { spaceId: 42, path: "x//y" }),
  ).rejects.toMatchObject({ code: "INVALID_INPUT" });
  await expect(
    ensureStoryFolder(gateway, { spaceId: 42, path: "x/y" }),
  ).rejects.toMatchObject({ code: "CONFLICT" });
  expect(writes).toBe(0);
});

test("a retry reuses a parent created before a later failure", async () => {
  let parentExists = false;
  let failChild = true;
  let parentWrites = 0;
  const gateway: StoryFolderGateway = {
    findStoryFolderBySlug: async (_space, path) =>
      path === "folder1" && parentExists ? { id: 1 } : undefined,
    findStoryBySlug: async () => undefined,
    createStoryFolder: async (_space, input) => {
      if (input.parentId === 0) {
        parentExists = true;
        parentWrites++;
        return { id: 1 };
      }
      if (failChild) throw new Error("child failed");
      return { id: 2 };
    },
  };
  await expect(
    ensureStoryFolder(gateway, { spaceId: 42, path: "folder1/subfolder2" }),
  ).rejects.toBeDefined();
  failChild = false;
  expect(
    await ensureStoryFolder(gateway, {
      spaceId: 42,
      path: "folder1/subfolder2",
    }),
  ).toEqual({
    status: "created",
    path: "folder1/subfolder2",
    folderId: 2,
    created: ["folder1/subfolder2"],
  });
  expect(parentWrites).toBe(1);
});
