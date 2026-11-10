import { isDeepStrictEqual } from "node:util";
import { CliError } from "../../errors.ts";
import type { StoryblokGateway } from "../../storyblok/gateway.ts";
import {
  errorInfo,
  toUnblokError,
  type UnblokErrorInfo,
} from "../action-error.ts";
import {
  prepareTranslationReview,
  type TranslationReviewGateway,
  type TranslationReviewOptions,
} from "./translation-review.ts";

export type AiTranslationGateway = Pick<
  StoryblokGateway,
  "getStory" | "aiTranslateStory" | "updateStoryContent"
> &
  Partial<Pick<StoryblokGateway, "listLanguages"> & TranslationReviewGateway>;
export interface AiTranslationLanguage {
  lang: string;
  code: string;
}
export interface TranslateStoryInput {
  spaceId: number;
  storyId: number;
  languages?: AiTranslationLanguage[];
  allLanguages?: boolean;
  overwrite?: boolean;
  review?: TranslationReviewOptions;
}
export interface AiTranslationResult {
  language: AiTranslationLanguage;
  status: "updated" | "unchanged" | "queued" | "failed" | "not_run";
  backgroundTaskId?: number;
  review?: {
    status: "assigned" | "unchanged" | "failed";
    error?: UnblokErrorInfo;
  };
  error?: UnblokErrorInfo;
}

function preservesContent(
  before: unknown,
  after: unknown,
  code: string,
  overwrite: boolean,
): boolean {
  if (Array.isArray(before))
    return (
      Array.isArray(after) &&
      before.length === after.length &&
      before.every((item, index) =>
        preservesContent(item, after[index], code, overwrite),
      )
    );
  if (!before || typeof before !== "object")
    return isDeepStrictEqual(before, after);
  if (!after || typeof after !== "object" || Array.isArray(after)) return false;
  const original = before as Record<string, unknown>;
  const translated = after as Record<string, unknown>;
  const suffix = `__i18n__${code}`;
  for (const [key, value] of Object.entries(original)) {
    if (!Object.hasOwn(translated, key)) return false;
    if (key.endsWith(suffix) && overwrite) continue;
    if (!preservesContent(value, translated[key], code, overwrite))
      return false;
  }
  return Object.keys(translated).every(
    (key) => Object.hasOwn(original, key) || key.endsWith(suffix),
  );
}

