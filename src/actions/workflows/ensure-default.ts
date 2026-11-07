import type {
  Workflow,
  WorkflowStage,
  WorkflowStageCreate,
} from "@storyblok/management-api-client";
import { CliError } from "../../errors.ts";
import type { StoryblokGateway } from "../../storyblok/gateway.ts";

const standardStages: Array<WorkflowStageCreate> = [
  {
    name: "Drafting",
    color: "#babcb6",
    position: 1,
    allow_publish: false,
    is_default: false,
    allow_all_stages: true,
    allow_all_users: true,
  },
  {
    name: "Reviewing",
    color: "#ffcc12",
    position: 2,
    allow_publish: false,
    is_default: false,
    allow_all_stages: true,
    allow_all_users: true,
  },
  {
    name: "Ready to Publish",
    color: "#1bb300",
    position: 3,
    allow_publish: true,
    is_default: false,
    allow_all_stages: true,
    allow_all_users: true,
  },
];

type WorkflowGateway = Pick<
  StoryblokGateway,
  "listWorkflows" | "listWorkflowStages" | "createWorkflowStage"
>;

function defaultWorkflow(workflows: Workflow[]): Workflow | undefined {
  const defaults = workflows.filter((workflow) => workflow.is_default);
  if (defaults.length > 1)
    throw new CliError(
      "Multiple default workflows were returned; cannot safely initialize stages.",
    );
  return defaults[0];
}

function findStage(
  stages: WorkflowStage[],
  name: string,
): WorkflowStage | undefined {
  const matches = stages.filter((stage) => stage.name === name);
  if (matches.length > 1)
    throw new CliError(
      `Multiple '${name}' stages exist in the default workflow.`,
    );
  return matches[0];
}

export async function ensureDefaultWorkflow(
  gateway: WorkflowGateway,
  spaceId: number,
) {
  const results: Array<{
    name: string;
    status: "created" | "unchanged";
    id: number;
  }> = [];
  let workflow = defaultWorkflow(await gateway.listWorkflows(spaceId));
  for (const definition of standardStages) {
    // Refresh before every write: Storyblok may initialize stages asynchronously.
    workflow =
      defaultWorkflow(await gateway.listWorkflows(spaceId)) ?? workflow;
    if (!workflow) {
      // Storyblok documents an omitted workflow_id as targeting the default workflow.
      const created = await gateway.createWorkflowStage(spaceId, definition);
      workflow = defaultWorkflow(await gateway.listWorkflows(spaceId));
      if (!workflow || created.workflow_id !== workflow.id) {
        throw new CliError(
          `Created stage '${definition.name}' but could not verify a default workflow. Inspect the space before retrying.`,
        );
      }
      results.push({
        name: definition.name,
        status: "created",
        id: created.id,
      });
      continue;
    }
    const stages = await gateway.listWorkflowStages(spaceId, {
      workflowId: workflow.id,
    });
    // Verify scope even if the API ignores its filter.
    const existing = findStage(
      stages.filter((stage) => stage.workflow_id === workflow?.id),
      definition.name,
    );
    if (existing) {
      results.push({
        name: definition.name,
        status: "unchanged",
        id: existing.id,
      });
      continue;
    }
    const created = await gateway.createWorkflowStage(spaceId, {
      ...definition,
      workflow_id: workflow.id,
    });
    if (created.workflow_id !== workflow.id) {
      throw new CliError(
        `Created stage '${definition.name}' but it was not returned in the expected default workflow. Inspect the space before retrying.`,
      );
    }
    results.push({ name: definition.name, status: "created", id: created.id });
  }
  return {
    apiVersion: "unblok/workflow-ensure-v1" as const,
    target: { spaceId },
    workflow: { id: workflow!.id, name: workflow!.name },
    stages: results,
  };
}
