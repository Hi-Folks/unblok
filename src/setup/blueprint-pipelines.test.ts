import { expect, test } from "bun:test";
import {
  applySupportedBlueprint,
  compileSupportedBlueprint,
} from "./blueprint-apply.ts";
import { compilePipelineBranches } from "./blueprint-pipelines.ts";

test("creates and reuses a stage when Preview is not returned as a branch", async () => {
  const stages: Array<{ id: number; name: string }> = [];
  let writes = 0;
  const gateway = {
    listInstalledApps: async () => [
      { app_id: 7, name: "Pipelines", slug: "branches" },
    ],
    listPipelineBranches: async () => stages,
    createPipelineBranch: async (
      _space: number,
      branch: { name: string; source_id?: number },
    ) => {
      writes++;
      expect(branch).toEqual({ name: "Go Live" });
      const result = { id: 2, ...branch };
      stages.push(result);
      return result;
    },
  };
  const blueprint = compileSupportedBlueprint({
    version: 1,
    pipelines: { create: [{ name: "Go Live" }] },
  });
  expect(
    (await applySupportedBlueprint(gateway as never, 42, blueprint)).operations,
  ).toMatchObject([{ status: "created" }]);
  expect(
    (await applySupportedBlueprint(gateway as never, 42, blueprint)).operations,
  ).toMatchObject([{ status: "unchanged" }]);
  expect(writes).toBe(1);
});

test("installs Pipelines and creates Go Live once from Preview", async () => {
  let installed = false;
  let writes = 0;
  const stages: Array<{ id: number; name: string; source_id?: number }> = [
    { id: 1, name: "Preview" },
  ];
  const gateway = {
    listInstalledApps: async () =>
      installed ? [{ app_id: 7, name: "Pipelines", slug: "branches" }] : [],
    listAvailableApps: async () => [
      { id: 7, name: "Pipelines", slug: "branches" },
    ],
    installApp: async () => {
      installed = true;
      return { app_id: 7, name: "Pipelines", slug: "branches" };
    },
    listPipelineBranches: async () => stages,
    createPipelineBranch: async (
      _space: number,
      branch: { name: string; source_id?: number },
    ) => {
      writes++;
      const result = { id: 2, ...branch };
      stages.push(result);
      return result;
    },
  };
  const blueprint = compileSupportedBlueprint({
    version: 1,
    apps: { install: ["branches"] },
    pipelines: { create: [{ name: "Go Live", source: "Preview" }] },
  });
  const first = await applySupportedBlueprint(gateway as never, 42, blueprint);
  expect(first.operations).toMatchObject([
    { operation: "install-app", status: "installed" },
    { operation: "create-pipeline-branch", status: "created" },
  ]);
  const second = await applySupportedBlueprint(gateway as never, 42, blueprint);
  expect(second.operations).toMatchObject([
    { operation: "install-app", status: "unchanged" },
    { operation: "create-pipeline-branch", status: "unchanged" },
  ]);
  expect(stages[1]).toEqual({ id: 2, name: "Go Live", source_id: 1 });
  expect(writes).toBe(1);
});

test("reports a missing source and later stages as not run", async () => {
  const gateway = {
    listInstalledApps: async () => [
      { app_id: 7, name: "Pipelines", slug: "branches" },
    ],
    listPipelineBranches: async () => [],
  };
  const blueprint = compileSupportedBlueprint({
    version: 1,
    pipelines: {
      create: [{ name: "Go Live", source: "Preview" }, { name: "Later" }],
    },
  });
  const report = await applySupportedBlueprint(gateway as never, 42, blueprint);
  expect(report.operations).toMatchObject([
    { operation: "create-pipeline-branch", key: "Go Live", status: "failed" },
    { operation: "create-pipeline-branch", key: "Later", status: "not_run" },
  ]);
});

test("rejects duplicate names, self sources and unknown fields", () => {
  expect(() =>
    compilePipelineBranches({
      create: [{ name: "Go Live" }, { name: "Go Live" }],
    }),
  ).toThrow();
  expect(() =>
    compilePipelineBranches({
      create: [{ name: "Go Live", source: "Go Live" }],
    }),
  ).toThrow();
  expect(() =>
    compilePipelineBranches({
      create: [{ name: "Go Live", url: "https://example.com" }],
    }),
  ).toThrow();
});
