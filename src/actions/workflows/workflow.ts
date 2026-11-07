import type { Workflow, WorkflowStage } from "@storyblok/management-api-client";
import { CliError } from "../../errors.ts";
import type { StoryblokGateway } from "../../storyblok/gateway.ts";

export async function listWorkflows(
  gateway: Pick<StoryblokGateway, "listWorkflows">,
  spaceId: number,
): Promise<Workflow[]> {
  return gateway.listWorkflows(spaceId);
}

export async function resolveWorkflow(
  gateway: Pick<StoryblokGateway, "listWorkflows">,
  spaceId: number,
  reference: string,
): Promise<Workflow> {
  const workflows = await gateway.listWorkflows(spaceId);
  const matches = /^\d+$/.test(reference)
    ? workflows.filter((candidate) => candidate.id === Number(reference))
    : workflows.filter((candidate) => candidate.name === reference);
  if (!matches.length) {
    throw new CliError(
      `Workflow '${reference}' was not found in space ${spaceId}.`,
    );
  }
  if (matches.length > 1)
    throw new CliError(
      `Workflow '${reference}' is ambiguous in space ${spaceId}.`,
    );
  return matches[0]!;
}

export async function listWorkflowStages(
  gateway: Pick<StoryblokGateway, "listWorkflowStages" | "listWorkflows">,
  spaceId: number,
  options: { search?: string; workflow?: string } = {},
): Promise<WorkflowStage[]> {
  const workflowId = options.workflow
    ? (await resolveWorkflow(gateway, spaceId, options.workflow)).id
    : undefined;
  return gateway.listWorkflowStages(spaceId, {
    search: options.search,
    workflowId,
  });
}

export async function resolveWorkflowStage(
  gateway: Pick<
    StoryblokGateway,
    "getWorkflowStage" | "listWorkflowStages" | "listWorkflows"
  >,
  spaceId: number,
  stageReference: string,
  workflowReference?: string,
): Promise<WorkflowStage> {
  if (/^\d+$/.test(stageReference) && Number(stageReference) > 0) {
    const stage = await gateway.getWorkflowStage(
      spaceId,
      Number(stageReference),
    );
    if (workflowReference) {
      const workflow = await resolveWorkflow(
        gateway,
        spaceId,
        workflowReference,
      );
      if (stage.workflow_id !== workflow.id) {
        throw new CliError(
          `Workflow stage ${stage.id} does not belong to workflow '${workflowReference}'.`,
          2,
        );
      }
    }
    return stage;
  }

  const workflow = workflowReference
    ? await resolveWorkflow(gateway, spaceId, workflowReference)
    : undefined;
  const stages = await gateway.listWorkflowStages(spaceId, {
    search: stageReference,
    workflowId: workflow?.id,
  });
  const matches = stages.filter(
    (stage) =>
      stage.name === stageReference &&
      (!workflow || stage.workflow_id === workflow.id),
  );
  if (matches.length === 0) {
    throw new CliError(
      `Workflow stage '${stageReference}' was not found in space ${spaceId}.`,
    );
  }
  if (matches.length > 1) {
    throw new CliError(
      `Workflow stage '${stageReference}' is ambiguous. Pass '--workflow <name-or-id>'.`,
      2,
    );
  }
  return matches[0] as WorkflowStage;
}
