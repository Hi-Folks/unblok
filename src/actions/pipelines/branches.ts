import { CliError } from "../../errors.ts";
import type {
  StoryblokGateway,
  StoryblokPipelineBranch,
} from "../../storyblok/gateway.ts";
import { toUnblokError } from "../action-error.ts";

export type PipelineGateway = Pick<
  StoryblokGateway,
  "listInstalledApps" | "listPipelineBranches" | "createPipelineBranch"
>;
export interface EnsurePipelineBranchInput {
  spaceId: number;
  name: string;
  source?: string;
}
export interface EnsurePipelineBranchResult {
  status: "created" | "unchanged";
  branch: StoryblokPipelineBranch;
}
export type PipelineLookupGateway = Pick<
  StoryblokGateway,
  "listInstalledApps" | "listPipelineBranches" | "getPipelineBranch"
>;
export interface GetPipelineBranchInput {
  spaceId: number;
  reference: string;
}

async function checkPipelineApp(
  gateway: Pick<PipelineGateway, "listInstalledApps">,
  spaceId: number,
): Promise<void> {
  if (!Number.isSafeInteger(spaceId) || spaceId <= 0)
    throw new CliError("Provide a positive spaceId.", 1, "INVALID_INPUT");
  if (
    !(await gateway.listInstalledApps(spaceId)).some(
      (app) => app.slug === "branches",
    )
  )
    throw new CliError(
      "The Pipelines app is not installed. Install the 'branches' app in the space.",
      1,
      "NOT_FOUND",
    );
}
async function branches(
  gateway: Pick<PipelineGateway, "listInstalledApps" | "listPipelineBranches">,
  spaceId: number,
): Promise<StoryblokPipelineBranch[]> {
  await checkPipelineApp(gateway, spaceId);
  return gateway.listPipelineBranches(spaceId);
}
export async function listPipelineBranches(
  gateway: Pick<PipelineGateway, "listInstalledApps" | "listPipelineBranches">,
  input: { spaceId: number },
): Promise<StoryblokPipelineBranch[]> {
  try {
    return await branches(gateway, input?.spaceId);
  } catch (error) {
    throw toUnblokError(error);
  }
}

/** Retrieve a pipeline stage by numeric ID or unique exact name. */
export async function getPipelineBranch(
  gateway: PipelineLookupGateway,
  input: GetPipelineBranchInput,
): Promise<StoryblokPipelineBranch> {
  try {
    if (
      !Number.isSafeInteger(input?.spaceId) ||
      input.spaceId <= 0 ||
      typeof input.reference !== "string" ||
      !input.reference.trim() ||
      input.reference !== input.reference.trim()
    )
      throw new CliError(
        "Provide a positive spaceId and pipeline stage ID or exact name.",
        1,
        "INVALID_INPUT",
      );
    const numeric = /^\d+$/.test(input.reference);
    let id = numeric ? Number(input.reference) : undefined;
    if (numeric && (!Number.isSafeInteger(id) || id! <= 0))
      throw new CliError(
        "Provide a positive pipeline stage ID.",
        1,
        "INVALID_INPUT",
      );
    await checkPipelineApp(gateway, input.spaceId);
    if (id === undefined) {
      const matches = (
        await gateway.listPipelineBranches(input.spaceId)
      ).filter((item) => item.name === input.reference);
      if (!matches.length)
        throw new CliError(
          `Pipeline stage '${input.reference}' was not found.`,
          1,
          "NOT_FOUND",
        );
      if (matches.length > 1)
        throw new CliError(
          `Multiple pipeline stages named '${input.reference}' exist.`,
          1,
          "AMBIGUOUS",
        );
      id = matches[0]!.id;
    }
    if (!Number.isSafeInteger(id) || id <= 0)
      throw new CliError(
        "Storyblok returned an invalid pipeline stage ID.",
        1,
        "CONFLICT",
      );
    const branch = await gateway.getPipelineBranch(input.spaceId, id);
    if (
      !branch ||
      branch.id !== id ||
      typeof branch.name !== "string" ||
      !branch.name.trim() ||
      (!numeric && branch.name !== input.reference)
    )
      throw new CliError(
        "The pipeline stage could not be verified.",
        1,
        "CONFLICT",
      );
    return {
      id: branch.id,
      name: branch.name,
      ...(branch.source_id === undefined
        ? {}
        : { source_id: branch.source_id }),
    };
  } catch (error) {
    throw toUnblokError(error);
  }
}
export async function ensurePipelineBranch(
  gateway: PipelineGateway,
  input: EnsurePipelineBranchInput,
): Promise<EnsurePipelineBranchResult> {
  try {
    if (
      !input ||
      typeof input.name !== "string" ||
      !input.name.trim() ||
      (input.source !== undefined &&
        (typeof input.source !== "string" || !input.source.trim()))
    )
      throw new CliError(
        "Provide a branch name and optional source name.",
        1,
        "INVALID_INPUT",
      );
    const name = input.name.trim();
    const source = input.source?.trim();
    if (source === name)
      throw new CliError(
        "A branch cannot use itself as its source.",
        1,
        "INVALID_INPUT",
      );
    const existing = await branches(gateway, input.spaceId);
    const matches = existing.filter((item) => item.name === name);
    if (matches.length > 1)
      throw new CliError(
        `Multiple pipeline branches named '${name}' exist.`,
        1,
        "AMBIGUOUS",
      );
    let sourceId: number | undefined;
    if (source !== undefined) {
      const sources = existing.filter((item) => item.name === source);
      if (!sources.length)
        throw new CliError(
          `Pipeline source '${source}' was not found.`,
          1,
          "NOT_FOUND",
        );
      if (sources.length > 1)
        throw new CliError(
          `Pipeline source '${source}' is ambiguous.`,
          1,
          "AMBIGUOUS",
        );
      sourceId = sources[0]!.id;
    }
    if (matches[0]) {
      if (sourceId !== undefined && matches[0].source_id !== sourceId)
        throw new CliError(
          `Pipeline branch '${name}' has a different or unverifiable source.`,
          1,
          "CONFLICT",
        );
      return { status: "unchanged", branch: matches[0] };
    }
    return {
      status: "created",
      branch: await gateway.createPipelineBranch(input.spaceId, {
        name,
        ...(sourceId === undefined ? {} : { source_id: sourceId }),
      }),
    };
  } catch (error) {
    throw toUnblokError(error);
  }
}
