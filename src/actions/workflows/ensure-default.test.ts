import { describe, expect, test } from "bun:test";
import type { WorkflowStageCreate } from "@storyblok/management-api-client";
import { ensureDefaultWorkflow } from "./ensure-default.ts";

describe("ensureDefaultWorkflow", () => {
  test("creates missing stages, preserves existing stages and is repeatable", async () => {
    const stages: Array<{ id: number; name: string; workflow_id: number }> = [
      { id: 1, name: "Drafting", workflow_id: 7 },
    ];
    const created: WorkflowStageCreate[] = [];
    const gateway = {
      listWorkflows: async () =>
        [{ id: 7, name: "Default", is_default: true }] as never,
      listWorkflowStages: async () => stages as never,
      createWorkflowStage: async (
        _space: number,
        stage: WorkflowStageCreate,
      ) => {
        created.push(stage);
        const result = {
          id: stages.length + 1,
          name: stage.name,
          workflow_id: 7,
        };
        stages.push(result);
        return result as never;
      },
    };
    const result = await ensureDefaultWorkflow(gateway, 42);
    expect(result.stages.map((stage) => stage.status)).toEqual([
      "unchanged",
      "created",
      "created",
    ]);
    expect(
      created.map((stage) => [
        stage.name,
        stage.workflow_id,
        stage.allow_publish,
      ]),
    ).toEqual([
      ["Reviewing", 7, false],
      ["Ready to Publish", 7, true],
    ]);
    expect(
      (await ensureDefaultWorkflow(gateway, 42)).stages.map(
        (stage) => stage.status,
      ),
    ).toEqual(["unchanged", "unchanged", "unchanged"]);
    expect(created).toHaveLength(2);
  });

  test("attempts default initialization through a stage without a workflow ID", async () => {
    let initialized = false;
    const calls: WorkflowStageCreate[] = [];
    const gateway = {
      listWorkflows: async () =>
        initialized
          ? ([{ id: 7, name: "Default", is_default: true }] as never)
          : [],
      listWorkflowStages: async () => [] as never,
      createWorkflowStage: async (
        _space: number,
        stage: WorkflowStageCreate,
      ) => {
        calls.push(stage);
        initialized = true;
        return { id: calls.length, name: stage.name, workflow_id: 7 } as never;
      },
    };
    const result = await ensureDefaultWorkflow(gateway, 42);
    expect(calls[0]?.workflow_id).toBeUndefined();
    expect(calls[1]?.workflow_id).toBe(7);
    expect(result.stages).toHaveLength(3);
  });

  test("stops if a default workflow cannot be verified", async () => {
    let writes = 0;
    const gateway = {
      listWorkflows: async () => [],
      listWorkflowStages: async () => [],
      createWorkflowStage: async () => {
        writes++;
        return { id: 1, workflow_id: null } as never;
      },
    };
    await expect(ensureDefaultWorkflow(gateway, 42)).rejects.toThrow(
      "could not verify a default workflow",
    );
    expect(writes).toBe(1);
  });
});
