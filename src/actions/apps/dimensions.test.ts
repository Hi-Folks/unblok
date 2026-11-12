import { expect, test } from "bun:test";
import { configureDimensions, type DimensionsGateway } from "./dimensions.ts";

test("resolves root paths, preserves existing settings and reconciles on retry", async () => {
  const space = {
    id: 42,
    dimensions_app_folder_ids: [2],
    dimensions_app_folders: [{ folder_id: 2, ai_translation_code: "it" }],
  };
  const updates: unknown[] = [];
  const gateway: DimensionsGateway = {
    getSpace: async () => space as never,
    findStoryFolderBySlug: async (_space, path) =>
      path === "global" ? { id: 1 } : path === "italy" ? { id: 2 } : undefined,
    updateSpaceSettings: async (_space, settings) => {
      updates.push(settings);
      Object.assign(space, settings);
    },
  };
  expect(
    await configureDimensions(gateway, {
      spaceId: 42,
      folders: ["global", "italy"],
    }),
  ).toMatchObject({ status: "updated" });
  expect(updates).toEqual([
    {
      dimensions_app_folder_ids: [1, 2],
      dimensions_app_folders: [
        { folder_id: 1, ai_translation_code: "" },
        { folder_id: 2, ai_translation_code: "it" },
      ],
    },
  ]);
  expect(
    await configureDimensions(gateway, {
      spaceId: 42,
      folders: ["global", "italy"],
    }),
  ).toMatchObject({ status: "unchanged" });
  expect(updates).toHaveLength(1);
});

test("does not update on missing folders or invalid existing settings", async () => {
  let writes = 0;
  const gateway: DimensionsGateway = {
    getSpace: async () =>
      ({
        id: 42,
        dimensions_app_folder_ids: [],
        dimensions_app_folders: [],
      }) as never,
    findStoryFolderBySlug: async () => undefined,
    updateSpaceSettings: async () => {
      writes++;
    },
  };
  await expect(
    configureDimensions(gateway, { spaceId: 42, folders: ["missing"] }),
  ).rejects.toMatchObject({ code: "NOT_FOUND" });
  await expect(
    configureDimensions(gateway, { spaceId: 42, folders: ["a/b"] }),
  ).rejects.toMatchObject({ code: "INVALID_INPUT" });
  expect(writes).toBe(0);
});
