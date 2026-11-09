import { CliError } from "../../errors.ts";
import { isDeepStrictEqual } from "node:util";
import type { StoryblokGateway } from "../../storyblok/gateway.ts";
import { updateStoryBlock } from "./content.ts";

export interface StoryBlockUpdate {
  story_slug: string;
  component: string;
  fields: Record<string, unknown>;
  release_id?: number;
  release?: string;
}

export async function reconcileStoryBlock(
  gateway: Pick<
    StoryblokGateway,
    "findStoryBySlug" | "getStory" | "updateStoryContent"
  >,
  spaceId: number,
  update: StoryBlockUpdate,
  expectedId?: number,
  allowChanges = true,
  releaseId?: number,
): Promise<boolean> {
  const found =
    expectedId === undefined
      ? await gateway.findStoryBySlug(spaceId, update.story_slug)
      : undefined;
  const storyId = expectedId ?? found?.id;
  if (
    typeof storyId !== "number" ||
    !Number.isSafeInteger(storyId) ||
    storyId <= 0
  )
    throw new CliError(
      `Story '${update.story_slug}' was not found or does not match its experiment mapping.`,
      1,
      "NOT_FOUND",
    );
  const story = await gateway.getStory(spaceId, storyId, releaseId);
  if (
    story.id !== storyId ||
    story.full_slug !== update.story_slug ||
    story.is_folder
  )
    throw new CliError(`Story '${update.story_slug}' no longer matches.`);
  const matches: Record<string, unknown>[] = [];
  function visit(value: unknown): void {
    if (Array.isArray(value)) {
      value.forEach(visit);
      return;
    }
    if (!value || typeof value !== "object") return;
    const node = value as Record<string, unknown>;
    if (node.component === update.component) matches.push(node);
    Object.values(node).forEach(visit);
  }
  visit(story.content);
  if (matches.length !== 1 || typeof matches[0]?._uid !== "string")
    throw new CliError(
      `Expected exactly one '${update.component}' block with a UID; found ${matches.length}.`,
      1,
      matches.length > 1 ? "AMBIGUOUS" : "NOT_FOUND",
    );
  if (
    Object.keys(update.fields).some((key) => !Object.hasOwn(matches[0]!, key))
  )
    throw new CliError(
      "A requested field does not exist on the selected block.",
      1,
      "INVALID_INPUT",
    );
  if (
    Object.entries(update.fields).every(([key, value]) =>
      isDeepStrictEqual(matches[0]![key], value),
    )
  )
    return false;
  if (!allowChanges)
    throw new CliError(
      "Variant content differs while the experiment is running; inspect it before changing it.",
    );
  await updateStoryBlock(
    gateway,
    spaceId,
    storyId,
    matches[0]._uid,
    update.fields,
    releaseId,
  );
  return true;
}
