import { CliError } from "../../errors.ts";
import type { StoryblokGateway } from "../../storyblok/gateway.ts";
import { toUnblokError } from "../action-error.ts";
import { reconcileStoryBlock } from "./reconcile-block.ts";

export type StoryBlockGateway = Pick<
  StoryblokGateway,
  "findStoryBySlug" | "getStory" | "updateStoryContent"
>;
export interface UpdateStoryBlockInput {
  spaceId: number;
  story: string;
  component: string;
  fields: Record<string, unknown>;
  releaseId?: number;
}

/** Update one uniquely matching component block, saving an unpublished draft. */
export async function updateStoryBlock(
  gateway: StoryBlockGateway,
  input: UpdateStoryBlockInput,
): Promise<{ status: "updated" | "unchanged" }> {
  try {
    if (
      !Number.isSafeInteger(input.spaceId) ||
      input.spaceId <= 0 ||
      (input.releaseId !== undefined &&
        (!Number.isSafeInteger(input.releaseId) || input.releaseId <= 0)) ||
      typeof input.story !== "string" ||
      !input.story.trim() ||
      input.story !== input.story.trim() ||
      /[*,]/.test(input.story) ||
      typeof input.component !== "string" ||
      !input.component.trim() ||
      input.component !== input.component.trim()
    )
      throw new CliError(
        "Provide a positive spaceId, exact story slug, and component name.",
        1,
        "INVALID_INPUT",
      );
    if (
      !input.fields ||
      typeof input.fields !== "object" ||
      Array.isArray(input.fields) ||
      !Object.keys(input.fields).length ||
      Object.keys(input.fields).some((key) =>
        ["_uid", "component", "__proto__", "constructor", "prototype"].includes(
          key,
        ),
      )
    )
      throw new CliError(
        "Provide nonempty fields without reserved keys.",
        1,
        "INVALID_INPUT",
      );
    const changed = await reconcileStoryBlock(
      gateway,
      input.spaceId,
      {
        story_slug: input.story,
        component: input.component,
        fields: input.fields,
      },
      undefined,
      true,
      input.releaseId,
    );
    return { status: changed ? "updated" : "unchanged" };
  } catch (error) {
    throw toUnblokError(error);
  }
}
