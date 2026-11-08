import { CliError } from "../../errors.ts";
import type { StoryblokGateway } from "../../storyblok/gateway.ts";

type TagGateway = Pick<
  StoryblokGateway,
  "findStoryBySlug" | "getStory" | "updateStoryTags"
>;
export interface StoryTagOperation {
  storyId: number;
  slug: string;
  currentTags: string[];
  addTags: string[];
  status: "change" | "unchanged" | "updated" | "failed";
  error?: string;
}

function tagChanges(currentTags: string[], tags: string[]): string[] {
  return tags.filter((tag) => !currentTags.includes(tag));
}

export async function planStoryTags(
  gateway: TagGateway,
  spaceId: number,
  slugs: string[],
  tags: string[],
) {
  const uniqueSlugs = [...new Set(slugs)];
  const uniqueTags = [...new Set(tags)];
  const operations: StoryTagOperation[] = [];
  const missing: string[] = [];
  for (const slug of uniqueSlugs) {
    const story = await gateway.findStoryBySlug(spaceId, slug);
    if (!story) {
      missing.push(slug);
      continue;
    }
    if (!Array.isArray(story.tag_list))
      throw new CliError(`Story '${slug}' did not include its tags.`);
    const addTags = tagChanges(story.tag_list, uniqueTags);
    operations.push({
      storyId: story.id,
      slug,
      currentTags: story.tag_list,
      addTags,
      status: addTags.length ? "change" : "unchanged",
    });
  }
  if (missing.length)
    throw new CliError(
      `Stories not found: ${missing.join(", ")}.`,
      1,
      "NOT_FOUND",
    );
  return {
    apiVersion: "unblok/story-tags-plan-v1" as const,
    target: { spaceId },
    tags: uniqueTags,
    operations,
  };
}

export async function assignStoryTags(
  gateway: TagGateway,
  spaceId: number,
  slugs: string[],
  tags: string[],
  options: { onFailure?: (storyId: number, error: unknown) => void } = {},
) {
  const plan = await planStoryTags(gateway, spaceId, slugs, tags);
  const operations: StoryTagOperation[] = [];
  for (const operation of plan.operations) {
    try {
      const story = await gateway.getStory(spaceId, operation.storyId);
      if (story.full_slug !== operation.slug || story.is_folder)
        throw new Error("Story no longer matches the requested full slug.");
      if (!Array.isArray(story.tag_list))
        throw new Error("Storyblok did not return the story's tags.");
      const addTags = tagChanges(story.tag_list, plan.tags);
      if (addTags.length)
        await gateway.updateStoryTags(spaceId, story.id, [
          ...story.tag_list,
          ...addTags,
        ]);
      operations.push({
        ...operation,
        currentTags: story.tag_list,
        addTags,
        status: addTags.length ? "updated" : "unchanged",
      });
    } catch (error) {
      options.onFailure?.(operation.storyId, error);
      operations.push({
        ...operation,
        status: "failed",
        error: error instanceof Error ? error.message : "Unexpected error",
      });
    }
  }
  return {
    apiVersion: "unblok/story-tags-assign-v1" as const,
    target: plan.target,
    tags: plan.tags,
    operations,
    summary: {
      updated: operations.filter((op) => op.status === "updated").length,
      unchanged: operations.filter((op) => op.status === "unchanged").length,
      failed: operations.filter((op) => op.status === "failed").length,
    },
  };
}
