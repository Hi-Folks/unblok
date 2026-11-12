import { expect, test } from "bun:test";
import { ClientError } from "@storyblok/management-api-client";
import { moveStory, type MoveStoryGateway } from "./move-story.ts";

test("moves a story by full slug and reports a repeat using its new path", async () => {
  let path = "home",
    parent = 0,
    writes = 0;
  const gateway: MoveStoryGateway = {
    findStoryBySlug: async (_space, slug) =>
      slug === path
        ? ({ id: 7, slug: "home", full_slug: path, parent_id: parent } as never)
        : undefined,
    findStoryFolderBySlug: async (_space, slug) =>
      slug === "global" ? { id: 10 } : undefined,
    moveStory: async (_space, id, parentId) => {
      writes++;
      parent = parentId;
      path = "global/home";
      return { id, slug: "home", full_slug: path, parent_id: parent } as never;
    },
  };
  expect(
    await moveStory(gateway, { spaceId: 42, slug: "home", folder: "global" }),
  ).toEqual({ status: "moved", storyId: 7, from: "home", to: "global/home" });
  expect(
    await moveStory(gateway, {
      spaceId: 42,
      slug: "global/home",
      folder: "global",
    }),
  ).toMatchObject({ status: "unchanged" });
  await expect(
    moveStory(gateway, { spaceId: 42, slug: "home", folder: "global" }),
  ).rejects.toMatchObject({ code: "NOT_FOUND" });
  expect(writes).toBe(1);
});

test("rejects invalid paths, missing folders and destination conflicts without moving", async () => {
  let calls = 0,
    writes = 0;
  const gateway: MoveStoryGateway = {
    findStoryBySlug: async (_space, slug) => {
      calls++;
      return slug === "home" || slug === "global/home"
        ? ({
            id: slug === "home" ? 7 : 8,
            slug: "home",
            full_slug: slug,
            parent_id: 0,
          } as never)
        : undefined;
    },
    findStoryFolderBySlug: async (_space, slug) =>
      slug === "global" ? { id: 10 } : undefined,
    moveStory: async () => {
      writes++;
      throw new Error("unexpected");
    },
  };
  await expect(
    moveStory(gateway, { spaceId: 42, slug: "home", folder: "a//b" }),
  ).rejects.toMatchObject({ code: "INVALID_INPUT" });
  expect(calls).toBe(0);
  await expect(
    moveStory(gateway, { spaceId: 42, slug: "home", folder: "missing" }),
  ).rejects.toMatchObject({ code: "NOT_FOUND" });
  await expect(
    moveStory(gateway, { spaceId: 42, slug: "home", folder: "global" }),
  ).rejects.toMatchObject({ code: "CONFLICT" });
  expect(writes).toBe(0);
});

test("reports an unconfirmed move rather than claiming success", async () => {
  const gateway: MoveStoryGateway = {
    findStoryBySlug: async (_space, slug) =>
      slug === "home"
        ? ({ id: 7, slug: "home", full_slug: "home", parent_id: 0 } as never)
        : undefined,
    findStoryFolderBySlug: async (_space, slug) =>
      slug === "global" ? { id: 10 } : undefined,
    moveStory: async () =>
      ({ id: 7, parent_id: 0, full_slug: "home" }) as never,
  };
  await expect(
    moveStory(gateway, { spaceId: 42, slug: "home", folder: "global" }),
  ).rejects.toMatchObject({ code: "CONFLICT" });
});

test("classifies a Storyblok permission failure", async () => {
  const gateway: MoveStoryGateway = {
    findStoryBySlug: async (_space, slug) =>
      slug === "home"
        ? ({ id: 7, slug: "home", full_slug: "home", parent_id: 0 } as never)
        : undefined,
    findStoryFolderBySlug: async (_space, slug) =>
      slug === "global" ? { id: 10 } : undefined,
    moveStory: async () => {
      throw new ClientError("Forbidden", {
        status: 403,
        statusText: "Forbidden",
        data: {},
      });
    },
  };
  await expect(
    moveStory(gateway, { spaceId: 42, slug: "home", folder: "global" }),
  ).rejects.toMatchObject({ code: "PERMISSION_DENIED", status: 403 });
});
