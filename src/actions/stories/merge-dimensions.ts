import { CliError } from "../../errors.ts";
import type { StoryblokGateway } from "../../storyblok/gateway.ts";
import { toUnblokError } from "../action-error.ts";
import { isValidStoryCreationSlug } from "./create-story.ts";

export type MergeDimensionGateway = Pick<
  StoryblokGateway,
  "findStoryBySlug" | "getStory" | "mergeStory"
>;
export interface MergeDimensionInput {
  spaceId: number;
  source: string;
  target: string;
}
export interface MergeDimensionResult {
  status: "submitted" | "queued";
  source: { id: number; fullSlug: string };
  target: { id: number; fullSlug: string };
  backgroundTaskId?: number;
}

/** Request a Dimensions merge from one story into another. */
export async function mergeDimensionStory(
  gateway: MergeDimensionGateway,
  input: MergeDimensionInput,
): Promise<MergeDimensionResult> {
  try {
    const validRef = (value: unknown): value is string =>
      typeof value === "string" &&
      value === value.trim() &&
      isValidStoryCreationSlug(value) &&
      (!/^\d+$/.test(value) ||
        (Number.isSafeInteger(Number(value)) && Number(value) > 0));
    if (
      !input ||
      !Number.isSafeInteger(input.spaceId) ||
      input.spaceId <= 0 ||
      !validRef(input.source) ||
      !validRef(input.target)
    )
      throw new CliError(
        "Provide a positive spaceId and exact source and target story IDs or full slugs.",
        2,
        "INVALID_INPUT",
      );
    const resolve = async (ref: string) => {
      const numeric = /^\d+$/.test(ref);
      const id = numeric
        ? Number(ref)
        : (await gateway.findStoryBySlug(input.spaceId, ref))?.id;
      if (!id)
        throw new CliError(`Story '${ref}' was not found.`, 1, "NOT_FOUND");
      if (!Number.isSafeInteger(id) || id <= 0)
        throw new CliError(`Story '${ref}' has an invalid ID.`, 1, "CONFLICT");
      const story = await gateway.getStory(input.spaceId, id);
      if (
        !story ||
        story.id !== id ||
        story.is_folder ||
        !story.full_slug ||
        (!numeric && story.full_slug !== ref)
      )
        throw new CliError(
          `Story '${ref}' could not be verified.`,
          1,
          "CONFLICT",
        );
      return { id, fullSlug: story.full_slug };
    };
    const source = await resolve(input.source),
      target = await resolve(input.target);
    if (source.id === target.id)
      throw new CliError(
        "Source and target must be different stories.",
        2,
        "INVALID_INPUT",
      );
    const response = await gateway.mergeStory(
      input.spaceId,
      target.id,
      source.id,
    );
    const task =
      response && typeof response === "object" && !Array.isArray(response)
        ? (response as { background_task_id?: unknown }).background_task_id
        : undefined;
    if (
      task !== undefined &&
      (!Number.isSafeInteger(task) || (task as number) <= 0)
    )
      throw new CliError(
        "Storyblok returned an invalid background task ID; inspect the target before retrying.",
        1,
        "CONFLICT",
      );
    return {
      status: task === undefined ? "submitted" : "queued",
      source,
      target,
      ...(typeof task === "number" ? { backgroundTaskId: task } : {}),
    };
  } catch (error) {
    throw toUnblokError(error);
  }
}
