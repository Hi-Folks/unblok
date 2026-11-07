import type { Workflow, WorkflowStage } from "@storyblok/management-api-client";
import { formatColumns } from "../../cli/columns.ts";

export function formatWorkflowList(
  workflows: Workflow[],
  width?: number,
): string {
  return formatColumns(
    ["ID", "NAME", "DEFAULT", "CONTENT TYPES"],
    workflows.map((workflow) => [
      String(workflow.id),
      workflow.name,
      workflow.is_default ? "yes" : "no",
      workflow.content_types.join(", ") || "all",
    ]),
    width,
    { wrapColumn: 1 },
  );
}

export function formatWorkflowStageList(
  stages: WorkflowStage[],
  width?: number,
): string {
  return formatColumns(
    ["ID", "NAME", "WORKFLOW", "DEFAULT"],
    stages.map((stage) => [
      String(stage.id),
      stage.name,
      String(stage.workflow_id ?? "—"),
      stage.is_default ? "yes" : "no",
    ]),
    width,
    { wrapColumn: 1 },
  );
}