/** Translate and save one language at a time. Failed languages do not stop later ones. */
export async function translateStoryWithAi(
  gateway: AiTranslationGateway,
  input: TranslateStoryInput,
): Promise<{ results: AiTranslationResult[]; failed: boolean }> {
  try {
    if (
      !input ||
      !Number.isSafeInteger(input.spaceId) ||
      input.spaceId <= 0 ||
      !Number.isSafeInteger(input.storyId) ||
      input.storyId <= 0 ||
      (input.allLanguages !== undefined &&
        typeof input.allLanguages !== "boolean") ||
      (input.allLanguages === true
        ? input.languages !== undefined
        : !Array.isArray(input.languages) || !input.languages.length) ||
      (input.overwrite !== undefined && typeof input.overwrite !== "boolean")
    )
      throw new CliError(
        "Provide positive space and story IDs, and at least one language.",
        1,
        "INVALID_INPUT",
      );
    let languages = input.languages;
    if (input.allLanguages === true) {
      if (!gateway.listLanguages)
        throw new CliError(
          "The gateway does not support listing space languages.",
          1,
          "INVALID_INPUT",
        );
      const configured = await gateway.listLanguages(input.spaceId);
      if (!Array.isArray(configured) || !configured.length)
        throw new CliError(
          "No additional languages are configured in this space.",
          1,
          "NOT_FOUND",
        );
      const unmapped = configured.filter(
        (item) =>
          typeof item.aiTranslationCode !== "string" ||
          !item.aiTranslationCode.trim() ||
          item.aiTranslationCode !== item.aiTranslationCode.trim(),
      );
      if (unmapped.length)
        throw new CliError(
          `Missing AI translation code for space languages: ${unmapped.map((item) => item.code).join(", ")}.`,
          1,
          "INVALID_INPUT",
        );
      languages = configured.map((item) => ({
        code: item.code,
        lang: item.aiTranslationCode!,
      }));
    }
    if (!languages)
      throw new CliError("Provide at least one language.", 1, "INVALID_INPUT");
    const codes = new Set<string>();
    for (const language of languages) {
      if (
        !language ||
        typeof language.lang !== "string" ||
        !language.lang.trim() ||
        language.lang !== language.lang.trim() ||
        typeof language.code !== "string" ||
        !language.code.trim() ||
        language.code !== language.code.trim() ||
        codes.has(language.code)
      )
        throw new CliError(
          "Provide unique language codes and nonempty AI language codes.",
          1,
          "INVALID_INPUT",
        );
      codes.add(language.code);
    }
    let reviewStageId: number | undefined;
    if (input.review !== undefined) {
      if (
        !gateway.listWorkflows ||
        !gateway.listWorkflowStages ||
        !gateway.getWorkflowStage ||
        !gateway.updateWorkflow ||
        !gateway.assignWorkflowStage
      )
        throw new CliError(
          "The gateway does not support language-based workflow assignment.",
          1,
          "INVALID_INPUT",
        );
      reviewStageId = await prepareTranslationReview(
        gateway as TranslationReviewGateway,
        input.spaceId,
        input.review,
      );
    }
    const results: AiTranslationResult[] = [];
    const addResult = async (result: AiTranslationResult): Promise<void> => {
      if (reviewStageId !== undefined) {
        try {
          const current = await gateway.getStory(input.spaceId, input.storyId);
          if (current?.id !== input.storyId || current.is_folder)
            throw new CliError(
              "The story could not be verified for workflow assignment.",
              1,
              "CONFLICT",
            );
          if (
            current.stages?.some(
              (stage) =>
                stage.language === result.language.code &&
                stage.workflow_stage_id === reviewStageId,
            )
          )
            result.review = { status: "unchanged" };
          else {
            await gateway.assignWorkflowStage!(input.spaceId, {
              storyId: input.storyId,
              stageId: reviewStageId,
              language: result.language.code,
            });
            result.review = { status: "assigned" };
          }
        } catch (error) {
          result.review = { status: "failed", error: errorInfo(error) };
        }
      }
      results.push(result);
    };
    for (const language of languages) {
      try {
        const before = await gateway.getStory(input.spaceId, input.storyId);
        const content = before?.content;
        if (
          before?.id !== input.storyId ||
          !content ||
          typeof content !== "object" ||
          Array.isArray(content)
        )
          throw new CliError(
            "Storyblok returned an invalid story.",
            1,
            "CONFLICT",
          );
        const translated = await gateway.aiTranslateStory(
          input.spaceId,
          input.storyId,
          { ...language, overwrite: input.overwrite === true },
        );
        if ("backgroundTaskId" in translated) {
          if (
            !Number.isSafeInteger(translated.backgroundTaskId) ||
            translated.backgroundTaskId <= 0
          )
            throw new CliError(
              "Storyblok returned an invalid background task ID.",
              1,
              "CONFLICT",
            );
          await addResult({
            language,
            status: "queued",
            backgroundTaskId: translated.backgroundTaskId,
          });
          continue;
        }
        if (
          translated?.id !== input.storyId ||
          !translated.content ||
          typeof translated.content !== "object" ||
          Array.isArray(translated.content)
        )
          throw new CliError(
            "Storyblok returned invalid translated content.",
            1,
            "CONFLICT",
          );
        if (
          !preservesContent(
            content,
            translated.content,
            language.code,
            input.overwrite === true,
          )
        )
          throw new CliError(
            "Translated content changed unrelated or existing fields; no changes were saved.",
            1,
            "CONFLICT",
          );
        const current = await gateway.getStory(input.spaceId, input.storyId);
        if (
          current?.id !== input.storyId ||
          !isDeepStrictEqual(content, current.content)
        )
          throw new CliError(
            "Story content changed during translation; retry after reviewing it.",
            1,
            "CONFLICT",
          );
        const changed = !isDeepStrictEqual(content, translated.content);
        if (changed)
          await gateway.updateStoryContent(
            input.spaceId,
            input.storyId,
            translated.content as Record<string, unknown>,
          );
        await addResult({
          language,
          status: changed ? "updated" : "unchanged",
        });
      } catch (error) {
        results.push({ language, status: "failed", error: errorInfo(error) });
      }
    }
    return {
      results,
      failed: results.some(
        (result) =>
          result.status === "failed" ||
          result.status === "not_run" ||
          result.review?.status === "failed",
      ),
    };
  } catch (error) {
    throw toUnblokError(error);
  }
}
