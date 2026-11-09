import type { StoryblokGateway } from "../storyblok/gateway.ts";
import {
  resolveStoryAssetReferences,
  type RemoteAsset,
} from "./blueprint-assets.ts";
import { BlueprintOperationError } from "./blueprint-report.ts";
import { reconcileStoryBlock } from "../actions/stories/reconcile-block.ts";
import { createStoryIfMissing } from "../actions/stories/create-story.ts";
import {
  checkTranslatedSlugPrerequisites,
  reconcileTranslatedSlugs,
  type StoryTranslations,
} from "../actions/stories/translated-slugs.ts";
export type { StoryBlockUpdate } from "../actions/stories/reconcile-block.ts";
export type { StoryTranslations } from "../actions/stories/translated-slugs.ts";

export interface StoryCreate {
  name: string;
  slug: string;
  content: Record<string, unknown>;
  releaseId?: number;
  release?: string;
}
export const updateBlueprintStoryBlock = reconcileStoryBlock;

export async function applyStories(
  gateway: StoryblokGateway,
  spaceId: number,
  creates: StoryCreate[],
  translations: StoryTranslations[],
  operations: Array<{ operation: string; key: string; status: string }>,
  references: RemoteAsset[] = [],
  resolveRelease?: (name: string) => Promise<number>,
): Promise<void> {
  for (const desired of creates) {
    try {
      let releaseId = desired.releaseId;
      if (desired.release !== undefined) {
        if (!resolveRelease)
          throw new Error("Release name resolution is unavailable.");
        releaseId = await resolveRelease(desired.release);
      }
      const result = await createStoryIfMissing(
        gateway,
        { spaceId, ...desired, releaseId },
        async (content) =>
          (await resolveStoryAssetReferences(
            gateway,
            spaceId,
            content,
            references,
          )) as Record<string, unknown>,
      );
      operations.push({
        operation: "create-story",
        key: desired.slug,
        status: result.status,
      });
    } catch (error) {
      throw new BlueprintOperationError("create-story", desired.slug, error);
    }
  }
  await checkTranslatedSlugPrerequisites(gateway, spaceId, translations);
  for (const group of translations) {
    try {
      const result = await reconcileTranslatedSlugs(gateway, spaceId, group);
      operations.push({
        operation: "translate-story-slugs",
        key: group.slug,
        status: result.status,
      });
    } catch (error) {
      throw new BlueprintOperationError(
        "translate-story-slugs",
        group.slug,
        error,
      );
    }
  }
}
