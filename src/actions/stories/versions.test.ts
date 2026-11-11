import { expect, test } from "bun:test";
import { ClientError } from "@storyblok/management-api-client";
import {
  compareStoryVersions,
  compareStoryToPreviousVersion,
  listStoryVersions,
} from "./versions.ts";

test("compares the current draft with the prior saved version when latest matches", async () => {
  const client = {
    ...gateway(),
    getStory: async () => ({
      id: 7,
      full_slug: "home",
      content: { title: "Current" },
    }),
    listStoryVersions: async () => [
      {
        id: 1,
        storyId: 7,
        createdAt: "2026-01-01T00:00:00Z",
        status: "draft",
        content: { title: "Before" },
      },
      {
        id: 3,
        storyId: 7,
        createdAt: "2026-01-01T12:00:00Z",
        status: "workflow_stage_changed",
        content: { title: "Before" },
      },
      {
        id: 4,
        storyId: 7,
        createdAt: "2026-01-04T00:00:00Z",
        status: "draft",
        releaseId: 12,
        content: { title: "Release" },
      },
      {
        id: 2,
        storyId: 7,
        createdAt: "2026-01-02T00:00:00Z",
        status: "draft",
        content: { title: "Current" },
      },
    ],
  };
  const report = await compareStoryToPreviousVersion(client as never, {
    spaceId: 42,
    story: "home",
  });
  expect(report).toMatchObject({
    from: 3,
    to: "current",
    selection: "previous_after_matching_latest",
    changes: [
      { path: "/title", type: "changed", before: "Before", after: "Current" },
    ],
  });
});

test("uses the preceding workflow snapshot when release history is newer than the current draft", async () => {
  const client = {
    ...gateway(),
    getStory: async () => ({
      id: 7,
      full_slug: "home",
      content: { title: "Current" },
    }),
    listStoryVersions: async () => [
      {
        id: 5,
        storyId: 7,
        createdAt: "2026-01-05T00:00:00Z",
        status: "draft",
        releaseId: 12,
        content: { title: "Release" },
      },
      {
        id: 4,
        storyId: 7,
        createdAt: "2026-01-04T00:00:00Z",
        status: "draft",
        content: { title: "Current" },
      },
      {
        id: 3,
        storyId: 7,
        createdAt: "2026-01-03T00:00:00Z",
        status: "workflow_stage_changed",
        content: { title: "Before" },
      },
      {
        id: 2,
        storyId: 7,
        createdAt: "2026-01-02T00:00:00Z",
        status: "workflow_stage_changed",
        content: { title: "Earlier" },
      },
      {
        id: 1,
        storyId: 7,
        createdAt: "2026-01-01T00:00:00Z",
        status: "workflow_stage_changed",
        content: { title: "First" },
      },
    ],
  };
  const report = await compareStoryToPreviousVersion(client as never, {
    spaceId: 42,
    story: "home",
  });
  expect(report).toMatchObject({
    from: 3,
    to: "current",
    changes: [{ path: "/title", before: "Before", after: "Current" }],
  });
});

test("uses the latest saved entry if current content differs and reports unavailable or ambiguous history", async () => {
  const client = {
    ...gateway(),
    getStory: async () => ({
      id: 7,
      full_slug: "home",
      content: { title: "Current" },
    }),
    listStoryVersions: async () => [
      {
        id: 2,
        storyId: 7,
        createdAt: "2026-01-02T00:00:00Z",
        content: { title: "Before" },
      },
    ],
  };
  expect(
    await compareStoryToPreviousVersion(client as never, {
      spaceId: 42,
      story: "home",
    }),
  ).toMatchObject({
    from: 2,
    to: "current",
    selection: "latest_before_current",
  });
  await expect(
    compareStoryToPreviousVersion(
      {
        ...client,
        listStoryVersions: async () => [
          {
            id: 2,
            storyId: 7,
            createdAt: "2026-01-02T00:00:00Z",
            content: { title: "Current" },
          },
        ],
      } as never,
      { spaceId: 42, story: "home" },
    ),
  ).rejects.toMatchObject({ code: "NOT_FOUND" });
  await expect(
    compareStoryToPreviousVersion(
      {
        ...client,
        listStoryVersions: async () => [
          { id: 2, storyId: 7, content: { title: "Before" } },
        ],
      } as never,
      { spaceId: 42, story: "home" },
    ),
  ).rejects.toMatchObject({ code: "CONFLICT" });
  await expect(
    compareStoryToPreviousVersion(
      {
        ...client,
        listStoryVersions: async () => [
          { id: 2, storyId: 7, createdAt: "2026-01-02T00:00:00Z", content: {} },
          { id: 3, storyId: 7, createdAt: "2026-01-02T00:00:00Z", content: {} },
        ],
      } as never,
      { spaceId: 42, story: "home" },
    ),
  ).rejects.toMatchObject({ code: "AMBIGUOUS" });
});

