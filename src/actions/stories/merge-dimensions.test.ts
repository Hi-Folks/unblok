import { expect, test } from "bun:test";
import { ClientError } from "@storyblok/management-api-client";
import {
  mergeDimensionStory,
  type MergeDimensionGateway,
} from "./merge-dimensions.ts";

test("resolves mixed references and sends the target and source in the observed direction", async () => {
  const calls: unknown[] = [];
  const gateway: MergeDimensionGateway = {
    findStoryBySlug: async (_space, slug) =>
      slug === "global/home" ? ({ id: 1 } as never) : undefined,
    getStory: async (_space, id) =>
      ({ id, full_slug: id === 1 ? "global/home" : "germany/home" }) as never,
    mergeStory: async (...args) => {
      calls.push(args);
      return {};
    },
  };
  expect(
    await mergeDimensionStory(gateway, {
      spaceId: 42,
      source: "global/home",
      target: "2",
    }),
  ).toEqual({
    status: "submitted",
    source: { id: 1, fullSlug: "global/home" },
    target: { id: 2, fullSlug: "germany/home" },
  });
  expect(calls).toEqual([[42, 2, 1]]);
});

test("rejects the same resolved story and preserves API failures", async () => {
  let writes = 0;
  const gateway: MergeDimensionGateway = {
    findStoryBySlug: async () => ({ id: 1 }) as never,
    getStory: async (_space, id) =>
      ({ id, full_slug: id === 1 ? "global/home" : "italy/home" }) as never,
    mergeStory: async () => {
      writes++;
      throw new ClientError("Forbidden", {
        status: 403,
        statusText: "Forbidden",
        data: {},
      });
    },
  };
  await expect(
    mergeDimensionStory(gateway, {
      spaceId: 42,
      source: "global/home",
      target: "1",
    }),
  ).rejects.toMatchObject({ code: "INVALID_INPUT" });
  expect(writes).toBe(0);
  await expect(
    mergeDimensionStory(gateway, {
      spaceId: 42,
      source: "global/home",
      target: "2",
    }),
  ).rejects.toMatchObject({ code: "PERMISSION_DENIED", status: 403 });
});

test("reports a background task without claiming completion", async () => {
  const gateway: MergeDimensionGateway = {
    findStoryBySlug: async () => undefined,
    getStory: async (_space, id) => ({ id, full_slug: `${id}/home` }) as never,
    mergeStory: async () => ({ background_task_id: 99 }),
  };
  expect(
    await mergeDimensionStory(gateway, {
      spaceId: 42,
      source: "1",
      target: "2",
    }),
  ).toMatchObject({ status: "queued", backgroundTaskId: 99 });
});
