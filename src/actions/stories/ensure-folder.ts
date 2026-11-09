import { CliError } from "../../errors.ts";
import type { StoryblokGateway } from "../../storyblok/gateway.ts";
import { toUnblokError } from "../action-error.ts";
import { isValidStoryCreationSlug } from "./create-story.ts";

export type StoryFolderGateway = Pick<
  StoryblokGateway,
  "findStoryFolderBySlug" | "findStoryBySlug" | "createStoryFolder"
>;
export interface EnsureStoryFolderInput {
  spaceId: number;
  path: string;
}
export interface EnsureStoryFolderResult {
  status: "created" | "unchanged";
  path: string;
  folderId: number;
  created: string[];
}

/** Create missing content folders for a path and reuse existing folders. */
export async function ensureStoryFolder(
  gateway: StoryFolderGateway,
  input: EnsureStoryFolderInput,
): Promise<EnsureStoryFolderResult> {
  try {
    if (
      !input ||
      !Number.isSafeInteger(input.spaceId) ||
      input.spaceId <= 0 ||
      typeof input.path !== "string" ||
      !isValidStoryCreationSlug(input.path)
    )
      throw new CliError(
        "Provide a positive spaceId and a valid folder path.",
        1,
        "INVALID_INPUT",
      );
    const path = input.path.trim();
    const parts = path.split("/");
    const created: string[] = [];
    let parentId = 0;
    for (let index = 0; index < parts.length; index++) {
      const slug = parts[index]!;
      const fullPath = parts.slice(0, index + 1).join("/");
      let folder = await gateway.findStoryFolderBySlug(input.spaceId, fullPath);
      if (!folder) {
        if (await gateway.findStoryBySlug(input.spaceId, fullPath))
          throw new CliError(
            `A story already exists at '${fullPath}'.`,
            1,
            "CONFLICT",
          );
        folder = await gateway.createStoryFolder(input.spaceId, {
          name: slug,
          slug,
          parentId,
        });
        created.push(fullPath);
      }
      if (!Number.isSafeInteger(folder.id) || folder.id <= 0)
        throw new CliError(
          `Folder '${fullPath}' has an invalid ID.`,
          1,
          "CONFLICT",
        );
      parentId = folder.id;
    }
    return {
      status: created.length ? "created" : "unchanged",
      path,
      folderId: parentId,
      created,
    };
  } catch (error) {
    throw toUnblokError(error);
  }
}