test("explains the returned and excluded history when no previous saved version is available", async () => {
  const client = {
    ...gateway(),
    getStory: async () => ({
      id: 7,
      full_slug: "home",
      content: { title: "Current" },
    }),
    listStoryVersions: async () => [
      {
        id: 1,
        storyId: 7,
        createdAt: "2026-01-01T00:00:00Z",
        content: { title: "Current" },
      },
      {
        id: 2,
        storyId: 7,
        createdAt: "2026-01-02T00:00:00Z",
        releaseId: 12,
        content: { title: "Current" },
      },
    ],
  };
  await expect(
    compareStoryToPreviousVersion(client as never, {
      spaceId: 42,
      story: "home",
    }),
  ).rejects.toThrow("history returned 2; release-specific entries excluded: 1");
});

function gateway() {
  return {
    findStoryBySlug: async () => ({ id: 7 }),
    getStory: async () => ({ id: 7, full_slug: "home", is_folder: false }),
    listStoryVersions: async (
      _space: number,
      _story: number,
      options: { includeContent?: boolean },
    ) =>
      options.includeContent
        ? [
            {
              id: 1,
              storyId: 7,
              content: {
                title: "Old",
                body: [{ _uid: "a", text: "Before" }],
                "a/b": 1,
                removed: true,
              },
            },
            {
              id: 2,
              storyId: 7,
              content: {
                title: "New",
                body: [{ _uid: "a", text: "After" }, { _uid: "b" }],
                "a/b": 2,
                added: null,
              },
            },
          ]
        : [{ id: 2, storyId: 7, createdAt: "2026-01-01", status: "draft" }],
  };
}

test("lists metadata using a default limit and no content", async () => {
  let options: unknown;
  const client = {
    ...gateway(),
    listStoryVersions: async (
      _space: number,
      _story: number,
      value: unknown,
    ) => {
      options = value;
      return [{ id: 2, storyId: 7 }];
    },
  };
  const result = await listStoryVersions(client as never, {
    spaceId: 42,
    story: "home",
  });
  expect(result).toMatchObject({
    story: { id: 7, fullSlug: "home" },
    versions: [{ id: 2 }],
  });
  expect(options).toEqual({ limit: 25 });
});

test("compares nested content, array indices, added and removed keys using JSON pointers", async () => {
  const result = await compareStoryVersions(gateway() as never, {
    spaceId: 42,
    story: "home",
    from: 1,
    to: 2,
  });
  expect(result.changes).toEqual([
    { path: "/a~1b", type: "changed", before: 1, after: 2 },
    { path: "/added", type: "added", after: null },
    { path: "/body/0/text", type: "changed", before: "Before", after: "After" },
    { path: "/body/1", type: "added", after: { _uid: "b" } },
    { path: "/removed", type: "removed", before: true },
    { path: "/title", type: "changed", before: "Old", after: "New" },
  ]);
});

test("rejects invalid requests before API calls and classifies missing content and API failures", async () => {
  let calls = 0;
  const client = {
    ...gateway(),
    findStoryBySlug: async () => {
      calls++;
      return { id: 7 };
    },
  };
  await expect(
    compareStoryVersions(client as never, {
      spaceId: 42,
      story: "home",
      from: 0,
      to: 2,
    }),
  ).rejects.toMatchObject({ code: "INVALID_INPUT" });
  await expect(
    listStoryVersions(client as never, {
      spaceId: 42,
      story: "home",
      limit: 0,
    }),
  ).rejects.toMatchObject({ code: "INVALID_INPUT" });
  expect(calls).toBe(0);
  await expect(
    compareStoryVersions(client as never, {
      spaceId: 42,
      story: "home",
      from: 1,
      to: 3,
    }),
  ).rejects.toMatchObject({ code: "NOT_FOUND" });
  const missingContent = {
    ...client,
    listStoryVersions: async () => [
      { id: 1, storyId: 7 },
      { id: 2, storyId: 7, content: {} },
    ],
  };
  await expect(
    compareStoryVersions(missingContent as never, {
      spaceId: 42,
      story: "home",
      from: 1,
      to: 2,
    }),
  ).rejects.toMatchObject({ code: "CONFLICT" });
  const denied = {
    ...client,
    listStoryVersions: async () => {
      throw new ClientError("Forbidden", {
        status: 403,
        statusText: "Forbidden",
        data: {},
      });
    },
  };
  await expect(
    listStoryVersions(denied as never, { spaceId: 42, story: "home" }),
  ).rejects.toMatchObject({ code: "PERMISSION_DENIED", status: 403 });
});
