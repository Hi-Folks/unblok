import { CliError } from "../../errors.ts";
import { toUnblokError } from "../action-error.ts";
import {
  checkTranslatedSlugPrerequisites,
  reconcileTranslatedSlugs,
  type TranslatedSlugsGateway,
  type StoryTranslations,
} from "./translated-slugs.ts";

export type { TranslatedSlugsGateway } from "./translated-slugs.ts";
export interface TranslatedSlugInput {
  language: string;
  slug: string;
  name?: string;
}
export interface EnsureTranslatedSlugsInput {
  spaceId: number;
  story: string;
  translations: readonly TranslatedSlugInput[];
}

/** Reconcile translated slugs for one story without modifying other languages. */
export async function ensureTranslatedSlugs(
  gateway: TranslatedSlugsGateway,
  input: EnsureTranslatedSlugsInput,
): Promise<{ status: "updated" | "unchanged" }> {
  try {
    if (
      !Number.isSafeInteger(input.spaceId) ||
      input.spaceId <= 0 ||
      typeof input.story !== "string" ||
      !input.story.trim().replace(/^\/+|\/+$/g, "") ||
      /[*,]/.test(input.story) ||
      !Array.isArray(input.translations) ||
      !input.translations.length
    )
      throw new CliError(
        "Provide a positive spaceId, exact story slug, and at least one translation.",
        1,
        "INVALID_INPUT",
      );
    const languages = new Set<string>();
    const translations = input.translations.map((item) => {
      if (
        !item ||
        typeof item.language !== "string" ||
        !item.language.trim() ||
        item.language !== item.language.trim() ||
        typeof item.slug !== "string" ||
        !item.slug.trim().replace(/^\/+|\/+$/g, "") ||
        (item.name !== undefined && typeof item.name !== "string")
      )
        throw new CliError(
          "Each translation requires a language, a slug, and an optional name.",
          1,
          "INVALID_INPUT",
        );
      if (languages.has(item.language))
        throw new CliError(
          `Duplicate language '${item.language}'.`,
          1,
          "INVALID_INPUT",
        );
      languages.add(item.language);
      return {
        lang: item.language,
        slug: item.slug.trim().replace(/^\/+|\/+$/g, ""),
        ...(item.name !== undefined ? { name: item.name } : {}),
      };
    });
    const group: StoryTranslations = {
      slug: input.story.trim().replace(/^\/+|\/+$/g, ""),
      translations,
    };
    await checkTranslatedSlugPrerequisites(gateway, input.spaceId, [group]);
    return await reconcileTranslatedSlugs(gateway, input.spaceId, group);
  } catch (error) {
    throw toUnblokError(error);
  }
}
