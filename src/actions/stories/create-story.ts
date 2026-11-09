import { CliError } from "../../errors.ts";
import type { StoryblokGateway } from "../../storyblok/gateway.ts";
import { toUnblokError } from "../action-error.ts";

export type StoryCreateGateway = Pick<
  StoryblokGateway,
  "findStoryBySlug" | "createStory"
> &
  Partial<Pick<StoryblokGateway, "findStoryFolderBySlug">>;
export interface EnsureStoryCreatedInput {
  spaceId: number;
  name: string;
  slug: string;
  content: Record<string, unknown>;
  releaseId?: number;
}
export interface EnsureStoryCreatedResult {
  status: "created" | "unchanged";
}

function addComponentIds(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(addComponentIds);
  if (typeof value !== "object" || value === null) return value;
  const item = value as Record<string, unknown>;
  const result = Object.fromEntries(
    Object.entries(item).map(([key, child]) => [key, addComponentIds(child)]),
  );
  if (typeof item.component === "string" && !item._uid)
    result._uid = crypto.randomUUID();
  return result;
}

/** Shared creation logic; the optional resolver is used by YAML asset references. */
export async function createStoryIfMissing(
  gateway: StoryCreateGateway,
  input: EnsureStoryCreatedInput,
  resolveContent: (
    content: Record<string, unknown>,
  ) => Promise<Record<string, unknown>> = async (content) => content,
): Promise<EnsureStoryCreatedResult> {
  const existing = await gateway.findStoryBySlug(input.spaceId, input.slug);
  if (existing) {
    if (input.releaseId !== undefined) {
      const releaseIds = (existing as unknown as { release_ids?: unknown })
        .release_ids;
      if (!Array.isArray(releaseIds) || !releaseIds.includes(input.releaseId))
        throw new CliError(
          `Story '${input.slug}' already exists but its membership in the selected release could not be verified.`,
          1,
          "CONFLICT",
        );
    }
    return { status: "unchanged" };
  }
  const separator = input.slug.lastIndexOf("/");
  const folderSlug = separator < 0 ? undefined : input.slug.slice(0, separator);
  const storySlug =
    separator < 0 ? input.slug : input.slug.slice(separator + 1);
  let parentId: number | undefined;
  if (folderSlug !== undefined) {
    if (!gateway.findStoryFolderBySlug)
      throw new CliError(
        "The gateway does not support story folder lookup.",
        1,
        "INVALID_INPUT",
      );
    const folder = await gateway.findStoryFolderBySlug(
      input.spaceId,
      folderSlug,
    );
    if (!folder)
      throw new CliError(
        `Story folder '${folderSlug}' was not found.`,
        1,
        "NOT_FOUND",
      );
    if (!Number.isSafeInteger(folder.id) || folder.id <= 0)
      throw new CliError(
        `Story folder '${folderSlug}' has an invalid ID.`,
        1,
        "CONFLICT",
      );
    parentId = folder.id;
  }
  const content = await resolveContent(input.content);
  await gateway.createStory(
    input.spaceId,
    {
      name: input.name,
      slug: storySlug,
      content: addComponentIds(content) as Record<string, unknown>,
      ...(parentId === undefined ? {} : { parent_id: parentId }),
    },
    input.releaseId,
  );
  return { status: "created" };
}

/** Create a draft story unless one with the same full slug already exists. */
export async function ensureStoryCreated(
  gateway: StoryCreateGateway,
  input: EnsureStoryCreatedInput,
): Promise<EnsureStoryCreatedResult> {
  try {
    if (
      !input ||
      !Number.isSafeInteger(input.spaceId) ||
      input.spaceId <= 0 ||
      (input.releaseId !== undefined &&
        (!Number.isSafeInteger(input.releaseId) || input.releaseId <= 0)) ||
      typeof input.name !== "string" ||
      !input.name.trim() ||
      typeof input.slug !== "string" ||
      !input.slug.trim() ||
      !isValidStoryCreationSlug(input.slug) ||
      !input.content ||
      typeof input.content !== "object" ||
      Array.isArray(input.content) ||
      typeof input.content.component !== "string" ||
      !input.content.component.trim()
    )
      throw new CliError(
        "Provide a positive spaceId, name, full story slug, and content with a component.",
        1,
        "INVALID_INPUT",
      );
    return await createStoryIfMissing(gateway, {
      ...input,
      name: input.name.trim(),
      slug: input.slug.trim(),
    });
  } catch (error) {
    throw toUnblokError(error);
  }
}

export function isValidStoryCreationSlug(slug: string): boolean {
  const value = slug.trim();
  return (
    !!value &&
    !/[*,]/.test(value) &&
    value
      .split("/")
      .every(
        (part) =>
          !!part && part === part.trim() && part !== "." && part !== "..",
      )
  );
}
