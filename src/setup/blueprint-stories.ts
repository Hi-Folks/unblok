import { CliError } from "../errors.ts";
import type { StoryblokGateway } from "../storyblok/gateway.ts";
import {
  resolveStoryAssetReferences,
  type RemoteAsset,
} from "./blueprint-assets.ts";
import { BlueprintOperationError } from "./blueprint-report.ts";
import { updateStoryBlock } from "../actions/stories/content.ts";

export interface StoryCreate {
  name: string;
  slug: string;
  content: Record<string, unknown>;
}
export interface StoryTranslations {
  slug: string;
  translations: Array<{ lang: string; slug: string; name?: string }>;
}
export interface StoryBlockUpdate {
  story_slug: string;
  component: string;
  fields: Record<string, unknown>;
}

export async function updateBlueprintStoryBlock(
  gateway: StoryblokGateway,
  spaceId: number,
  update: StoryBlockUpdate,
  expectedId?: number,
  allowChanges = true,
): Promise<boolean> {
  const found =
    expectedId === undefined
      ? await gateway.findStoryBySlug(spaceId, update.story_slug)
      : undefined;
  const storyId = expectedId ?? found?.id;
  if (
    typeof storyId !== "number" ||
    !Number.isSafeInteger(storyId) ||
    storyId <= 0
  )
    throw new CliError(
      `Story '${update.story_slug}' was not found or does not match its experiment mapping.`,
    );
  const story = await gateway.getStory(spaceId, storyId);
  if (
    story.id !== storyId ||
    story.full_slug !== update.story_slug ||
    story.is_folder
  )
    throw new CliError(`Story '${update.story_slug}' no longer matches.`);
  const matches: Record<string, unknown>[] = [];
  function visit(value: unknown): void {
    if (Array.isArray(value)) {
      value.forEach(visit);
      return;
    }
    if (!value || typeof value !== "object") return;
    const node = value as Record<string, unknown>;
    if (node.component === update.component) matches.push(node);
    Object.values(node).forEach(visit);
  }
  visit(story.content);
  if (matches.length !== 1 || typeof matches[0]?._uid !== "string")
    throw new CliError(
      `Expected exactly one '${update.component}' block with a UID; found ${matches.length}.`,
    );
  if (
    Object.keys(update.fields).some((key) => !Object.hasOwn(matches[0]!, key))
  )
    throw new CliError(
      "A requested field does not exist on the selected block.",
    );
  if (
    Object.entries(update.fields).every(([key, value]) =>
      Bun.deepEquals(matches[0]![key], value),
    )
  )
    return false;
  if (!allowChanges)
    throw new CliError(
      "Variant content differs while the experiment is running; inspect it before changing it.",
    );
  await updateStoryBlock(
    gateway,
    spaceId,
    storyId,
    matches[0]._uid,
    update.fields,
  );
  return true;
}

function addComponentIds(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(addComponentIds);
  if (typeof value !== "object" || value === null) return value;
  const item = value as Record<string, unknown>;
  const result = Object.fromEntries(
    Object.entries(item).map(([key, child]) => [key, addComponentIds(child)]),
  );
  if (typeof item.component === "string" && !item._uid)
    result._uid = crypto.randomUUID();
  return result;
}

export async function applyStories(
  gateway: StoryblokGateway,
  spaceId: number,
  creates: StoryCreate[],
  translations: StoryTranslations[],
  operations: Array<{ operation: string; key: string; status: string }>,
  references: RemoteAsset[] = [],
): Promise<void> {
  for (const desired of creates) {
    try {
      const existing = await gateway.findStoryBySlug(spaceId, desired.slug);
      if (existing) {
        operations.push({
          operation: "create-story",
          key: desired.slug,
          status: "unchanged",
        });
        continue;
      }
      const content = await resolveStoryAssetReferences(
        gateway,
        spaceId,
        desired.content,
        references,
      );
      await gateway.createStory(spaceId, {
        name: desired.name,
        slug: desired.slug,
        content: addComponentIds(content) as Record<string, unknown>,
      });
      operations.push({
        operation: "create-story",
        key: desired.slug,
        status: "created",
      });
    } catch (error) {
      throw new BlueprintOperationError("create-story", desired.slug, error);
    }
  }
  if (translations.length) {
    const apps = await gateway.listInstalledApps(spaceId);
    if (!apps.some((app) => app.slug === "translatable-slugs"))
      throw new CliError(
        "The translatable-slugs app must be installed before setting translated slugs.",
      );
    const languages = await gateway.listLanguages(spaceId);
    for (const group of translations)
      for (const item of group.translations)
        if (!languages.some((language) => language.code === item.lang))
          throw new CliError(
            `Language '${item.lang}' is not enabled in the space.`,
          );
  }
  for (const group of translations) {
    try {
      const match = await gateway.findStoryBySlug(spaceId, group.slug);
      if (!match) throw new CliError(`Story '${group.slug}' was not found.`);
      const story = await gateway.getStory(spaceId, match.id);
      if (story.full_slug !== group.slug || story.is_folder)
        throw new CliError(`Story '${group.slug}' no longer matches.`);
      if (!Array.isArray(story.translated_slugs))
        throw new CliError(
          `Story '${group.slug}' did not include translated slugs.`,
        );
      const updates: Array<{
        id?: number;
        lang?: string;
        slug: string;
        name?: string;
      }> = [];
      for (const item of group.translations) {
        const matches = story.translated_slugs.filter(
          (entry) => entry.lang === item.lang,
        );
        if (matches.length > 1)
          throw new CliError(
            `Story '${group.slug}' has multiple translations for '${item.lang}'.`,
          );
        const existing = matches[0];
        if (
          existing &&
          existing.slug === item.slug &&
          (item.name === undefined || existing.name === item.name)
        )
          continue;
        if (
          existing &&
          (!Number.isSafeInteger(existing.id) || existing.id <= 0)
        )
          throw new CliError(`Translation '${item.lang}' has no valid ID.`);
        updates.push({
          ...(existing ? { id: existing.id } : { lang: item.lang }),
          slug: item.slug,
          ...(item.name === undefined ? {} : { name: item.name }),
        });
      }
      if (updates.length)
        await gateway.updateTranslatedSlugs(spaceId, story.id, updates);
      operations.push({
        operation: "translate-story-slugs",
        key: group.slug,
        status: updates.length ? "updated" : "unchanged",
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
