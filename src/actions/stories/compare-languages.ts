import { CliError } from "../../errors.ts";
import { isDeepStrictEqual } from "node:util";
import type { StoryblokGateway } from "../../storyblok/gateway.ts";
import { toUnblokError } from "../action-error.ts";

export type CompareLanguagesGateway = Pick<
  StoryblokGateway,
  "getStory" | "findStoryBySlug" | "listComponents" | "listLanguages"
>;
export interface CompareLanguagesInput {
  spaceId: number;
  story: string;
  languages: readonly string[];
}
export interface ComparedValue {
  status: "present" | "empty" | "missing";
  value?: unknown;
}
export interface ComparedField {
  path: string;
  component: string;
  blockUid?: string;
  source: ComparedValue;
  translations: Array<
    ComparedValue & { language: string; matchesSource?: boolean }
  >;
}
export interface CompareLanguagesReport {
  apiVersion: "unblok/story-language-comparison-v1";
  story: { id: number; fullSlug: string };
  languages: string[];
  fields: ComparedField[];
  summary: { fields: number; present: number; empty: number; missing: number };
}

function object(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}
function pointer(value: string): string {
  return value.replaceAll("~", "~0").replaceAll("/", "~1");
}
function storedValue(
  block: Record<string, unknown>,
  key: string,
): ComparedValue {
  if (!Object.hasOwn(block, key)) return { status: "missing" };
  const value = block[key];
  return {
    status:
      value === null || (typeof value === "string" && !value.trim())
        ? "empty"
        : "present",
    value,
  };
}

/** Compare stored field-level values using the space's component schemas. */
export async function compareStoryLanguages(
  gateway: CompareLanguagesGateway,
  input: CompareLanguagesInput,
): Promise<CompareLanguagesReport> {
  try {
    if (
      !input ||
      !Number.isSafeInteger(input.spaceId) ||
      input.spaceId <= 0 ||
      typeof input.story !== "string" ||
      !input.story.trim() ||
      input.story !== input.story.trim() ||
      /[*,]/.test(input.story) ||
      !Array.isArray(input.languages) ||
      !input.languages.length ||
      input.languages.some(
        (language) =>
          typeof language !== "string" ||
          !language.trim() ||
          language !== language.trim(),
      ) ||
      new Set(input.languages).size !== input.languages.length
    )
      throw new CliError(
        "Provide a positive spaceId, an exact story ID or slug, and unique nonempty language codes.",
        1,
        "INVALID_INPUT",
      );
    let storyId: number;
    if (/^\d+$/.test(input.story)) {
      storyId = Number(input.story);
      if (!Number.isSafeInteger(storyId) || storyId <= 0)
        throw new CliError("Provide a positive story ID.", 1, "INVALID_INPUT");
    } else {
      const found = await gateway.findStoryBySlug(input.spaceId, input.story);
      if (!found)
        throw new CliError(
          `Story '${input.story}' was not found.`,
          1,
          "NOT_FOUND",
        );
      if (!Number.isSafeInteger(found.id) || found.id <= 0)
        throw new CliError(
          "The story lookup returned an invalid ID.",
          1,
          "CONFLICT",
        );
      storyId = found.id;
    }
    const [story, components, configuredLanguages] = await Promise.all([
      gateway.getStory(input.spaceId, storyId),
      gateway.listComponents(input.spaceId),
      gateway.listLanguages(input.spaceId),
    ]);
    if (
      !story ||
      story.id !== storyId ||
      story.is_folder ||
      !object(story.content) ||
      typeof story.content.component !== "string" ||
      !story.content.component ||
      typeof story.full_slug !== "string" ||
      !story.full_slug ||
      (!/^\d+$/.test(input.story) && story.full_slug !== input.story)
    )
      throw new CliError(
        "Story content or identity could not be verified.",
        1,
        "CONFLICT",
      );
    if (!Array.isArray(components) || !Array.isArray(configuredLanguages))
      throw new CliError(
        "Component schemas or space languages could not be verified.",
        1,
        "CONFLICT",
      );
    const configured = new Set(configuredLanguages.map((item) => item.code));
    const unknown = input.languages.filter(
      (language) => !configured.has(language),
    );
    if (unknown.length)
      throw new CliError(
        `Languages not configured in the space: ${unknown.join(", ")}.`,
        1,
        "NOT_FOUND",
      );
    const fields: ComparedField[] = [];
    const visit = (value: unknown, path: string): void => {
      if (Array.isArray(value)) {
        value.forEach((child, index) => visit(child, `${path}/${index}`));
        return;
      }
      if (!object(value)) return;
      const translatable = new Set<string>();
      if (typeof value.component === "string") {
        const matches = components.filter(
          (component) => component.name === value.component,
        );
        if (matches.length !== 1)
          throw new CliError(
            `Component '${value.component}' was not found or is ambiguous.`,
            1,
            matches.length ? "AMBIGUOUS" : "NOT_FOUND",
          );
        const schema = matches[0]?.schema;
        if (!object(schema))
          throw new CliError(
            `Component '${value.component}' has no usable schema.`,
            1,
            "CONFLICT",
          );
        for (const [field, definition] of Object.entries(schema)) {
          if (
            !object(definition) ||
            definition.translatable !== true ||
            definition.type === "bloks"
          )
            continue;
          translatable.add(field);
          const source = storedValue(value, field);
          fields.push({
            path: `${path}/${pointer(field)}`,
            component: value.component,
            ...(typeof value._uid === "string" ? { blockUid: value._uid } : {}),
            source,
            translations: input.languages.map((language) => {
              const translation = storedValue(
                value,
                `${field}__i18n__${language}`,
              );
              return {
                language,
                ...translation,
                ...(source.status !== "missing" &&
                translation.status !== "missing"
                  ? {
                      matchesSource: isDeepStrictEqual(
                        source.value,
                        translation.value,
                      ),
                    }
                  : {}),
              };
            }),
          });
        }
      }
      for (const [key, child] of Object.entries(value)) {
        if (
          key.includes("__i18n__") ||
          translatable.has(key) ||
          key === "_editable"
        )
          continue;
        visit(child, `${path}/${pointer(key)}`);
      }
    };
    visit(story.content, "");
    const summary = { fields: fields.length, present: 0, empty: 0, missing: 0 };
    for (const field of fields)
      for (const translation of field.translations)
        summary[translation.status]++;
    return {
      apiVersion: "unblok/story-language-comparison-v1",
      story: { id: storyId, fullSlug: story.full_slug },
      languages: [...input.languages],
      fields,
      summary,
    };
  } catch (error) {
    throw toUnblokError(error);
  }
}
