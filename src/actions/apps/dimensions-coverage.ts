import { CliError } from "../../errors.ts";
import type { StoryblokGateway } from "../../storyblok/gateway.ts";
import { toUnblokError } from "../action-error.ts";
import { isValidStoryCreationSlug } from "../stories/create-story.ts";
import { listDimensionsFolders } from "./list-dimensions.ts";

export type DimensionsCoverageGateway = Pick<
  StoryblokGateway,
  "getSpace" | "listStories" | "getStory"
>;
export interface DimensionsCoverageInput {
  spaceId: number;
  startsWith: string;
  folders?: readonly string[];
}
export interface DimensionsCoverageReport {
  apiVersion: "unblok/dimensions-coverage-v1";
  startsWith: string;
  sourceFolder: string;
  folders: string[];
  stories: {
    id: number;
    fullSlug: string;
    variants: {
      folder: string;
      status: "linked" | "missing";
      story?: { id: number; fullSlug: string };
    }[];
  }[];
}
export interface DimensionsCoverageProgress {
  current: number;
  total: number;
  story: DimensionsCoverageReport["stories"][number];
}

/** Report linked Dimensions variants beneath a source folder path. */
export async function getDimensionsCoverage(
  gateway: DimensionsCoverageGateway,
  input: DimensionsCoverageInput,
  options?: { onProgress?: (progress: DimensionsCoverageProgress) => void },
): Promise<DimensionsCoverageReport> {
  try {
    const path =
      typeof input?.startsWith === "string"
        ? input.startsWith.replace(/\/$/, "")
        : "";
    if (
      !input ||
      !Number.isSafeInteger(input.spaceId) ||
      input.spaceId <= 0 ||
      !path ||
      input.startsWith !== input.startsWith.trim() ||
      !isValidStoryCreationSlug(path) ||
      (input.folders !== undefined &&
        (!Array.isArray(input.folders) ||
          !input.folders.length ||
          input.folders.some(
            (folder) =>
              typeof folder !== "string" ||
              !isValidStoryCreationSlug(folder) ||
              folder.includes("/"),
          ) ||
          new Set(input.folders).size !== input.folders.length))
    )
      throw new CliError(
        "Provide a positive spaceId, a source folder path and unique root destination folders.",
        2,
        "INVALID_INPUT",
      );
    const configured = await listDimensionsFolders(gateway, {
      spaceId: input.spaceId,
    });
    const sourceFolder = path.split("/")[0]!;
    if (!configured.some((folder) => folder.path === sourceFolder))
      throw new CliError(
        `Source root '${sourceFolder}' is not a configured Dimensions folder.`,
        1,
        "NOT_FOUND",
      );
    const folders = input.folders
      ? [...input.folders]
      : configured
          .map((folder) => folder.path)
          .filter((folder) => folder !== sourceFolder);
    if (!folders.length)
      throw new CliError(
        "No destination Dimensions folders are configured.",
        1,
        "NOT_FOUND",
      );
    for (const folder of folders) {
      if (folder === sourceFolder)
        throw new CliError(
          "The source folder cannot also be a destination.",
          2,
          "INVALID_INPUT",
        );
      if (!configured.some((item) => item.path === folder))
        throw new CliError(
          `Destination '${folder}' is not a configured Dimensions folder.`,
          1,
          "NOT_FOUND",
        );
    }
    const startsWith = `${path}/`;
    const sources = await gateway.listStories(input.spaceId, {
      startsWith,
      storyOnly: true,
    });
    const seen = new Set<number>();
    const stories: DimensionsCoverageReport["stories"] = [];
    for (const item of sources) {
      if (
        !item ||
        !Number.isSafeInteger(item.id) ||
        item.id <= 0 ||
        typeof item.full_slug !== "string" ||
        !item.full_slug.startsWith(startsWith) ||
        item.is_folder ||
        seen.has(item.id)
      )
        throw new CliError(
          "Storyblok returned invalid or duplicate source story data.",
          1,
          "CONFLICT",
        );
      seen.add(item.id);
      const story = await gateway.getStory(input.spaceId, item.id);
      if (
        !story ||
        story.id !== item.id ||
        story.full_slug !== item.full_slug ||
        story.is_folder
      )
        throw new CliError(
          `Source story '${item.full_slug}' could not be verified.`,
          1,
          "CONFLICT",
        );
      const alternates = (story as unknown as { alternates?: unknown })
        .alternates;
      if (
        !Array.isArray(alternates) ||
        alternates.some(
          (alt) =>
            !alt ||
            typeof alt !== "object" ||
            !Number.isSafeInteger(alt.id) ||
            alt.id <= 0 ||
            typeof alt.full_slug !== "string" ||
            !alt.full_slug ||
            alt.is_folder === true,
        )
      )
        throw new CliError(
          `Storyblok returned invalid or missing alternate data for '${item.full_slug}'.`,
          1,
          "CONFLICT",
        );
      const variants = folders.map((folder) => {
        const matches = alternates.filter(
          (alt) =>
            alt.full_slug === folder || alt.full_slug.startsWith(`${folder}/`),
        );
        if (matches.length > 1)
          throw new CliError(
            `Multiple linked alternates for '${item.full_slug}' exist in '${folder}'.`,
            1,
            "AMBIGUOUS",
          );
        const match = matches[0];
        return match
          ? {
              folder,
              status: "linked" as const,
              story: {
                id: match.id as number,
                fullSlug: match.full_slug as string,
              },
            }
          : { folder, status: "missing" as const };
      });
      const result = { id: item.id, fullSlug: item.full_slug, variants };
      stories.push(result);
      options?.onProgress?.({
        current: stories.length,
        total: sources.length,
        story: result,
      });
    }
    stories.sort((a, b) => a.fullSlug.localeCompare(b.fullSlug));
    return {
      apiVersion: "unblok/dimensions-coverage-v1",
      startsWith,
      sourceFolder,
      folders,
      stories,
    };
  } catch (error) {
    throw toUnblokError(error);
  }
}
