import { expect, test } from "bun:test";
import {
  getDimensionsCoverage,
  type DimensionsCoverageGateway,
} from "./dimensions-coverage.ts";

function gateway(): DimensionsCoverageGateway {
  return {
    getSpace: async () =>
      ({
        id: 42,
        dimensions_app_folder_ids: [1, 2, 3],
        dimensions_app_folders: [],
      }) as never,
    listStories: async (_space, options) =>
      options?.ids
        ? ([
            { id: 1, is_folder: true, parent_id: 0, full_slug: "global/" },
            { id: 2, is_folder: true, parent_id: 0, full_slug: "italy/" },
            { id: 3, is_folder: true, parent_id: 0, full_slug: "germany/" },
          ] as never)
        : ([{ id: 4, full_slug: "global/articles/welcome" }] as never),
    getStory: async () =>
      ({
        id: 4,
        full_slug: "global/articles/welcome",
        alternates: [{ id: 5, full_slug: "italy/articles/benvenuto" }],
      }) as never,
  };
}

test("discovers destinations and checks linked variants for a nested source path", async () => {
  const api = gateway();
  const calls: unknown[] = [];
  const list = api.listStories;
  api.listStories = async (space, options) => {
    calls.push(options);
    return list(space, options);
  };
  expect(
    await getDimensionsCoverage(api, {
      spaceId: 42,
      startsWith: "global/articles",
    }),
  ).toEqual({
    apiVersion: "unblok/dimensions-coverage-v1",
    startsWith: "global/articles/",
    sourceFolder: "global",
    folders: ["italy", "germany"],
    stories: [
      {
        id: 4,
        fullSlug: "global/articles/welcome",
        variants: [
          {
            folder: "italy",
            status: "linked",
            story: { id: 5, fullSlug: "italy/articles/benvenuto" },
          },
          { folder: "germany", status: "missing" },
        ],
      },
    ],
  });
  expect(calls).toContainEqual({
    startsWith: "global/articles/",
    storyOnly: true,
  });
  const selected = await getDimensionsCoverage(api, {
    spaceId: 42,
    startsWith: "global/articles/",
    folders: ["germany"],
  });
  expect(selected.folders).toEqual(["germany"]);
  expect(selected.stories[0]?.variants).toEqual([
    { folder: "germany", status: "missing" },
  ]);
});

test("validates source, destinations and alternate data without fabricating results", async () => {
  const api = gateway();
  await expect(
    getDimensionsCoverage(api, { spaceId: 42, startsWith: "unknown/" }),
  ).rejects.toMatchObject({ code: "NOT_FOUND" });
  await expect(
    getDimensionsCoverage(api, {
      spaceId: 42,
      startsWith: "global/",
      folders: ["global"],
    }),
  ).rejects.toMatchObject({ code: "INVALID_INPUT" });
  await expect(
    getDimensionsCoverage(api, {
      spaceId: 42,
      startsWith: "global/",
      folders: ["missing"],
    }),
  ).rejects.toMatchObject({ code: "NOT_FOUND" });
  api.getStory = async () =>
    ({ id: 4, full_slug: "global/articles/welcome" }) as never;
  await expect(
    getDimensionsCoverage(api, { spaceId: 42, startsWith: "global/" }),
  ).rejects.toMatchObject({ code: "CONFLICT" });
  api.getStory = async () =>
    ({
      id: 4,
      full_slug: "global/articles/welcome",
      alternates: [
        { id: 5, full_slug: "italy/a" },
        { id: 6, full_slug: "italy/b" },
      ],
    }) as never;
  await expect(
    getDimensionsCoverage(api, { spaceId: 42, startsWith: "global/" }),
  ).rejects.toMatchObject({ code: "AMBIGUOUS" });
});

test("returns an empty report when the source has no stories and propagates API failures", async () => {
  const api = gateway();
  const list = api.listStories;
  api.listStories = async (space, options) =>
    options?.ids ? list(space, options) : [];
  expect(
    (await getDimensionsCoverage(api, { spaceId: 42, startsWith: "global/" }))
      .stories,
  ).toEqual([]);
  api.getSpace = async () => {
    throw new Error("API unavailable");
  };
  await expect(
    getDimensionsCoverage(api, { spaceId: 42, startsWith: "global/" }),
  ).rejects.toMatchObject({ code: "UNKNOWN" });
});
