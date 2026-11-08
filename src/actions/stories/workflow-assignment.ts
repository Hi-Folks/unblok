import type { Story, WorkflowStage } from "@storyblok/management-api-client";
import type {
  StoryblokGateway,
  WorkflowStageAssignmentInput,
} from "../../storyblok/gateway.ts";
import { listStories } from "./list-stories.ts";
import { resolveWorkflowStage } from "../workflows/workflow.ts";
import { CliError } from "../../errors.ts";

export interface WorkflowAssignmentInput {
  comment?: string;
  component?: string;
  dueDate?: string;
  ids?: number[];
  notify?: boolean;
  releaseId?: number;
  roleIds?: number[];
  search?: string;
  stage: string;
  startsWith?: string;
  userIds?: number[];
  workflow?: string;
  withoutStage?: boolean;
}

export interface WorkflowAssignmentPlanOperation {
  action: "assign" | "none";
  currentStageId?: number;
  fullSlug: string;
  status: "change" | "unchanged";
  storyId: number;
  storyName: string;
}

export interface WorkflowAssignmentPlan {
  apiVersion: "space-man/workflow-plan-v1";
  operations: WorkflowAssignmentPlanOperation[];
  stage: { id: number; name: string; workflowId: number | null };
  summary: { changes: number; unchanged: number };
  target: { spaceId: number };
}

export type WorkflowAssignmentStatus = "assigned" | "failed" | "unchanged";

export interface WorkflowAssignmentResult extends Omit<
  WorkflowAssignmentPlanOperation,
  "status"
> {
  error?: string;
  status: WorkflowAssignmentStatus;
}

export interface WorkflowAssignmentReport {
  apiVersion: "space-man/workflow-assign-v1";
  operations: WorkflowAssignmentResult[];
  stage: WorkflowAssignmentPlan["stage"];
  summary: Record<WorkflowAssignmentStatus, number>;
  target: { spaceId: number };
}

type WorkflowGateway = Pick<
  StoryblokGateway,
  | "assignWorkflowStage"
  | "getWorkflowStage"
  | "listStories"
  | "listWorkflowStages"
  | "listWorkflows"
>;

function storyOperation(
  story: Story,
  stage: WorkflowStage,
  input: WorkflowAssignmentInput,
): WorkflowAssignmentPlanOperation {
  const currentStageId =
    story.stages?.find((item) => !item.language)?.workflow_stage_id ??
    story.stage?.workflow_stage_id;
  const unchanged =
    currentStageId === stage.id &&
    !(
      input.comment ||
      input.dueDate ||
      input.notify ||
      input.releaseId ||
      input.userIds?.length ||
      input.roleIds?.length
    );
  return {
    action: unchanged ? "none" : "assign",
    ...(currentStageId === undefined ? {} : { currentStageId }),
    fullSlug: story.full_slug,
    status: unchanged ? "unchanged" : "change",
    storyId: story.id,
    storyName: story.name,
  };
}

export async function planWorkflowAssignment(
  gateway: WorkflowGateway,
  spaceId: number,
  input: WorkflowAssignmentInput,
): Promise<WorkflowAssignmentPlan> {
  const [stage, stories] = await Promise.all([
    resolveWorkflowStage(gateway, spaceId, input.stage, input.workflow),
    listStories(gateway, spaceId, {
      component: input.component,
      ids: input.ids,
      search: input.search,
      startsWith: input.startsWith,
    }),
  ]);
  const contentStories = stories.filter((story) => !story.is_folder);
  if (
    input.withoutStage &&
    contentStories.some(
      (story) => story.stage === undefined && story.stages === undefined,
    )
  ) {
    throw new CliError(
      "Storyblok did not return workflow stage data; cannot safely select unstaged stories.",
    );
  }
  const selected = input.withoutStage
    ? contentStories.filter((story) => !story.stage && !story.stages?.length)
    : contentStories;
  const operations = selected.map((story) =>
    storyOperation(story, stage, input),
  );
  return {
    apiVersion: "space-man/workflow-plan-v1",
    operations,
    stage: { id: stage.id, name: stage.name, workflowId: stage.workflow_id },
    summary: {
      changes: operations.filter((operation) => operation.status === "change")
        .length,
      unchanged: operations.filter(
        (operation) => operation.status === "unchanged",
      ).length,
    },
    target: { spaceId },
  };
}

export async function assignWorkflowStage(
  gateway: WorkflowGateway,
  spaceId: number,
  input: WorkflowAssignmentInput,
  options: {
    concurrency?: number;
    onOperation?: (operation: WorkflowAssignmentResult) => void;
    onFailure?: (storyId: number, error: unknown) => void;
  } = {},
): Promise<WorkflowAssignmentReport> {
  const plan = await planWorkflowAssignment(gateway, spaceId, input);
  const unchanged = plan.operations
    .filter((operation) => operation.status === "unchanged")
    .map((operation) => ({ ...operation, status: "unchanged" as const }));
  unchanged.forEach(options.onOperation ?? (() => {}));
  const pending = plan.operations.filter(
    (operation) => operation.status === "change",
  );
  const results: WorkflowAssignmentResult[] = [...unchanged];
  let nextIndex = 0;
  const workerCount = Math.min(
    Math.max(1, Math.floor(options.concurrency ?? 4)),
    pending.length,
  );

  const worker = async () => {
    while (nextIndex < pending.length) {
      const operation = pending[nextIndex++];
      if (!operation) return;
      const assignment: WorkflowStageAssignmentInput = {
        comment: input.comment,
        dueDate: input.dueDate,
        notify: input.notify,
        releaseId: input.releaseId,
        roleIds: input.roleIds,
        stageId: plan.stage.id,
        storyId: operation.storyId,
        userIds: input.userIds,
      };
      let result: WorkflowAssignmentResult;
      try {
        await gateway.assignWorkflowStage(spaceId, assignment);
        result = { ...operation, status: "assigned" };
      } catch (error) {
        options.onFailure?.(operation.storyId, error);
        result = {
          ...operation,
          error:
            error instanceof Error
              ? error.message
              : "Unexpected assignment failure",
          status: "failed",
        };
      }
      results.push(result);
      options.onOperation?.(result);
    }
  };
  await Promise.all(Array.from({ length: workerCount }, worker));

  const statuses: WorkflowAssignmentStatus[] = [
    "assigned",
    "unchanged",
    "failed",
  ];
  return {
    apiVersion: "space-man/workflow-assign-v1",
    operations: results.sort((left, right) => left.storyId - right.storyId),
    stage: plan.stage,
    summary: Object.fromEntries(
      statuses.map((status) => [
        status,
        results.filter((result) => result.status === status).length,
      ]),
    ) as Record<WorkflowAssignmentStatus, number>,
    target: { spaceId },
  };
}
