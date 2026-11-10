import { CliError } from "../../errors.ts";
import type { StoryblokGateway } from "../../storyblok/gateway.ts";
import { resolveWorkflowStage } from "../workflows/workflow.ts";
import { editWorkflow } from "../workflows/edit-workflow.ts";

export type TranslationReviewGateway = Pick<
  StoryblokGateway,
  | "getWorkflowStage"
  | "listWorkflowStages"
  | "listWorkflows"
  | "updateWorkflow"
  | "assignWorkflowStage"
>;
export interface TranslationReviewOptions {
  stage: string;
  workflow?: string;
}

/** Resolve the existing review stage and enable per-language stages for its workflow. */
export async function prepareTranslationReview(
  gateway: TranslationReviewGateway,
  spaceId: number,
  options: TranslationReviewOptions,
): Promise<number> {
  if (
    !options ||
    typeof options.stage !== "string" ||
    !options.stage.trim() ||
    options.stage !== options.stage.trim() ||
    (options.workflow !== undefined &&
      (typeof options.workflow !== "string" ||
        !options.workflow.trim() ||
        options.workflow !== options.workflow.trim()))
  )
    throw new CliError(
      "Provide a review stage and optional workflow name or ID.",
      1,
      "INVALID_INPUT",
    );
  const stage = await resolveWorkflowStage(
    gateway,
    spaceId,
    options.stage,
    options.workflow,
  );
  if (
    !Number.isSafeInteger(stage.id) ||
    stage.id <= 0 ||
    !Number.isSafeInteger(stage.workflow_id) ||
    !stage.workflow_id ||
    stage.workflow_id <= 0
  )
    throw new CliError(
      "The review stage has no valid workflow.",
      1,
      "CONFLICT",
    );
  await editWorkflow(gateway, {
    spaceId,
    workflow: String(stage.workflow_id),
    perLanguageStages: true,
  });
  return stage.id;
}
