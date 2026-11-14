import { CliError } from "../../errors.ts";
import type { StoryblokGateway } from "../../storyblok/gateway.ts";
import { toUnblokError } from "../action-error.ts";
import { isValidStoryCreationSlug } from "./create-story.ts";
import { compareContent, type StoryVersionChange } from "./versions.ts";
import { listDimensionsFolders } from "../apps/list-dimensions.ts";

export type CompareDimensionsGateway = Pick<
  StoryblokGateway,
  "getStory" | "findStoryBySlug" | "findStoryFolderBySlug"
> &
  Partial<Pick<StoryblokGateway, "getSpace" | "listStories">>;
export interface CompareDimensionsInput {
  spaceId: number;
  story: string;
  folders?: readonly string[];
}
export interface DimensionComparison {
  folder: string;
  status: "missing" | "compared";
  story?: { id: number; fullSlug: string };
  changes?: StoryVersionChange[];
}
export interface CompareDimensionsReport {
  apiVersion: "unblok/story-dimensions-comparison-v1";
  story: { id: number; fullSlug: string };
  folders: DimensionComparison[];
}

/** Compare a story with its linked alternates in selected or configured root folders. */
export async function compareStoryDimensions(
  gateway: CompareDimensionsGateway,
  input: CompareDimensionsInput,
): Promise<CompareDimensionsReport> {
  try {
    if (
      !input ||
      !Number.isSafeInteger(input.spaceId) ||
      input.spaceId <= 0 ||
      typeof input.story !== "string" ||
      input.story !== input.story.trim() ||
      !isValidStoryCreationSlug(input.story) ||
      (input.folders !== undefined &&
        (!Array.isArray(input.folders) ||
          !input.folders.length ||
          input.folders.some(
            (path) =>
              typeof path !== "string" ||
              path !== path.trim() ||
              !isValidStoryCreationSlug(path) ||
              path.includes("/"),
          ) ||
          new Set(input.folders).size !== input.folders.length))
    )
      throw new CliError(
        "Provide a positive spaceId, an exact story slug or ID, and unique root folder paths.",
        2,
        "INVALID_INPUT",
      );
    const numeric = /^\d+$/.test(input.story);
    const id = numeric
      ? Number(input.story)
      : (await gateway.findStoryBySlug(input.spaceId, input.story))?.id;
    if (!id && !numeric)
      throw new CliError(
        `Story '${input.story}' was not found.`,
        1,
        "NOT_FOUND",
      );
    if (!id || !Number.isSafeInteger(id) || id <= 0)
      throw new CliError("Provide a valid story ID.", 2, "INVALID_INPUT");
    const source = await gateway.getStory(input.spaceId, id);
    if (
      !source ||
      source.id !== id ||
      source.is_folder ||
      !source.full_slug ||
      (!numeric && source.full_slug !== input.story) ||
      !source.content ||
      typeof source.content !== "object" ||
      Array.isArray(source.content)
    )
      throw new CliError(
        "Story identity or content could not be verified.",
        1,
        "CONFLICT",
      );
    const alternates = (source as unknown as { alternates?: unknown })
      .alternates;
    if (!Array.isArray(alternates))
      throw new CliError(
        "Storyblok did not return alternate story data; the comparison cannot determine missing variants.",
        1,
        "CONFLICT",
      );
    if (
      alternates.some(
        (item) =>
          !item ||
          typeof item !== "object" ||
          !Number.isSafeInteger(item.id) ||
          item.id <= 0 ||
          typeof item.full_slug !== "string" ||
          !item.full_slug ||
          item.is_folder === true,
      )
    )
      throw new CliError(
        "Storyblok returned invalid alternate story data.",
        1,
        "CONFLICT",
      );
    let configured:
      Awaited<ReturnType<typeof listDimensionsFolders>> | undefined;
    if (input.folders === undefined) {
      if (!gateway.getSpace || !gateway.listStories)
        throw new CliError(
          "Listing configured Dimensions folders requires getSpace and listStories gateway methods.",
          2,
          "INVALID_INPUT",
        );
      configured = await listDimensionsFolders(
        {
          getSpace: gateway.getSpace.bind(gateway),
          listStories: gateway.listStories.bind(gateway),
        },
        { spaceId: input.spaceId },
      );
    }
    const containsSource = (folder: string) =>
      source.full_slug === folder || source.full_slug.startsWith(`${folder}/`);
    const folders =
      input.folders ??
      configured!
        .map((item) => item.path)
        .filter((folder) => !containsSource(folder));
    if (!folders.length)
      throw new CliError(
        "No other Dimensions folders are configured for comparison.",
        1,
        "NOT_FOUND",
      );
    const results: DimensionComparison[] = [];
    for (const folder of folders) {
      if (containsSource(folder))
        throw new CliError(
          `Folder '${folder}' contains the source story; choose destination folders.`,
          2,
          "INVALID_INPUT",
        );
      const targetFolder =
        configured?.find((item) => item.path === folder) ??
        (await gateway.findStoryFolderBySlug(input.spaceId, folder));
      if (
        !targetFolder ||
        !Number.isSafeInteger(targetFolder.id) ||
        targetFolder.id <= 0
      )
        throw new CliError(`Folder '${folder}' was not found.`, 1, "NOT_FOUND");
      const matches = alternates.filter(
        (item) =>
          item.full_slug === folder || item.full_slug.startsWith(`${folder}/`),
      );
      if (matches.length > 1)
        throw new CliError(
          `Multiple linked alternates exist in '${folder}'.`,
          1,
          "AMBIGUOUS",
        );
      if (!matches.length) {
        results.push({ folder, status: "missing" });
        continue;
      }
      const match = matches[0]!;
      const target = await gateway.getStory(input.spaceId, match.id);
      if (
        !target ||
        target.id !== match.id ||
        target.full_slug !== match.full_slug ||
        target.is_folder ||
        !target.content ||
        typeof target.content !== "object" ||
        Array.isArray(target.content)
      )
        throw new CliError(
          `The linked story in '${folder}' could not be verified.`,
          1,
          "CONFLICT",
        );
      results.push({
        folder,
        status: "compared",
        story: { id: target.id, fullSlug: target.full_slug },
        changes: compareContent(source.content, target.content),
      });
    }
    return {
      apiVersion: "unblok/story-dimensions-comparison-v1",
      story: { id, fullSlug: source.full_slug },
      folders: results,
    };
  } catch (error) {
    throw toUnblokError(error);
  }
}
