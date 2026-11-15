import { expect, test } from "bun:test";
import { createMissingVariants } from "./create-missing-variants.ts";
import { UnblokError } from "../action-error.ts";

function fixture() {
  const linked = new Set<string>();
  let fail = "";
  const calls: string[] = [];
  const folders = ["global", "italy", "germany", "uk"];
  const gateway = {
    getSpace: async () => ({
      id: 42,
      dimensions_app_folder_ids: [1, 2, 3, 4],
      dimensions_app_folders: [],
    }),
    listStories: async (_space: number, options?: { ids?: number[] }) =>
      options?.ids
        ? folders.map((name, i) => ({
            id: i + 1,
            is_folder: true,
            parent_id: 0,
            full_slug: `${name}/`,
          }))
        : [{ id: 10, full_slug: "global/home" }],
    findStoryBySlug: async () => ({ id: 10 }),
    getStory: async () => ({
      id: 10,
      full_slug: "global/home",
      group_id: "group",
      alternates: [...linked].map((folder) => ({
        id: folders.indexOf(folder) + 20,
        full_slug: `${folder}/home`,
      })),
    }),
    duplicateStoryToDimension: async (
      _space: number,
      _source: number,
      id: number,
    ) => {
      const folder = folders[id - 1]!;
      calls.push(folder);
      if (fail === folder)
        throw new UnblokError({
          message: "Forbidden",
          code: "PERMISSION_DENIED",
        });
      linked.add(folder);
      return { id: id + 19, full_slug: `${folder}/home`, group_id: "group" };
    },
  };
  return {
    gateway: gateway as never,
    calls,
    linked,
    setFail: (folder: string) => {
      fail = folder;
    },
  };
}

test("plan is read only and apply creates only missing links across retries", async () => {
  const f = fixture();
  f.linked.add("italy");
  const input = {
    spaceId: 42,
    startsWith: "global/",
    folders: ["italy", "germany"],
  };
  const plan = await createMissingVariants(f.gateway, {
    ...input,
    apply: false,
  });
  expect(plan.operations.map((item) => item.status)).toEqual([
    "unchanged",
    "planned",
  ]);
  expect(f.calls).toEqual([]);
  const result = await createMissingVariants(f.gateway, {
    ...input,
    apply: true,
  });
  expect(result.operations.map((item) => item.status)).toEqual([
    "unchanged",
    "created",
  ]);
  const retry = await createMissingVariants(f.gateway, {
    ...input,
    apply: true,
  });
  expect(retry.operations.map((item) => item.status)).toEqual([
    "unchanged",
    "unchanged",
  ]);
  expect(f.calls).toEqual(["germany"]);
});

test("stops after a failed write and reports completed and not-run operations", async () => {
  const f = fixture();
  f.setFail("germany");
  const report = await createMissingVariants(f.gateway, {
    spaceId: 42,
    startsWith: "global/",
    apply: true,
  });
  expect(report.operations.map((item) => item.status)).toEqual([
    "created",
    "failed",
    "not_run",
  ]);
  expect(report.operations[1]?.error).toMatchObject({
    code: "PERMISSION_DENIED",
  });
  expect(f.calls).toEqual(["italy", "germany"]);
});

test("creates variants for a start page with a trailing slash and continues to other stories", async () => {
  const linked = new Set<number>();
  const writes: number[] = [];
  const gateway = {
    getSpace: async () => ({
      id: 42,
      dimensions_app_folder_ids: [1, 2],
      dimensions_app_folders: [],
    }),
    listStories: async (_space: number, options?: { ids?: number[] }) =>
      options?.ids
        ? [
            { id: 1, is_folder: true, parent_id: 0, full_slug: "global/" },
            { id: 2, is_folder: true, parent_id: 0, full_slug: "italy/" },
          ]
        : [
            { id: 10, full_slug: "global/articles/" },
            { id: 11, full_slug: "global/articles/first" },
          ],
    findStoryBySlug: async () => {
      throw new Error("ID lookup should not resolve a slug");
    },
    getStory: async (_space: number, id: number) => ({
      id,
      full_slug: id === 10 ? "global/articles/" : "global/articles/first",
      group_id: `group-${id}`,
      alternates: linked.has(id)
        ? [
            {
              id: id + 100,
              full_slug: id === 10 ? "italy/articles/" : "italy/articles/first",
            },
          ]
        : [],
    }),
    duplicateStoryToDimension: async (_space: number, id: number) => {
      writes.push(id);
      linked.add(id);
      return {
        id: id + 100,
        full_slug: id === 10 ? "italy/articles/" : "italy/articles/first",
        group_id: `group-${id}`,
      };
    },
  };
  const input = {
    spaceId: 42,
    startsWith: "global/articles/",
    folders: ["italy"],
    apply: true,
  };
  const first = await createMissingVariants(gateway as never, input);
  expect(first.operations.map((item) => [item.source, item.status])).toEqual([
    ["global/articles/", "created"],
    ["global/articles/first", "created"],
  ]);
  const second = await createMissingVariants(gateway as never, input);
  expect(second.operations.map((item) => item.status)).toEqual([
    "unchanged",
    "unchanged",
  ]);
  expect(writes).toEqual([10, 11]);
});

test("does not create a variant if a story moved after coverage was collected", async () => {
  const f = fixture();
  const gateway =
    f.gateway as import("./create-missing-variants.ts").MissingVariantsGateway;
  let reads = 0;
  gateway.getStory = async () =>
    ({
      id: 10,
      full_slug: ++reads === 1 ? "global/home" : "global/moved",
      group_id: "group",
      alternates: [],
    }) as never;
  const result = await createMissingVariants(gateway, {
    spaceId: 42,
    startsWith: "global/",
    folders: ["italy"],
    apply: true,
  });
  expect(result.operations[0]).toMatchObject({
    status: "failed",
    error: { code: "CONFLICT" },
  });
  expect(f.calls).toEqual([]);
});
