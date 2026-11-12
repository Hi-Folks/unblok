import { CliError } from "../../errors.ts";
import type { StoryblokGateway } from "../../storyblok/gateway.ts";
import { toUnblokError } from "../action-error.ts";
import { isValidStoryCreationSlug } from "./create-story.ts";

export type MoveStoryGateway = Pick<
  StoryblokGateway,
  "findStoryBySlug" | "findStoryFolderBySlug" | "moveStory"
>;
export interface MoveStoryInput {
  spaceId: number;
  slug: string;
  folder: string;
}
export interface MoveStoryResult {
  status: "moved" | "unchanged";
  storyId: number;
  from: string;
  to: string;
}

/** Move one exact story into an existing folder without publishing it. */
export async function moveStory(
  gateway: MoveStoryGateway,
  input: MoveStoryInput,
): Promise<MoveStoryResult> {
  try {
    if (
      !input ||
      !Number.isSafeInteger(input.spaceId) ||
      input.spaceId <= 0 ||
      typeof input.slug !== "string" ||
      input.slug !== input.slug.trim() ||
      !isValidStoryCreationSlug(input.slug) ||
      typeof input.folder !== "string" ||
      input.folder !== input.folder.trim() ||
      !isValidStoryCreationSlug(input.folder)
    )
      throw new CliError(
        "Provide a positive spaceId, an exact story slug, and an existing folder path.",
        2,
        "INVALID_INPUT",
      );
    const story = await gateway.findStoryBySlug(input.spaceId, input.slug);
    if (!story)
      throw new CliError(
        `Story '${input.slug}' was not found.`,
        1,
        "NOT_FOUND",
      );
    const folder = await gateway.findStoryFolderBySlug(
      input.spaceId,
      input.folder,
    );
    if (!folder)
      throw new CliError(
        `Story folder '${input.folder}' was not found.`,
        1,
        "NOT_FOUND",
      );
    if (
      !Number.isSafeInteger(story.id) ||
      story.id <= 0 ||
      !Number.isSafeInteger(folder.id) ||
      folder.id <= 0 ||
      typeof story.slug !== "string" ||
      !isValidStoryCreationSlug(story.slug) ||
      story.slug.includes("/")
    )
      throw new CliError(
        "Storyblok returned an invalid story or folder.",
        1,
        "CONFLICT",
      );
    const to = `${input.folder}/${story.slug}`;
    if (story.parent_id === folder.id)
      return {
        status: "unchanged",
        storyId: story.id,
        from: input.slug,
        to: story.full_slug,
      };
    if (
      (await gateway.findStoryBySlug(input.spaceId, to)) ||
      (await gateway.findStoryFolderBySlug(input.spaceId, to))
    )
      throw new CliError(`An entry already exists at '${to}'.`, 1, "CONFLICT");
    const moved = await gateway.moveStory(input.spaceId, story.id, folder.id);
    if (
      !moved ||
      moved.id !== story.id ||
      moved.parent_id !== folder.id ||
      typeof moved.full_slug !== "string"
    )
      throw new CliError(
        "Storyblok did not confirm the moved story's destination. Inspect the story before retrying.",
        1,
        "CONFLICT",
      );
    return {
      status: "moved",
      storyId: story.id,
      from: input.slug,
      to: moved.full_slug,
    };
  } catch (error) {
    throw toUnblokError(error);
  }
}
