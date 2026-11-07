import type { Workflow, WorkflowStage } from "@storyblok/management-api-client";
import { CliError } from "../errors.ts";
import { assignWorkflowStage } from "../actions/stories/workflow-assignment.ts";
import { ensureDefaultWorkflow } from "../actions/workflows/ensure-default.ts";
import type { StoryblokGateway } from "../storyblok/gateway.ts";

export interface BlueprintWorkflow {
  assignUnstaged: boolean;
  stageId?: number;
  assignments: Array<{ slugs: string[]; workflow: string; stage: string }>;
}

function defaultStage(
  workflows: Workflow[],
  stages: WorkflowStage[],
): WorkflowStage | undefined {
  const defaults = workflows.filter((workflow) => workflow.is_default);
  if (defaults.length > 1)
    throw new CliError("Multiple default workflows were returned.");
  const workflow = defaults[0];
  if (!workflow) return undefined;
  const candidates = stages.filter(
    (stage) => stage.workflow_id === workflow.id,
  );
  const selected = candidates.filter((stage) => stage.is_default);
  if (selected.length > 1)
    throw new CliError("Multiple default workflow stages were returned.");
  return (
    selected[0] ??
    candidates.sort(
      (a, b) =>
        (a.position ?? Infinity) - (b.position ?? Infinity) || a.id - b.id,
    )[0]
  );
}

async function availableStages(
  gateway: StoryblokGateway,
  spaceId: number,
  config: BlueprintWorkflow,
  operations: Array<{ operation: string; key: string; status: string }>,
): Promise<{ workflows: Workflow[]; stages: WorkflowStage[] }> {
  let [workflows, stages] = await Promise.all([
    gateway.listWorkflows(spaceId),
    gateway.listWorkflowStages(spaceId),
  ]);
  const defaultWorkflows = workflows.filter((workflow) => workflow.is_default);
  if (defaultWorkflows.length > 1)
    throw new CliError("Multiple default workflows were returned.");
  const defaultWorkflow = defaultWorkflows[0];
  const defaultEmpty =
    !defaultWorkflow ||
    !stages.some((stage) => stage.workflow_id === defaultWorkflow.id);
  const standardStages = new Set(["Drafting", "Reviewing", "Ready to Publish"]);
  const missingStandard = config.assignments.some((assignment) => {
    if (!standardStages.has(assignment.stage)) return false;
    const matches = workflows.filter(
      (workflow) => workflow.name === assignment.workflow,
    );
    if (matches.length > 1)
      throw new CliError(`Workflow '${assignment.workflow}' is ambiguous.`);
    const isDefault =
      matches.length === 1
        ? matches[0]!.is_default
        : !defaultWorkflow && assignment.workflow === "Default";
    return (
      isDefault &&
      !stages.some(
        (stage) =>
          stage.workflow_id === matches[0]?.id &&
          stage.name === assignment.stage,
      )
    );
  });
  if (
    (defaultEmpty && config.assignUnstaged && !config.stageId) ||
    missingStandard
  ) {
    const result = await ensureDefaultWorkflow(gateway, spaceId);
    for (const stage of result.stages)
      operations.push({
        operation: "ensure-workflow-stage",
        key: stage.name,
        status: stage.status,
      });
    [workflows, stages] = await Promise.all([
      gateway.listWorkflows(spaceId),
      gateway.listWorkflowStages(spaceId),
    ]);
  }
  return { workflows, stages };
}

export async function applyBlueprintWorkflow(
  gateway: StoryblokGateway,
  spaceId: number,
  config: BlueprintWorkflow,
  operations: Array<{
    operation: string;
    key: string;
    status: string;
    error?: string;
  }>,
  onStory?: (slug: string, processed: number, failed: boolean) => void,
): Promise<boolean> {
  if (!config.assignUnstaged && !config.assignments.length) return false;
  const { workflows, stages } = await availableStages(
    gateway,
    spaceId,
    config,
    operations,
  );
  const resolved: Array<{
    workflowId: number;
    stageId: number;
    ids: number[];
  }> = [];
  for (const assignment of config.assignments) {
    const workflowsMatched = workflows.filter(
      (item) => item.name === assignment.workflow,
    );
    if (workflowsMatched.length !== 1)
      throw new CliError(
        `Workflow '${assignment.workflow}' was not found or is ambiguous.`,
      );
    const matchingStages = stages.filter(
      (stage) =>
        stage.workflow_id === workflowsMatched[0]!.id &&
        stage.name === assignment.stage,
    );
    if (matchingStages.length !== 1)
      throw new CliError(
        `Stage '${assignment.stage}' in workflow '${assignment.workflow}' was not found or is ambiguous.`,
      );
    const ids: number[] = [];
    for (const slug of assignment.slugs) {
      const story = await gateway.findStoryBySlug(spaceId, slug);
      if (!story) throw new CliError(`Story '${slug}' was not found.`);
      ids.push(story.id);
    }
    resolved.push({
      workflowId: workflowsMatched[0]!.id,
      stageId: matchingStages[0]!.id,
      ids,
    });
  }
  let failed = false;
  let processed = 0;
  const progress = {
    onOperation: (operation: { fullSlug: string; status: string }) =>
      onStory?.(operation.fullSlug, ++processed, operation.status === "failed"),
  };
  const record = (
    operation: string,
    report: Awaited<ReturnType<typeof assignWorkflowStage>>,
  ) => {
    for (const item of report.operations)
      operations.push({
        operation,
        key: item.fullSlug,
        status: item.status,
        ...(item.error ? { error: item.error } : {}),
      });
    if (report.summary.failed) failed = true;
  };
  if (config.assignUnstaged) {
    const stageId = config.stageId ?? defaultStage(workflows, stages)?.id;
    if (!stageId)
      throw new CliError(
        "No default workflow stage is available; specify workflow.stage_id.",
      );
    const report = await assignWorkflowStage(
      gateway,
      spaceId,
      { stage: String(stageId), withoutStage: true },
      progress,
    );
    record("assign-unstaged", report);
    if (!report.operations.length)
      operations.push({
        operation: "assign-unstaged",
        key: "all unstaged stories",
        status: "unchanged",
      });
    if (failed) return true;
  }
  for (const assignment of resolved) {
    record(
      "assign-workflow",
      await assignWorkflowStage(
        gateway,
        spaceId,
        {
          stage: String(assignment.stageId),
          workflow: String(assignment.workflowId),
          ids: assignment.ids,
        },
        progress,
      ),
    );
    if (failed) return true;
  }
  return failed;
}
