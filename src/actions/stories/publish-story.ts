import { CliError } from "../../errors.ts";
import type { StoryblokGateway } from "../../storyblok/gateway.ts";
import { toUnblokError } from "../action-error.ts";

export type StoryPublishGateway = Pick<
  StoryblokGateway,
  "findStoryBySlug" | "getStory" | "publishStory"
>;
export interface PublishStoryInput {
  spaceId: number;
  story: string;
}
export interface PublishStoryResult {
  status: "published" | "unchanged";
  storyId: number;
}

/** Publish the current draft unless it is already published without changes. */
export async function publishStoryIfNeeded(
  gateway: Pick<StoryblokGateway, "publishStory">,
  spaceId: number,
  story: {
    id: number;
    published?: boolean | null;
    unpublished_changes?: boolean | null;
  },
): Promise<PublishStoryResult> {
  if (story.published && !story.unpublished_changes)
    return { status: "unchanged", storyId: story.id };
  await gateway.publishStory(spaceId, story.id);
  return { status: "published", storyId: story.id };
}

/** Publish a story's current draft by exact full slug. */
export async function publishStory(
  gateway: StoryPublishGateway,
  input: PublishStoryInput,
): Promise<PublishStoryResult> {
  try {
    if (
      !input ||
      !Number.isSafeInteger(input.spaceId) ||
      input.spaceId <= 0 ||
      typeof input.story !== "string" ||
      !input.story.trim() ||
      input.story !== input.story.trim() ||
      /^\/|\/$/.test(input.story) ||
      /[*,]/.test(input.story)
    )
      throw new CliError(
        "Provide a positive spaceId and exact story full slug.",
        1,
        "INVALID_INPUT",
      );
    const match = await gateway.findStoryBySlug(input.spaceId, input.story);
    if (!match)
      throw new CliError(
        `Story '${input.story}' was not found.`,
        1,
        "NOT_FOUND",
      );
    if (!Number.isSafeInteger(match.id) || match.id <= 0)
      throw new CliError("Story lookup returned an invalid ID.", 1, "CONFLICT");
    const story = await gateway.getStory(input.spaceId, match.id);
    if (
      story.id !== match.id ||
      story.is_folder ||
      story.full_slug !== input.story ||
      typeof story.published !== "boolean" ||
      typeof story.unpublished_changes !== "boolean"
    )
      throw new CliError(
        "Story details are incomplete or do not match the requested story; publishing was stopped.",
        1,
        "CONFLICT",
      );
    return await publishStoryIfNeeded(gateway, input.spaceId, story);
  } catch (error) {
    throw toUnblokError(error);
  }
}
