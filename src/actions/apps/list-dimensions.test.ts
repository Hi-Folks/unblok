import { expect, test } from "bun:test";
import {
  listDimensionsFolders,
  type ListDimensionsGateway,
} from "./list-dimensions.ts";

test("resolves configured IDs to root folder paths", async () => {
  const gateway: ListDimensionsGateway = {
    getSpace: async () =>
      ({
        id: 42,
        dimensions_app_folder_ids: [7, 8],
        dimensions_app_folders: [{ folder_id: 8, ai_translation_code: "it" }],
      }) as never,
    listStories: async (_space, options) => {
      expect(options).toEqual({ ids: [7, 8] });
      return [
        { id: 8, full_slug: "italy/", is_folder: true, parent_id: 0 },
        { id: 7, full_slug: "global/", is_folder: true, parent_id: 0 },
      ] as never;
    },
  };
  expect(await listDimensionsFolders(gateway, { spaceId: 42 })).toEqual([
    { id: 7, path: "global", aiTranslationCode: null },
    { id: 8, path: "italy", aiTranslationCode: "it" },
  ]);
});

test("rejects unresolvable configured folders", async () => {
  const gateway: ListDimensionsGateway = {
    getSpace: async () => ({ id: 42, dimensions_app_folder_ids: [7] }) as never,
    listStories: async () => [],
  };
  await expect(
    listDimensionsFolders(gateway, { spaceId: 42 }),
  ).rejects.toMatchObject({ code: "CONFLICT" });
});
