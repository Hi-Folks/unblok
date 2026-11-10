import { expect, test } from "bun:test";
import { ClientError } from "@storyblok/management-api-client";
import {
  ensurePipelineBranch,
  listPipelineBranches,
  type PipelineGateway,
} from "./branches.ts";

test("creates and reuses a stage with the requested source", async () => {
  const stages: Array<{ id: number; name: string; source_id?: number | null }> =
    [{ id: 1, name: "Preview" }];
  let writes = 0;
  const gateway: PipelineGateway = {
    listInstalledApps: async () => [
      { app_id: 1, name: "Pipelines", slug: "branches" },
    ],
    listPipelineBranches: async () => stages,
    createPipelineBranch: async (_space, branch) => {
      writes++;
      const item = { id: 2, ...branch };
      stages.push(item);
      return item;
    },
  };
  const input = { spaceId: 42, name: "Go Live", source: "Preview" };
  expect(await listPipelineBranches(gateway, input)).toHaveLength(1);
  expect(await ensurePipelineBranch(gateway, input)).toEqual({
    status: "created",
    branch: { id: 2, name: "Go Live", source_id: 1 },
  });
  expect((await ensurePipelineBranch(gateway, input)).status).toBe("unchanged");
  expect(writes).toBe(1);
  stages[1]!.source_id = 9;
  await expect(ensurePipelineBranch(gateway, input)).rejects.toMatchObject({
    code: "CONFLICT",
  });
});

test("stops before creation when app or source is missing or ambiguous", async () => {
  let writes = 0;
  let apps = [{ app_id: 1, name: "Pipelines", slug: "branches" }];
  let stages = [{ id: 1, name: "Preview" }];
  const gateway: PipelineGateway = {
    listInstalledApps: async () => apps,
    listPipelineBranches: async () => stages,
    createPipelineBranch: async (_space, branch) => {
      writes++;
      return { id: 3, ...branch };
    },
  };
  const input = { spaceId: 42, name: "Go Live", source: "Preview" };
  apps = [];
  await expect(ensurePipelineBranch(gateway, input)).rejects.toMatchObject({
    code: "NOT_FOUND",
  });
  apps = [{ app_id: 1, name: "Pipelines", slug: "branches" }];
  stages = [];
  await expect(ensurePipelineBranch(gateway, input)).rejects.toMatchObject({
    code: "NOT_FOUND",
  });
  stages = [
    { id: 1, name: "Preview" },
    { id: 2, name: "Preview" },
  ];
  await expect(ensurePipelineBranch(gateway, input)).rejects.toMatchObject({
    code: "AMBIGUOUS",
  });
  expect(writes).toBe(0);
});

test("retrieves pipeline stages by ID or unique exact name", async () => {
  const { getPipelineBranch } = await import("./branches.ts");
  let branches = [{ id: 5, name: "Go Live" }];
  let listCalls = 0;
  const gateway = {
    listInstalledApps: async () => [
      { app_id: 1, name: "Pipelines", slug: "branches" },
    ],
    listPipelineBranches: async () => {
      listCalls++;
      return branches;
    },
    getPipelineBranch: async (_space: number, id: number) => ({
      id,
      name: "Go Live",
      source_id: 2,
    }),
  };
  expect(
    await getPipelineBranch(gateway as never, { spaceId: 42, reference: "5" }),
  ).toEqual({ id: 5, name: "Go Live", source_id: 2 });
  expect(listCalls).toBe(0);
  expect(
    await getPipelineBranch(gateway as never, {
      spaceId: 42,
      reference: "Go Live",
    }),
  ).toMatchObject({ id: 5 });
  branches = [];
  await expect(
    getPipelineBranch(gateway as never, { spaceId: 42, reference: "Go Live" }),
  ).rejects.toMatchObject({ code: "NOT_FOUND" });
  branches = [
    { id: 5, name: "Go Live" },
    { id: 6, name: "Go Live" },
  ];
  await expect(
    getPipelineBranch(gateway as never, { spaceId: 42, reference: "Go Live" }),
  ).rejects.toMatchObject({ code: "AMBIGUOUS" });
  await expect(
    getPipelineBranch(gateway as never, { spaceId: 42, reference: "0" }),
  ).rejects.toMatchObject({ code: "INVALID_INPUT" });
  await expect(
    getPipelineBranch(
      { ...gateway, listInstalledApps: async () => [] } as never,
      { spaceId: 42, reference: "5" },
    ),
  ).rejects.toMatchObject({ code: "NOT_FOUND" });
  await expect(
    getPipelineBranch(
      {
        ...gateway,
        getPipelineBranch: async () => {
          throw new ClientError("Forbidden", {
            status: 403,
            statusText: "Forbidden",
            data: {},
          });
        },
      } as never,
      { spaceId: 42, reference: "5" },
    ),
  ).rejects.toMatchObject({ code: "PERMISSION_DENIED", status: 403 });
});
