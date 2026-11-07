import type {
  StoryblokGateway,
  StoryblokLanguage,
} from "../../storyblok/gateway.ts";

export interface DesiredLanguage {
  aiTranslationCode?: string | null;
  code: string;
  name: string;
}

export type LanguageChange = "create" | "unchanged" | "update";

export function compareLanguage(
  desired: DesiredLanguage,
  current: StoryblokLanguage[],
): LanguageChange {
  const existing = current.find((language) => language.code === desired.code);
  if (!existing) {
    return "create";
  }

  const aiCodeMatches =
    desired.aiTranslationCode === undefined ||
    existing.aiTranslationCode === desired.aiTranslationCode;
  return existing.name === desired.name && aiCodeMatches
    ? "unchanged"
    : "update";
}

export async function listLanguages(
  gateway: Pick<StoryblokGateway, "listLanguages">,
  spaceId: number,
): Promise<StoryblokLanguage[]> {
  return gateway.listLanguages(spaceId);
}

export async function ensureLanguage(
  gateway: Pick<StoryblokGateway, "listLanguages" | "updateLanguages">,
  spaceId: number,
  desired: DesiredLanguage,
): Promise<{ language: StoryblokLanguage; status: LanguageChange }> {
  const languages = await gateway.listLanguages(spaceId);
  const status = compareLanguage(desired, languages);
  const existing = languages.find((language) => language.code === desired.code);

  if (status === "unchanged" && existing) {
    return { language: existing, status };
  }

  const targetLanguage: StoryblokLanguage = existing
    ? {
        ...existing,
        ...desired,
        aiTranslationCode:
          desired.aiTranslationCode === undefined
            ? existing.aiTranslationCode
            : desired.aiTranslationCode,
      }
    : desired;
  const nextLanguages = existing
    ? languages.map((language) =>
        language.code === desired.code ? targetLanguage : language,
      )
    : [...languages, targetLanguage];
  await gateway.updateLanguages(spaceId, nextLanguages);
  return { language: targetLanguage, status };
}
