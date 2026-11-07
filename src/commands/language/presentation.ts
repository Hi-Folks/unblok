import type { StoryblokLanguage } from "../../storyblok/gateway.ts";
import { formatColumns } from "../../cli/columns.ts";

export function formatLanguageList(
  languages: StoryblokLanguage[],
  width?: number,
): string {
  return formatColumns(
    ["CODE", "NAME", "AI CODE"],
    languages.map((language) => [
      language.code,
      language.name,
      language.aiTranslationCode ?? "—",
    ]),
    width,
    { wrapColumn: 1 },
  );
}
