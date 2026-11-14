import { expect, test } from "bun:test";
import { ClientError } from "@storyblok/management-api-client";
import {
  createDimensionVariant,
  type CreateDimensionVariantGateway,
} from "./create-dimension-variant.ts";

test("creates a linked variant and skips it on repeat", async () => {
  let exists = false,
    writes = 0;
  const gateway: CreateDimensionVariantGateway = {
    getSpace: async () =>
      ({
        id: 42,
        dimensions_app_folder_ids: [9],
        dimensions_app_folders: [],
      }) as never,
    listStories: async () =>
      [{ id: 9, is_folder: true, full_slug: "italy/", parent_id: 0 }] as never,
    findStoryBySlug: async () => ({ id: 1 }) as never,
    getStory: async () =>
      ({
        id: 1,
        full_slug: "global/home",
        group_id: "group-1",
        alternates: exists ? [{ id: 2, full_slug: "italy/home" }] : [],
      }) as never,
    duplicateStoryToDimension: async (space, story, folder, group) => {
      expect([space, story, folder, group]).toEqual([42, 1, 9, "group-1"]);
      writes++;
      exists = true;
      return { id: 2, full_slug: "italy/home", group_id: "group-1" } as never;
    },
  };
  const input = { spaceId: 42, story: "global/home", folder: "italy" };
  expect(await createDimensionVariant(gateway, input)).toEqual({
    status: "created",
    story: { id: 2, fullSlug: "italy/home" },
    folder: "italy",
  });
  expect(await createDimensionVariant(gateway, input)).toMatchObject({
    status: "unchanged",
  });
  expect(writes).toBe(1);
});

test("fails safely if group or alternate metadata is unavailable", async () => {
  let writes = 0,
    alternates: unknown = [];
  const gateway: CreateDimensionVariantGateway = {
    getSpace: async () => ({ id: 42, dimensions_app_folder_ids: [9] }) as never,
    listStories: async () =>
      [{ id: 9, is_folder: true, full_slug: "italy", parent_id: 0 }] as never,
    findStoryBySlug: async () => ({ id: 1 }) as never,
    getStory: async () =>
      ({ id: 1, full_slug: "global/home", alternates }) as never,
    duplicateStoryToDimension: async () => {
      writes++;
      return {} as never;
    },
  };
  const input = { spaceId: 42, story: "global/home", folder: "italy" };
  await expect(createDimensionVariant(gateway, input)).rejects.toMatchObject({
    code: "CONFLICT",
  });
  alternates = undefined;
  await expect(createDimensionVariant(gateway, input)).rejects.toMatchObject({
    code: "CONFLICT",
  });
  expect(writes).toBe(0);
});

test("preserves safe Storyblok validation details without exposing sensitive response data", async () => {
  const gateway: CreateDimensionVariantGateway = {
    getSpace: async () => ({ id: 42, dimensions_app_folder_ids: [9] }) as never,
    listStories: async () =>
      [{ id: 9, is_folder: true, full_slug: "italy", parent_id: 0 }] as never,
    findStoryBySlug: async () => ({ id: 1 }) as never,
    getStory: async () =>
      ({
        id: 1,
        full_slug: "global/home",
        group_id: "group-1",
        alternates: [],
      }) as never,
    duplicateStoryToDimension: async () => {
      throw new ClientError("Unprocessable", {
        status: 422,
        statusText: "Unprocessable",
        data: {
          errors: {
            slug: ["has already been taken"],
            token: ["secret"],
            name: ["secret-content"],
          },
        },
      });
    },
  };
  await expect(
    createDimensionVariant(gateway, {
      spaceId: 42,
      story: "global/home",
      folder: "italy",
    }),
  ).rejects.toMatchObject({
    code: "API_ERROR",
    status: 422,
    message:
      "Storyblok API request failed (HTTP 422). slug: has already been taken.",
  });
});
