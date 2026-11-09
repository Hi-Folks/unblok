import { CliError } from "../../errors.ts";
import type { StoryblokGateway } from "../../storyblok/gateway.ts";
import type { Story } from "@storyblok/management-api-client";

export async function getStory(
  gateway: Pick<StoryblokGateway, "getStory" | "findStoryBySlug">,
  spaceId: number,
  reference: string,
): Promise<Story> {
  if (/^\d+$/.test(reference))
    return gateway.getStory(spaceId, Number(reference));
  const story = await gateway.findStoryBySlug(spaceId, reference);
  if (!story) throw new CliError(`Story '${reference}' was not found.`);
  return gateway.getStory(spaceId, story.id);
}

export async function updateStoryBlock(
  gateway: Pick<StoryblokGateway, "getStory" | "updateStoryContent">,
  spaceId: number,
  storyId: number,
  uid: string,
  fields: Record<string, unknown>,
  releaseId?: number,
): Promise<Story> {
  if (
    !uid ||
    !Object.keys(fields).length ||
    Object.keys(fields).some((key) =>
      ["_uid", "component", "__proto__", "constructor", "prototype"].includes(
        key,
      ),
    )
  )
    throw new CliError(
      "Provide a block UID and nonempty fields without _uid or component.",
    );
  const story = await gateway.getStory(spaceId, storyId, releaseId);
  if (
    !story.content ||
    typeof story.content !== "object" ||
    Array.isArray(story.content)
  )
    throw new CliError("Story content is missing or invalid.");
  const content = structuredClone(story.content) as Record<string, unknown>;
  const matches: Record<string, unknown>[] = [];
  function visit(value: unknown): void {
    if (Array.isArray(value)) {
      for (const item of value) visit(item);
      return;
    }
    if (!value || typeof value !== "object") return;
    const object = value as Record<string, unknown>;
    if (object._uid === uid) matches.push(object);
    for (const child of Object.values(object)) visit(child);
  }
  visit(content);
  if (matches.length !== 1)
    throw new CliError(
      `Expected exactly one block with UID '${uid}'; found ${matches.length}.`,
    );
  const block = matches[0]!;
  for (const key of Object.keys(fields))
    if (!Object.hasOwn(block, key))
      throw new CliError(
        `Field '${key}' does not exist on the selected block.`,
      );
  Object.assign(block, fields);
  return gateway.updateStoryContent(spaceId, storyId, content, releaseId);
}
