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
