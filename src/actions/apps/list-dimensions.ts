import { CliError } from "../../errors.ts";
import type { StoryblokGateway } from "../../storyblok/gateway.ts";
import { toUnblokError } from "../action-error.ts";

export type ListDimensionsGateway = Pick<
  StoryblokGateway,
  "getSpace" | "listStories"
>;
export interface DimensionsFolder {
  id: number;
  path: string;
  aiTranslationCode: string | null;
}
export async function listDimensionsFolders(
  gateway: ListDimensionsGateway,
  input: { spaceId: number },
): Promise<DimensionsFolder[]> {
  try {
    if (!input || !Number.isSafeInteger(input.spaceId) || input.spaceId <= 0)
      throw new CliError("Provide a positive spaceId.", 2, "INVALID_INPUT");
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
      new Set(ids).size !== ids.length ||
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
        "Storyblok returned invalid Dimensions configuration.",
        1,
        "CONFLICT",
      );
    if (!ids.length) return [];
    const stories = await gateway.listStories(input.spaceId, { ids });
    return ids.map((id) => {
      const matches = stories.filter(
        (story) =>
          story.id === id &&
          story.is_folder === true &&
          story.parent_id === 0 &&
          typeof story.full_slug === "string" &&
          !!story.full_slug.replace(/\/+$/, "") &&
          !story.full_slug.replace(/\/+$/, "").includes("/"),
      );
      if (matches.length !== 1)
        throw new CliError(
          `Configured Dimensions folder ${id} could not be resolved uniquely.`,
          1,
          "CONFLICT",
        );
      const config = settings.find((item) => item.folder_id === id);
      return {
        id,
        path: matches[0]!.full_slug.replace(/\/+$/, ""),
        aiTranslationCode: config?.ai_translation_code ?? null,
      };
    });
  } catch (error) {
    throw toUnblokError(error);
  }
}
