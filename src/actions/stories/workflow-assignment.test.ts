import { describe, expect, test } from "bun:test";
import {
  assignWorkflowStage,
  planWorkflowAssignment,
} from "./workflow-assignment.ts";

describe("workflow assignment", () => {
  test("selects only stories with confirmed empty stage data", async () => {
    const assigned: number[] = [];
    const gateway = {
      getWorkflowStage: async () =>
        ({ id: 8, name: "Reviewing", workflow_id: 5 }) as never,
      listWorkflowStages: async () => [] as never,
      listWorkflows: async () => [] as never,
      listStories: async () =>
        [
          {
            id: 1,
            name: "Unstaged",
            full_slug: "one",
            stage: null,
            stages: [],
          },
          {
            id: 2,
            name: "Staged",
            full_slug: "two",
            stage: { workflow_stage_id: 4 },
          },
          {
            id: 3,
            name: "Localized",
            full_slug: "three",
            stage: null,
            stages: [{ workflow_stage_id: 5, language: "de" }],
          },
        ] as never,
      assignWorkflowStage: async (
        _spaceId: number,
        input: { storyId: number; stageId: number },
      ) => {
        assigned.push(input.storyId);
        return { id: 1, workflow_stage_id: input.stageId };
      },
    };
    const input = { stage: "8", withoutStage: true };
    const plan = await planWorkflowAssignment(gateway, 42, input);
    expect(plan.operations.map((item) => item.storyId)).toEqual([1]);
    const report = await assignWorkflowStage(gateway, 42, input);
    expect(report.summary.assigned).toBe(1);
    expect(assigned).toEqual([1]);
  });

  test("fails closed when workflow data is omitted", async () => {
    const gateway = {
      getWorkflowStage: async () =>
        ({ id: 8, name: "Reviewing", workflow_id: 5 }) as never,
      listWorkflowStages: async () => [] as never,
      listWorkflows: async () => [] as never,
      listStories: async () =>
        [{ id: 1, name: "One", full_slug: "one" }] as never,
      assignWorkflowStage: async () => {
        throw new Error("unexpected write");
      },
    };
    expect(
      planWorkflowAssignment(gateway, 42, { stage: "8", withoutStage: true }),
    ).rejects.toThrow("did not return workflow stage data");
  });
  test("plans and reports partial failures while skipping matching stages", async () => {
    const calls: number[] = [];
    const gateway = {
      getWorkflowStage: async () =>
        ({ id: 8, name: "Reviewing", workflow_id: 5 }) as never,
      listWorkflowStages: async () => [] as never,
      listWorkflows: async () => [] as never,
      listStories: async () =>
        [
          { id: 1, name: "One", full_slug: "one", stage: null },
          {
            id: 2,
            name: "Two",
            full_slug: "two",
            stage: { workflow_stage_id: 8 },
          },
          { id: 3, name: "Three", full_slug: "three", stage: null },
        ] as never,
      assignWorkflowStage: async (
        _spaceId: number,
        input: { storyId: number; stageId: number },
      ) => {
        calls.push(input.storyId);
        if (input.storyId === 3) throw new Error("Forbidden");
        return { id: 1, workflow_stage_id: input.stageId };
      },
    };
    const input = { stage: "8", ids: [1, 2, 3] };
    const plan = await planWorkflowAssignment(gateway, 42, input);
    expect(plan.summary).toEqual({ changes: 2, unchanged: 1 });
    expect(calls).toEqual([]);
    const report = await assignWorkflowStage(gateway, 42, input);
    expect(report.summary).toEqual({ assigned: 1, failed: 1, unchanged: 1 });
    expect(calls.sort()).toEqual([1, 3]);
  });
});
