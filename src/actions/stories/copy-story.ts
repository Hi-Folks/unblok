import { CliError } from "../../errors.ts";
import type { StoryblokGateway } from "../../storyblok/gateway.ts";
import { toUnblokError } from "../action-error.ts";
import { isValidStoryCreationSlug } from "./create-story.ts";

export type CopyStoryGateway = Pick<
  StoryblokGateway,
  "findStoryBySlug" | "findStoryFolderBySlug" | "getStory" | "createStory"
>;
export interface CopyStoryInput {
  spaceId: number;
  source: string;
  target: string;
}
export interface CopyStoryResult {
  status: "created" | "unchanged";
  source: string;
  target: string;
  storyId: number;
}

/** Copy a story's current draft content to a missing story at an exact path. */
export async function copyStory(
  gateway: CopyStoryGateway,
  input: CopyStoryInput,
): Promise<CopyStoryResult> {
  try {
    const valid = (value: unknown): value is string =>
      typeof value === "string" &&
      value === value.trim() &&
      isValidStoryCreationSlug(value);
    if (
      !input ||
      !Number.isSafeInteger(input.spaceId) ||
      input.spaceId <= 0 ||
      !valid(input.source) ||
      !valid(input.target) ||
      input.source === input.target
    )
      throw new CliError(
        "Provide a positive spaceId and distinct exact source and target slugs.",
        2,
        "INVALID_INPUT",
      );
    const source = await gateway.findStoryBySlug(input.spaceId, input.source);
    if (!source || !Number.isSafeInteger(source.id) || source.id <= 0)
      throw new CliError(
        `Source story '${input.source}' was not found.`,
        1,
        "NOT_FOUND",
      );
    const existing = await gateway.findStoryBySlug(input.spaceId, input.target);
    if (existing) {
      if (!Number.isSafeInteger(existing.id) || existing.id <= 0)
        throw new CliError("Target story has an invalid ID.", 1, "CONFLICT");
      return {
        status: "unchanged",
        source: input.source,
        target: input.target,
        storyId: existing.id,
      };
    }
    if (await gateway.findStoryFolderBySlug(input.spaceId, input.target))
      throw new CliError(
        `A folder exists at '${input.target}'.`,
        1,
        "CONFLICT",
      );
    const story = await gateway.getStory(input.spaceId, source.id);
    if (
      !story ||
      story.id !== source.id ||
      story.full_slug !== input.source ||
      story.is_folder ||
      typeof story.name !== "string" ||
      !story.name.trim() ||
      !story.content ||
      typeof story.content !== "object" ||
      Array.isArray(story.content) ||
      typeof story.content.component !== "string"
    )
      throw new CliError(
        "Source story identity or content could not be verified.",
        1,
        "CONFLICT",
      );
    const slash = input.target.lastIndexOf("/");
    const parentPath = slash < 0 ? undefined : input.target.slice(0, slash);
    const slug = slash < 0 ? input.target : input.target.slice(slash + 1);
    const parent =
      parentPath === undefined
        ? undefined
        : await gateway.findStoryFolderBySlug(input.spaceId, parentPath);
    if (
      parentPath !== undefined &&
      (!parent || !Number.isSafeInteger(parent.id) || parent.id <= 0)
    )
      throw new CliError(
        `Folder '${parentPath}' was not found.`,
        1,
        "NOT_FOUND",
      );
    const result = await gateway.createStory(input.spaceId, {
      name: story.name,
      slug,
      content: story.content as Record<string, unknown>,
      ...(parent ? { parent_id: parent.id } : {}),
    });
    if (
      !result ||
      !Number.isSafeInteger(result.id) ||
      result.id <= 0 ||
      result.full_slug !== input.target
    )
      throw new CliError(
        "Storyblok did not confirm the copied story; inspect the target before retrying.",
        1,
        "CONFLICT",
      );
    return {
      status: "created",
      source: input.source,
      target: input.target,
      storyId: result.id,
    };
  } catch (error) {
    throw toUnblokError(error);
  }
}
