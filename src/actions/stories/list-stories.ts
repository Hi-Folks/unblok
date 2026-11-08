import type { Story } from "@storyblok/management-api-client";
import { CliError } from "../../errors.ts";
import type {
  ListStoriesOptions,
  StoryblokGateway,
} from "../../storyblok/gateway.ts";

export async function listStories(
  gateway: Pick<StoryblokGateway, "listStories">,
  spaceId: number,
  options: ListStoriesOptions,
): Promise<Story[]> {
  const stories = await gateway.listStories(spaceId, options);
  const unique = [
    ...new Map(stories.map((story) => [story.id, story])).values(),
  ];

  if (options.ids?.length) {
    const found = new Set(unique.map((story) => story.id));
    const missing = options.ids.filter((id) => !found.has(id));
    if (missing.length > 0) {
      throw new CliError(
        `Story IDs not found: ${missing.join(", ")}.`,
        1,
        "NOT_FOUND",
      );
    }
  }
  return unique;
}
