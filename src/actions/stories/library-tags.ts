import { CliError } from "../../errors.ts";
import type { StoryblokGateway } from "../../storyblok/gateway.ts";
import {
  assignStoryTags as assignTags,
  planStoryTags as planTags,
} from "./story-tags.ts";
import {
  errorInfo,
  toUnblokError,
  type UnblokErrorInfo,
} from "../action-error.ts";

export type StoryTagGateway = Pick<
  StoryblokGateway,
  "findStoryBySlug" | "getStory" | "updateStoryTags"
>;

export interface StoryTagsInput {
  spaceId: number;
  stories: readonly string[];
  tags: readonly string[];
}

function validate(input: StoryTagsInput): void {
  if (!Number.isSafeInteger(input.spaceId) || input.spaceId <= 0)
    throw new CliError(
      "spaceId must be a positive integer.",
      1,
      "INVALID_INPUT",
    );
  if (
    !Array.isArray(input.stories) ||
    !input.stories.length ||
    input.stories.some(
      (slug) =>
        typeof slug !== "string" ||
        !slug.trim() ||
        slug !== slug.trim() ||
        /[*,]/.test(slug),
    )
  )
    throw new CliError(
      "Provide at least one exact story full slug.",
      1,
      "INVALID_INPUT",
    );
  if (
    !Array.isArray(input.tags) ||
    !input.tags.length ||
    input.tags.some(
      (tag) => typeof tag !== "string" || !tag.trim() || tag !== tag.trim(),
    )
  )
    throw new CliError(
      "Provide at least one nonempty tag without surrounding whitespace.",
      1,
      "INVALID_INPUT",
    );
}

/** Preview tags to add without making changes. */
export async function planStoryTags(
  gateway: StoryTagGateway,
  input: StoryTagsInput,
): ReturnType<typeof planTags> {
  try {
    validate(input);
    return await planTags(
      gateway,
      input.spaceId,
      [...input.stories],
      [...input.tags],
    );
  } catch (error) {
    throw toUnblokError(error);
  }
}

export type StoryTagsReport = Omit<
  Awaited<ReturnType<typeof assignTags>>,
  "operations"
> & {
  operations: Array<
    Omit<
      Awaited<ReturnType<typeof assignTags>>["operations"][number],
      "error"
    > & { error?: UnblokErrorInfo }
  >;
};

/** Add tags to stories, preserving existing tags and returning per-story failures. */
export async function assignStoryTags(
  gateway: StoryTagGateway,
  input: StoryTagsInput,
): Promise<StoryTagsReport> {
  try {
    validate(input);
    const failures = new Map<number, UnblokErrorInfo>();
    const report = await assignTags(
      gateway,
      input.spaceId,
      [...input.stories],
      [...input.tags],
      { onFailure: (id, error) => failures.set(id, errorInfo(error)) },
    );
    return {
      ...report,
      operations: report.operations.map(
        ({ error: _message, ...operation }) => ({
          ...operation,
          ...(failures.has(operation.storyId)
            ? { error: failures.get(operation.storyId)! }
            : {}),
        }),
      ),
    };
  } catch (error) {
    throw toUnblokError(error);
  }
}
