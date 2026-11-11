import type { Story } from "@storyblok/management-api-client";
import { CliError } from "../../errors.ts";
import type { StoryblokGateway } from "../../storyblok/gateway.ts";
import { toUnblokError } from "../action-error.ts";
import { listStories as listMatchingStories } from "./list-stories.ts";

export type StoryListGateway = Pick<StoryblokGateway, "listStories">;
export interface ListStoriesInput {
  spaceId: number;
  search?: string;
  textSearch?: string;
  startsWith?: string;
  component?: string;
  tag?: string;
  published?: boolean;
}

/** List non-folder stories using Management API filters. */
export async function listStories(
  gateway: StoryListGateway,
  input: ListStoriesInput,
): Promise<Story[]> {
  try {
    if (!input || !Number.isSafeInteger(input.spaceId) || input.spaceId <= 0)
      throw new CliError("Provide a positive spaceId.", 1, "INVALID_INPUT");
    for (const key of [
      "search",
      "textSearch",
      "startsWith",
      "component",
      "tag",
    ] as const) {
      const value = input[key];
      if (
        value !== undefined &&
        (typeof value !== "string" || !value.trim() || value !== value.trim())
      )
        throw new CliError(
          `Provide a nonempty ${key} without surrounding whitespace.`,
          1,
          "INVALID_INPUT",
        );
    }
    if (input.published !== undefined && typeof input.published !== "boolean")
      throw new CliError(
        "Provide a boolean published filter.",
        1,
        "INVALID_INPUT",
      );
    return await listMatchingStories(gateway, input.spaceId, {
      storyOnly: true,
      ...(input.search === undefined ? {} : { search: input.search }),
      ...(input.textSearch === undefined
        ? {}
        : { textSearch: input.textSearch }),
      ...(input.startsWith === undefined
        ? {}
        : { startsWith: input.startsWith }),
      ...(input.component === undefined ? {} : { component: input.component }),
      ...(input.tag === undefined ? {} : { tag: input.tag }),
      ...(input.published === undefined ? {} : { published: input.published }),
    });
  } catch (error) {
    throw toUnblokError(error);
  }
}
