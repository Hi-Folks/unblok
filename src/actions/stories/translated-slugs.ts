import { CliError } from "../../errors.ts";
import type { StoryblokGateway } from "../../storyblok/gateway.ts";

export type TranslatedSlugsGateway = Pick<
  StoryblokGateway,
  | "listInstalledApps"
  | "listLanguages"
  | "findStoryBySlug"
  | "getStory"
  | "updateTranslatedSlugs"
>;
export interface StoryTranslation {
  lang: string;
  slug: string;
  name?: string;
}
export interface StoryTranslations {
  slug: string;
  translations: StoryTranslation[];
}

/** Validate shared prerequisites for all requested stories before any updates. */
export async function checkTranslatedSlugPrerequisites(
  gateway: TranslatedSlugsGateway,
  spaceId: number,
  groups: readonly StoryTranslations[],
): Promise<void> {
  if (!groups.length) return;
  const apps = await gateway.listInstalledApps(spaceId);
  if (!apps.some((app) => app.slug === "translatable-slugs"))
    throw new CliError(
      "The translatable-slugs app must be installed before setting translated slugs.",
      1,
      "CONFLICT",
    );
  const languages = await gateway.listLanguages(spaceId);
  for (const group of groups)
    for (const item of group.translations)
      if (!languages.some((language) => language.code === item.lang))
        throw new CliError(
          `Language '${item.lang}' is not enabled in the space.`,
          1,
          "NOT_FOUND",
        );
}

/** Reconcile one story after prerequisite validation. */
export async function reconcileTranslatedSlugs(
  gateway: TranslatedSlugsGateway,
  spaceId: number,
  group: StoryTranslations,
): Promise<{ status: "updated" | "unchanged" }> {
  const match = await gateway.findStoryBySlug(spaceId, group.slug);
  if (!match)
    throw new CliError(`Story '${group.slug}' was not found.`, 1, "NOT_FOUND");
  const story = await gateway.getStory(spaceId, match.id);
  if (story.full_slug !== group.slug || story.is_folder)
    throw new CliError(
      `Story '${group.slug}' no longer matches.`,
      1,
      "CONFLICT",
    );
  if (!Array.isArray(story.translated_slugs))
    throw new CliError(
      `Story '${group.slug}' did not include translated slugs.`,
      1,
      "CONFLICT",
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
        1,
        "AMBIGUOUS",
      );
    const existing = matches[0];
    if (
      existing &&
      existing.slug === item.slug &&
      (item.name === undefined || existing.name === item.name)
    )
      continue;
    if (existing && (!Number.isSafeInteger(existing.id) || existing.id <= 0))
      throw new CliError(
        `Translation '${item.lang}' has no valid ID.`,
        1,
        "CONFLICT",
      );
    updates.push({
      ...(existing ? { id: existing.id } : { lang: item.lang }),
      slug: item.slug,
      ...(item.name === undefined ? {} : { name: item.name }),
    });
  }
  if (updates.length)
    await gateway.updateTranslatedSlugs(spaceId, story.id, updates);
  return { status: updates.length ? "updated" : "unchanged" };
}
