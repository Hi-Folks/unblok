import { isDeepStrictEqual } from "node:util";
import { CliError } from "../../errors.ts";
import type { StoryblokGateway } from "../../storyblok/gateway.ts";
import { toUnblokError } from "../action-error.ts";
import { resolveWorkflow } from "./workflow.ts";

export type EditWorkflowGateway = Pick<
  StoryblokGateway,
  "listWorkflows" | "updateWorkflow"
>;
export interface EditWorkflowInput {
  spaceId: number;
  workflow: string;
  name?: string;
  contentTypes?: string[];
  perLanguageStages?: boolean;
}
export async function editWorkflow(
  gateway: EditWorkflowGateway,
  input: EditWorkflowInput,
): Promise<{ status: "updated" | "unchanged"; workflowId: number }> {
  try {
    if (
      !input ||
      !Number.isSafeInteger(input.spaceId) ||
      input.spaceId <= 0 ||
      typeof input.workflow !== "string" ||
      !input.workflow.trim() ||
      input.workflow !== input.workflow.trim() ||
      (input.name !== undefined &&
        (typeof input.name !== "string" ||
          !input.name.trim() ||
          input.name !== input.name.trim())) ||
      (input.perLanguageStages !== undefined &&
        typeof input.perLanguageStages !== "boolean") ||
      (input.contentTypes !== undefined &&
        (!Array.isArray(input.contentTypes) ||
          input.contentTypes.some(
            (item) =>
              typeof item !== "string" || !item.trim() || item !== item.trim(),
          ) ||
          new Set(input.contentTypes).size !== input.contentTypes.length)) ||
      (input.name === undefined &&
        input.contentTypes === undefined &&
        input.perLanguageStages === undefined)
    )
      throw new CliError(
        "Provide a workflow and at least one valid field to update.",
        1,
        "INVALID_INPUT",
      );
    if (input.name !== undefined && !/^\d+$/.test(input.workflow))
      throw new CliError(
        "Use a workflow ID when renaming, so the operation can be repeated safely.",
        1,
        "INVALID_INPUT",
      );
    const existing = await resolveWorkflow(
      gateway,
      input.spaceId,
      input.workflow,
    );
    if (!Number.isSafeInteger(existing.id) || existing.id <= 0)
      throw new CliError("The workflow has an invalid ID.", 1, "CONFLICT");
    const languageMode = (
      existing as unknown as { per_language_stages?: unknown }
    ).per_language_stages;
    if (
      input.perLanguageStages !== undefined &&
      typeof languageMode !== "boolean"
    )
      throw new CliError(
        "Storyblok did not return the workflow language setting.",
        1,
        "CONFLICT",
      );
    if (
      input.contentTypes !== undefined &&
      !Array.isArray(existing.content_types)
    )
      throw new CliError(
        "Storyblok did not return workflow content types.",
        1,
        "CONFLICT",
      );
    const fields = {
      ...(input.name !== undefined && input.name !== existing.name
        ? { name: input.name }
        : {}),
      ...(input.contentTypes !== undefined &&
      !isDeepStrictEqual(input.contentTypes, existing.content_types)
        ? { content_types: input.contentTypes }
        : {}),
      ...(input.perLanguageStages !== undefined &&
      input.perLanguageStages !== languageMode
        ? { per_language_stages: input.perLanguageStages }
        : {}),
    };
    if (!Object.keys(fields).length)
      return { status: "unchanged", workflowId: existing.id };
    await gateway.updateWorkflow(input.spaceId, existing.id, fields);
    const verified = (await gateway.listWorkflows(input.spaceId)).filter(
      (item) => item.id === existing.id,
    );
    const actual = verified[0] as unknown as
      Record<string, unknown> | undefined;
    if (
      verified.length !== 1 ||
      !actual ||
      Object.entries(fields).some(
        ([key, value]) => !isDeepStrictEqual(actual[key], value),
      )
    )
      throw new CliError(
        "Workflow update could not be verified; inspect it before retrying.",
        1,
        "CONFLICT",
      );
    return { status: "updated", workflowId: existing.id };
  } catch (error) {
    throw toUnblokError(error);
  }
}
