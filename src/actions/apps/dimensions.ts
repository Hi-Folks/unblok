import { CliError } from "../../errors.ts";
import type { StoryblokGateway } from "../../storyblok/gateway.ts";
import { toUnblokError } from "../action-error.ts";
import { isValidStoryCreationSlug } from "../stories/create-story.ts";

export type DimensionsGateway = Pick<
  StoryblokGateway,
  "getSpace" | "updateSpaceSettings" | "findStoryFolderBySlug"
>;
export interface DimensionsInput {
  spaceId: number;
  folders: string[];
}

/** Set the Dimensions folder selection, preserving settings for retained folders. */
export async function configureDimensions(
  gateway: DimensionsGateway,
  input: DimensionsInput,
): Promise<{ status: "updated" | "unchanged"; folders: string[] }> {
  try {
    if (
      !input ||
      !Number.isSafeInteger(input.spaceId) ||
      input.spaceId <= 0 ||
      !Array.isArray(input.folders) ||
      !input.folders.length ||
      input.folders.some(
        (path) =>
          typeof path !== "string" ||
          path !== path.trim() ||
          !isValidStoryCreationSlug(path) ||
          path.includes("/"),
      ) ||
      new Set(input.folders).size !== input.folders.length
    )
      throw new CliError(
        "Provide a positive spaceId and unique root folder paths.",
        2,
        "INVALID_INPUT",
      );
    const space = await gateway.getSpace(input.spaceId);
    if (space.id !== input.spaceId)
      throw new CliError(
        "Storyblok returned a different space.",
        1,
        "CONFLICT",
      );
    const data = space as unknown as {
      dimensions_app_folder_ids?: unknown;
      dimensions_app_folders?: unknown;
    };
    const ids = data.dimensions_app_folder_ids ?? [];
    const settings = data.dimensions_app_folders ?? [];
    if (
      !Array.isArray(ids) ||
      ids.some((id) => !Number.isSafeInteger(id) || id <= 0) ||
      !Array.isArray(settings) ||
      settings.some(
        (item) =>
          !item ||
          typeof item !== "object" ||
          !Number.isSafeInteger(item.folder_id) ||
          (typeof item.ai_translation_code !== "string" &&
            item.ai_translation_code !== null),
      ) ||
      new Set(settings.map((item) => item.folder_id)).size !== settings.length
    )
      throw new CliError(
        "Storyblok returned invalid Dimensions settings; no changes were made.",
        1,
        "CONFLICT",
      );
    const resolved: number[] = [];
    for (const path of input.folders) {
      const folder = await gateway.findStoryFolderBySlug(input.spaceId, path);
      if (!folder || !Number.isSafeInteger(folder.id) || folder.id <= 0)
        throw new CliError(`Folder '${path}' was not found.`, 1, "NOT_FOUND");
      resolved.push(folder.id);
    }
    if (new Set(resolved).size !== resolved.length)
      throw new CliError(
        "Dimensions folders resolved to duplicate IDs.",
        1,
        "CONFLICT",
      );
    const next = resolved.map(
      (folder_id) =>
        settings.find((item) => item.folder_id === folder_id) ?? {
          folder_id,
          ai_translation_code: "",
        },
    );
    if (
      JSON.stringify(ids) === JSON.stringify(resolved) &&
      JSON.stringify(settings) === JSON.stringify(next)
    )
      return { status: "unchanged", folders: input.folders };
    await gateway.updateSpaceSettings(input.spaceId, {
      dimensions_app_folder_ids: resolved,
      dimensions_app_folders: next,
    });
    return { status: "updated", folders: input.folders };
  } catch (error) {
    throw toUnblokError(error);
  }
}
