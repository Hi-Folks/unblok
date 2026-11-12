import { CliError } from "../../errors.ts";
import type { StoryblokGateway } from "../../storyblok/gateway.ts";
import { toUnblokError } from "../action-error.ts";
import { isValidStoryCreationSlug } from "./create-story.ts";

export type OrganizeRootGateway = Pick<
  StoryblokGateway,
  "listStories" | "findStoryFolderBySlug" | "findStoryBySlug" | "moveStory"
>;
export interface OrganizeRootInput {
  spaceId: number;
  destination: string;
  keep: string[];
}
export interface RootMove {
  from: string;
  to: string;
  storyId: number;
  isFolder: boolean;
}

/** Move root entries into an existing root folder, preserving listed root folders. */
export async function organizeRoot(
  gateway: OrganizeRootGateway,
  input: OrganizeRootInput,
  onMove?: (move: RootMove) => void,
): Promise<RootMove[]> {
  try {
    const rootPath = (value: unknown): value is string =>
      typeof value === "string" &&
      value === value.trim() &&
      isValidStoryCreationSlug(value) &&
      !value.includes("/");
    if (
      !input ||
      !Number.isSafeInteger(input.spaceId) ||
      input.spaceId <= 0 ||
      !rootPath(input.destination) ||
      !Array.isArray(input.keep) ||
      input.keep.some((value) => !rootPath(value))
    )
      throw new CliError(
        "Provide a positive spaceId and valid root folder paths.",
        2,
        "INVALID_INPUT",
      );
    const folder = await gateway.findStoryFolderBySlug(
      input.spaceId,
      input.destination,
    );
    if (!folder || !Number.isSafeInteger(folder.id) || folder.id <= 0)
      throw new CliError(
        `Destination folder '${input.destination}' was not found or is invalid.`,
        1,
        "NOT_FOUND",
      );
    const protectedPaths = new Set([input.destination, ...input.keep]);
    const entries = await gateway.listStories(input.spaceId);
    if (
      entries.some(
        (entry) =>
          !Number.isSafeInteger(entry.parent_id) ||
          !Number.isSafeInteger(entry.id) ||
          entry.id <= 0,
      )
    )
      throw new CliError(
        "Storyblok did not provide valid entry IDs and parent IDs; root contents cannot be identified safely.",
        1,
        "CONFLICT",
      );
    const root = entries.filter(
      (entry) =>
        entry.parent_id === 0 &&
        !protectedPaths.has(entry.full_slug?.replace(/\/+$/, "")),
    );
    for (const entry of root) {
      const from = entry.full_slug?.replace(/\/+$/, "");
      if (
        !rootPath(from) ||
        typeof entry.is_folder !== "boolean" ||
        entry.slug !== from
      )
        throw new CliError(
          "Storyblok returned an invalid root entry; inspect the space before restructuring.",
          1,
          "CONFLICT",
        );
      const to = `${input.destination}/${entry.slug}`;
      if (
        (await gateway.findStoryBySlug(input.spaceId, to)) ||
        (await gateway.findStoryFolderBySlug(input.spaceId, to))
      )
        throw new CliError(
          `An entry already exists at '${to}'. No root entries were moved.`,
          1,
          "CONFLICT",
        );
    }
    const moved: RootMove[] = [];
    for (const entry of root) {
      const from = entry.full_slug!.replace(/\/+$/, "");
      const result = await gateway.moveStory(
        input.spaceId,
        entry.id,
        folder.id,
        entry.is_folder,
      );
      if (
        !result ||
        result.id !== entry.id ||
        result.parent_id !== folder.id ||
        typeof result.full_slug !== "string"
      )
        throw new CliError(
          `Move of '${from}' was not confirmed. Inspect it before retrying.`,
          1,
          "CONFLICT",
        );
      const item = {
        from,
        to: result.full_slug,
        storyId: entry.id,
        isFolder: entry.is_folder!,
      };
      moved.push(item);
      onMove?.(item);
    }
    return moved;
  } catch (error) {
    throw toUnblokError(error);
  }
}
