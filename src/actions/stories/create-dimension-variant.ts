import { CliError } from "../../errors.ts";
import type { StoryblokGateway } from "../../storyblok/gateway.ts";
import { toUnblokError, UnblokError } from "../action-error.ts";
import { isValidStoryCreationSlug } from "./create-story.ts";
import { listDimensionsFolders } from "../apps/list-dimensions.ts";

export type CreateDimensionVariantGateway = Pick<
  StoryblokGateway,
  | "getSpace"
  | "listStories"
  | "getStory"
  | "findStoryBySlug"
  | "duplicateStoryToDimension"
>;
export interface CreateDimensionVariantInput {
  spaceId: number;
  story: string;
  folder: string;
}
export async function createDimensionVariant(
  gateway: CreateDimensionVariantGateway,
  input: CreateDimensionVariantInput,
): Promise<{
  status: "created" | "unchanged";
  story: { id: number; fullSlug: string };
  folder: string;
}> {
  try {
    if (
      !input ||
      !Number.isSafeInteger(input.spaceId) ||
      input.spaceId <= 0 ||
      typeof input.story !== "string" ||
      input.story !== input.story.trim() ||
      !isValidStoryCreationSlug(input.story) ||
      typeof input.folder !== "string" ||
      input.folder !== input.folder.trim() ||
      !isValidStoryCreationSlug(input.folder) ||
      input.folder.includes("/")
    )
      throw new CliError(
        "Provide a positive spaceId, exact story slug or ID, and root folder path.",
        2,
        "INVALID_INPUT",
      );
    const numeric = /^\d+$/.test(input.story);
    const sourceId = numeric
      ? Number(input.story)
      : (await gateway.findStoryBySlug(input.spaceId, input.story))?.id;
    if (!sourceId && !numeric)
      throw new CliError(
        `Story '${input.story}' was not found.`,
        1,
        "NOT_FOUND",
      );
    if (!sourceId || !Number.isSafeInteger(sourceId) || sourceId <= 0)
      throw new CliError("Provide a positive story ID.", 2, "INVALID_INPUT");
    const source = await gateway.getStory(input.spaceId, sourceId);
    if (
      !source ||
      source.id !== sourceId ||
      source.is_folder ||
      !source.full_slug ||
      (!numeric && source.full_slug !== input.story)
    )
      throw new CliError(
        "Source story identity could not be verified.",
        1,
        "CONFLICT",
      );
    if (source.full_slug.startsWith(`${input.folder}/`))
      throw new CliError(
        "The source story is already in the destination folder.",
        2,
        "INVALID_INPUT",
      );
    const folders = await listDimensionsFolders(gateway, {
      spaceId: input.spaceId,
    });
    const folder = folders.find((item) => item.path === input.folder);
    if (!folder)
      throw new CliError(
        `Folder '${input.folder}' is not configured in Dimensions.`,
        1,
        "NOT_FOUND",
      );
    const alternates = (source as unknown as { alternates?: unknown })
      .alternates;
    if (
      !Array.isArray(alternates) ||
      alternates.some(
        (item) =>
          !item ||
          typeof item !== "object" ||
          !Number.isSafeInteger(item.id) ||
          item.id <= 0 ||
          typeof item.full_slug !== "string",
      )
    )
      throw new CliError(
        "Storyblok did not return valid alternate story data; inspect the source before retrying.",
        1,
        "CONFLICT",
      );
    const matches = alternates.filter((item) =>
      item.full_slug.startsWith(`${folder.path}/`),
    );
    if (matches.length > 1)
      throw new CliError(
        `Multiple linked alternates exist in '${folder.path}'.`,
        1,
        "AMBIGUOUS",
      );
    if (matches.length === 1)
      return {
        status: "unchanged",
        story: { id: matches[0].id, fullSlug: matches[0].full_slug },
        folder: folder.path,
      };
    if (typeof source.group_id !== "string" || !source.group_id.trim())
      throw new CliError(
        "The source story has no group ID; establish its alternate group in Storyblok before creating a variant.",
        1,
        "CONFLICT",
      );
    let created;
    try {
      created = await gateway.duplicateStoryToDimension(
        input.spaceId,
        source.id,
        folder.id,
        source.group_id,
      );
    } catch (error) {
      const classified = toUnblokError(error);
      throw new UnblokError(classified, {
        cause: error,
        operation: "duplicate-story-to-dimension",
      });
    }
    if (
      !created ||
      !Number.isSafeInteger(created.id) ||
      created.id <= 0 ||
      created.id === source.id ||
      typeof created.full_slug !== "string" ||
      !created.full_slug.startsWith(`${folder.path}/`) ||
      created.group_id !== source.group_id
    )
      throw new CliError(
        "Storyblok did not confirm the linked variant; inspect the destination before retrying.",
        1,
        "CONFLICT",
      );
    return {
      status: "created",
      story: { id: created.id, fullSlug: created.full_slug },
      folder: folder.path,
    };
  } catch (error) {
    throw toUnblokError(error);
  }
}
