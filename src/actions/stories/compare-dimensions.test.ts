import { expect, test } from "bun:test";
import {
  compareStoryDimensions,
  type CompareDimensionsGateway,
} from "./compare-dimensions.ts";

test("compares linked variants even when their slugs differ and reports missing folders", async () => {
  const gateway: CompareDimensionsGateway = {
    findStoryBySlug: async () => ({ id: 1 }) as never,
    findStoryFolderBySlug: async () => ({ id: 12 }),
    getStory: async (_space, id) =>
      id === 1
        ? ({
            id,
            full_slug: "global/home",
            content: { component: "page", title: "Hello" },
            alternates: [{ id: 2, full_slug: "italy/benvenuto" }],
          } as never)
        : ({
            id,
            full_slug: "italy/benvenuto",
            content: { component: "page", title: "Ciao" },
          } as never),
  };
  const report = await compareStoryDimensions(gateway, {
    spaceId: 42,
    story: "global/home",
    folders: ["italy", "germany"],
  });
  expect(report).toEqual({
    apiVersion: "unblok/story-dimensions-comparison-v1",
    story: { id: 1, fullSlug: "global/home" },
    folders: [
      {
        folder: "italy",
        status: "compared",
        story: { id: 2, fullSlug: "italy/benvenuto" },
        changes: [
          { path: "/title", type: "changed", before: "Hello", after: "Ciao" },
        ],
      },
      { folder: "germany", status: "missing" },
    ],
  });
});

test("rejects missing alternate data and ambiguous linked variants", async () => {
  let alternateData: unknown = undefined;
  const gateway: CompareDimensionsGateway = {
    findStoryBySlug: async () => ({ id: 1 }) as never,
    findStoryFolderBySlug: async () => ({ id: 12 }),
    getStory: async () =>
      ({
        id: 1,
        full_slug: "global/home",
        content: {},
        alternates: alternateData,
      }) as never,
  };
  const input = { spaceId: 42, story: "global/home", folders: ["italy"] };
  await expect(compareStoryDimensions(gateway, input)).rejects.toMatchObject({
    code: "CONFLICT",
  });
  alternateData = [
    { id: 2, full_slug: "italy/a" },
    { id: 3, full_slug: "italy/b" },
  ];
  await expect(compareStoryDimensions(gateway, input)).rejects.toMatchObject({
    code: "AMBIGUOUS",
  });
  await expect(
    compareStoryDimensions(gateway, { ...input, folders: ["italy/region"] }),
  ).rejects.toMatchObject({ code: "INVALID_INPUT" });
});

test("defaults to all configured folders except the source, including missing variants", async () => {
  const gateway: CompareDimensionsGateway = {
    getSpace: async () =>
      ({
        id: 42,
        dimensions_app_folder_ids: [10, 11, 12],
        dimensions_app_folders: [],
      }) as never,
    listStories: async () =>
      [
        { id: 10, is_folder: true, parent_id: 0, full_slug: "global/" },
        { id: 11, is_folder: true, parent_id: 0, full_slug: "italy/" },
        { id: 12, is_folder: true, parent_id: 0, full_slug: "germany/" },
      ] as never,
    findStoryBySlug: async () => ({ id: 1 }) as never,
    findStoryFolderBySlug: async () => {
      throw new Error("configured folders were already resolved");
    },
    getStory: async (_space, id) =>
      id === 1
        ? ({
            id,
            full_slug: "global/home",
            content: { title: "Hello" },
            alternates: [{ id: 2, full_slug: "italy/home" }],
          } as never)
        : ({
            id,
            full_slug: "italy/home",
            content: { title: "Ciao" },
          } as never),
  };
  const report = await compareStoryDimensions(gateway, {
    spaceId: 42,
    story: "global/home",
  });
  expect(report.folders).toMatchObject([
    { folder: "italy", status: "compared" },
    { folder: "germany", status: "missing" },
  ]);
});

test("reports when no other configured folder is available", async () => {
  const gateway: CompareDimensionsGateway = {
    getSpace: async () => ({ id: 42, dimensions_app_folder_ids: [] }) as never,
    listStories: async () => [],
    findStoryBySlug: async () => ({ id: 1 }) as never,
    findStoryFolderBySlug: async () => undefined,
    getStory: async () =>
      ({
        id: 1,
        full_slug: "global/home",
        content: {},
        alternates: [],
      }) as never,
  };
  await expect(
    compareStoryDimensions(gateway, { spaceId: 42, story: "global/home" }),
  ).rejects.toMatchObject({ code: "NOT_FOUND" });
});
