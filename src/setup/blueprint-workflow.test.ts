import { describe, expect, test } from "bun:test";
import { applyBlueprintWorkflow } from "./blueprint-workflow.ts";

describe("blueprint workflow", () => {
  test("assigns unstaged stories first, then named stories, and skips matches on rerun", async () => {
    const workflows = [{ id: 5, name: "Default", is_default: true }];
    const stages = [
      {
        id: 8,
        name: "Drafting",
        workflow_id: 5,
        position: 1,
        is_default: false,
      },
      {
        id: 9,
        name: "Reviewing",
        workflow_id: 5,
        position: 2,
        is_default: false,
      },
    ];
    const stories = [
      {
        id: 1,
        name: "Home",
        full_slug: "home",
        stage: null as null | { workflow_stage_id: number },
        is_folder: false,
      },
      {
        id: 2,
        name: "Other",
        full_slug: "other",
        stage: null as null | { workflow_stage_id: number },
        is_folder: false,
      },
    ];
    const calls: string[] = [];
    const gateway = {
      listWorkflows: async () => workflows,
      listWorkflowStages: async () => stages,
      getWorkflowStage: async (_space: number, id: number) =>
        stages.find((stage) => stage.id === id),
      listStories: async (_space: number, options: { ids?: number[] }) =>
        stories.filter(
          (story) => !options.ids || options.ids.includes(story.id),
        ),
      findStoryBySlug: async (_space: number, slug: string) =>
        stories.find((story) => story.full_slug === slug),
      assignWorkflowStage: async (
        _space: number,
        input: { storyId: number; stageId: number },
      ) => {
        calls.push(`${input.storyId}:${input.stageId}`);
        stories.find((story) => story.id === input.storyId)!.stage = {
          workflow_stage_id: input.stageId,
        };
      },
    };
    const config = {
      assignUnstaged: true,
      assignments: [
        { slugs: ["home"], workflow: "Default", stage: "Reviewing" },
      ],
    };
    const operations: Array<{
      operation: string;
      key: string;
      status: string;
      error?: string;
    }> = [];
    expect(
      await applyBlueprintWorkflow(gateway as never, 42, config, operations),
    ).toBe(false);
    expect(calls).toEqual(["1:8", "2:8", "1:9"]);
    expect(
      await applyBlueprintWorkflow(gateway as never, 42, config, operations),
    ).toBe(false);
    expect(calls).toHaveLength(3);
    expect(operations.at(-1)?.status).toBe("unchanged");
  });

  test("ensures a missing standard stage even when other stages exist", async () => {
    const stages = [{ id: 8, name: "Drafting", workflow_id: 5, position: 1 }];
    const gateway = {
      listWorkflows: async () => [{ id: 5, name: "Default", is_default: true }],
      listWorkflowStages: async () => stages.slice(),
      createWorkflowStage: async (
        _id: number,
        stage: { name: string; position: number },
      ) => {
        const created = {
          id: stages.length + 8,
          name: stage.name,
          workflow_id: 5,
          position: stage.position,
        };
        stages.push(created);
        return created;
      },
      findStoryBySlug: async () => ({ id: 1 }),
      getWorkflowStage: async (_id: number, id: number) =>
        stages.find((stage) => stage.id === id),
      listStories: async () => [
        {
          id: 1,
          name: "Home",
          full_slug: "home",
          stage: { workflow_stage_id: 9 },
        },
      ],
    };
    const operations: Array<{
      operation: string;
      key: string;
      status: string;
      error?: string;
    }> = [];
    expect(
      await applyBlueprintWorkflow(
        gateway as never,
        42,
        {
          assignUnstaged: false,
          assignments: [
            { slugs: ["home"], workflow: "Default", stage: "Reviewing" },
          ],
        },
        operations,
      ),
    ).toBe(false);
    expect(stages.map((stage) => stage.name)).toEqual([
      "Drafting",
      "Reviewing",
      "Ready to Publish",
    ]);
    expect(operations.slice(0, 3).map((item) => item.status)).toEqual([
      "unchanged",
      "created",
      "created",
    ]);
  });

  test("does not create a missing custom stage", async () => {
    let writes = 0;
    const gateway = {
      listWorkflows: async () => [{ id: 5, name: "Default", is_default: true }],
      listWorkflowStages: async () => [],
      createWorkflowStage: async () => {
        writes++;
      },
    };
    await expect(
      applyBlueprintWorkflow(
        gateway as never,
        42,
        {
          assignUnstaged: false,
          assignments: [
            { slugs: ["home"], workflow: "Default", stage: "Custom" },
          ],
        },
        [],
      ),
    ).rejects.toThrow("was not found or is ambiguous");
    expect(writes).toBe(0);
  });

  test("reports partial failures and stops subsequent workflow groups", async () => {
    const stages = [{ id: 9, name: "Reviewing", workflow_id: 5, position: 1 }];
    let calls = 0;
    const gateway = {
      listWorkflows: async () => [{ id: 5, name: "Default", is_default: true }],
      listWorkflowStages: async () => stages,
      findStoryBySlug: async () => ({ id: 1 }),
      getWorkflowStage: async () => stages[0],
      listStories: async () => [
        { id: 1, name: "Home", full_slug: "home", stage: null },
      ],
      assignWorkflowStage: async () => {
        calls++;
        throw new Error("Forbidden");
      },
    };
    const operations: Array<{
      operation: string;
      key: string;
      status: string;
      error?: string;
    }> = [];
    const assignment = {
      slugs: ["home"],
      workflow: "Default",
      stage: "Reviewing",
    };
    expect(
      await applyBlueprintWorkflow(
        gateway as never,
        42,
        { assignUnstaged: false, assignments: [assignment, assignment] },
        operations,
      ),
    ).toBe(true);
    expect(calls).toBe(1);
    expect(operations[0]).toMatchObject({
      status: "failed",
      error: "Forbidden",
    });
  });

  test("initializes standard stages immediately when none exist", async () => {
    const stages: Array<{
      id: number;
      name: string;
      workflow_id: number;
      position: number;
    }> = [];
    const gateway = {
      listWorkflows: async () => [{ id: 5, name: "Default", is_default: true }],
      listWorkflowStages: async () => stages.slice(),
      createWorkflowStage: async (
        _id: number,
        stage: { name: string; position: number },
      ) => {
        const created = {
          id: stages.length + 8,
          name: stage.name,
          workflow_id: 5,
          position: stage.position,
        };
        stages.push(created);
        return created;
      },
      getWorkflowStage: async (_space: number, id: number) =>
        stages.find((stage) => stage.id === id),
      listStories: async () => [],
    };
    const operations: Array<{
      operation: string;
      key: string;
      status: string;
      error?: string;
    }> = [];
    expect(
      await applyBlueprintWorkflow(
        gateway as never,
        42,
        { assignUnstaged: true, assignments: [] },
        operations,
      ),
    ).toBe(false);
    expect(stages.map((stage) => stage.name)).toEqual([
      "Drafting",
      "Reviewing",
      "Ready to Publish",
    ]);
    expect(operations.map((item) => item.status)).toEqual([
      "created",
      "created",
      "created",
      "unchanged",
    ]);
  });
});
