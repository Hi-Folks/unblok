import { configureSpaceAi } from "../actions/spaces/configure-ai.ts";
import { installAppById, installAppBySlug } from "../actions/apps/apps.ts";
import { assignStoryTags } from "../actions/stories/story-tags.ts";
import { isValidStoryCreationSlug } from "../actions/stories/create-story.ts";
import { ensureStoryFolder } from "../actions/stories/ensure-folder.ts";
import { publishStoryIfNeeded } from "../actions/stories/publish-story.ts";
import {
  createRelease,
  listReleases,
  publishRelease,
} from "../actions/releases/releases.ts";
import {
  editWorkflow,
  type EditWorkflowInput,
} from "../actions/workflows/edit-workflow.ts";
import {
  translateStoryWithAi,
  type AiTranslationLanguage,
} from "../actions/stories/ai-translate.ts";
import { ensurePipelineBranch } from "../actions/pipelines/branches.ts";
import {
  compilePipelineBranches,
  type BlueprintPipelineBranch,
} from "./blueprint-pipelines.ts";
import {
  compileReleases,
  compileReleasePublications,
  type BlueprintRelease,
} from "./blueprint-releases.ts";
import { CliError } from "../errors.ts";
import type { StoryblokGateway } from "../storyblok/gateway.ts";
import { planBlueprint } from "./blueprint.ts";
import {
  configureBlueprintSpace,
  type BlueprintConfiguration,
} from "./blueprint-configuration.ts";
import {
  ensureComponentField,
  type DesiredComponentField,
} from "../actions/components/ensure-field.ts";
import {
  applyAssets,
  type AssetDirectory,
  type PreparedAsset,
  type RemoteAsset,
} from "./blueprint-assets.ts";
import {
  applyStories,
  updateBlueprintStoryBlock,
  type StoryCreate,
  type StoryTranslations,
  type StoryBlockUpdate,
} from "./blueprint-stories.ts";
import {
  applyBlueprintWorkflow,
  type BlueprintWorkflow,
} from "./blueprint-workflow.ts";
import {
  AI_TRANSLATION_APP_ID,
  enableAiTranslation,
} from "../actions/apps/ai-translation.ts";
import {
  BlueprintOperationError,
  blueprintFailure,
  finishBlueprintReport,
  type BlueprintOperation,
} from "./blueprint-report.ts";
import {
  enableExperiments,
  EXPERIMENTS_APP_ID,
} from "../actions/apps/experiments.ts";
import {
  applyExperiment,
  compileExperiments,
  experimentOperations,
  pushBlueprintExperimentResults,
} from "./blueprint-experiments.ts";

type Mapping = Record<string, unknown>;
function isObject(value: unknown): value is Mapping {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function strings(value: unknown, path: string): string[] {
  if (
    !Array.isArray(value) ||
    !value.length ||
    value.some((item) => typeof item !== "string" || !item.trim())
  ) {
    throw new CliError(`${path} must be a non-empty array of strings.`, 2);
  }
  return [...new Set((value as string[]).map((item) => item.trim()))];
}

export interface SupportedBlueprint {
  apps: Array<{ slug: string } | { id: string }>;
  configuration: BlueprintConfiguration;
  continueOnAppError: boolean;
  aiTranslationDisclaimerId?: number;
  aiSettings?: { enabled: boolean; inheritOrgConfiguration: boolean };
  experiments?: ReturnType<typeof compileExperiments>;
  releases: BlueprintRelease[];
  releasePublications: string[];
  pipelines: BlueprintPipelineBranch[];
  fields: DesiredComponentField[];
  assets: AssetDirectory[];
  remoteAssets: RemoteAsset[];
  stories: StoryCreate[];
  aiTranslations: Array<{
    storyId?: number;
    storySlug?: string;
    languages: AiTranslationLanguage[];
    allLanguages: boolean;
    overwrite: boolean;
    review?: { stage: string; workflow?: string };
  }>;
  storyFolders: string[];
  translations: StoryTranslations[];
  storyUpdates: StoryBlockUpdate[];
  workflow: BlueprintWorkflow;
  workflowEdits: Array<Omit<EditWorkflowInput, "spaceId">>;
  tags: Array<{ slugs: string[]; tags: string[] }>;
}

export function compileSupportedBlueprint(value: unknown): SupportedBlueprint {
  planBlueprint(value);
  if (!isObject(value))
    throw new CliError("Setup file must contain an object.", 2);
  const unsupported = Object.keys(value).filter(
    (key) =>
      ![
        "version",
        "template",
        "execution",
        "inputs",
        "space",
        "preview",
        "demo_mode",
        "ai",
        "ai_translation",
        "experiments",
        "releases",
        "pipelines",
        "apps",
        "components",
        "assets",
        "stories",
        "workflow",
        "tags",
      ].includes(key),
  );
  if (unsupported.length)
    throw new CliError(
      `Blueprint execution does not yet support: ${unsupported.join(", ")}. No changes were made.`,
      2,
    );
  if (value.space !== undefined) {
    if (!isObject(value.space))
      throw new CliError("space must be an object.", 2);
    const unsupportedSpace = Object.keys(value.space).filter(
      (key) =>
        ![
          "name",
          "duplicate_from",
          "in_org",
          "demo",
          "readiness",
          "languages",
        ].includes(key),
    );
    if (unsupportedSpace.length)
      throw new CliError(
        `Blueprint execution does not yet support: ${unsupportedSpace.map((key) => `space.${key}`).join(", ")}. No changes were made.`,
        2,
      );
  }
  if (
    value.execution !== undefined &&
    (!isObject(value.execution) ||
      Object.keys(value.execution).some((key) => key !== "mode") ||
      (value.execution.mode !== undefined &&
        value.execution.mode !== "reconcile"))
  ) {
    throw new CliError("Only execution.mode: reconcile is supported.", 2);
  }
  const space = isObject(value.space) ? value.space : {};
  const languages =
    space.languages === undefined
      ? []
      : strings(space.languages, "space.languages");
  const configuration: BlueprintConfiguration = {
    languages,
    removeDemo: isObject(value.demo_mode) && value.demo_mode.remove === true,
  };
  if (value.preview !== undefined) {
    if (!isObject(value.preview))
      throw new CliError("preview must be an object.", 2);
    if (value.preview.enabled !== false) {
      if (
        typeof value.preview.default !== "string" ||
        !value.preview.default.trim()
      )
        throw new CliError(
          "preview.default is required when preview is enabled.",
          2,
        );
      const url = (value: string, path: string) => {
        try {
          const parsed = new URL(
            value.replaceAll("${{ space.preview_token }}", "preview-token"),
          );
          if (parsed.protocol !== "https:" && parsed.protocol !== "http:")
            throw new Error();
        } catch {
          throw new CliError(`${path} must be an HTTP or HTTPS URL.`, 2);
        }
        return value;
      };
      const domain = url(value.preview.default, "preview.default");
      let environments: Array<{ name: string; location: string }> | undefined;
      if (value.preview.environments !== undefined) {
        if (!Array.isArray(value.preview.environments))
          throw new CliError("preview.environments must be an array.", 2);
        environments = value.preview.environments.map((item, index) => {
          if (
            !isObject(item) ||
            typeof item.name !== "string" ||
            !item.name.trim() ||
            typeof item.url !== "string"
          )
            throw new CliError(
              `preview.environments[${index}] requires name and url.`,
              2,
            );
          return {
            name: item.name.trim(),
            location: url(item.url, `preview.environments[${index}].url`),
          };
        });
        if (
          new Set(environments.map((item) => item.name)).size !==
          environments.length
        )
          throw new CliError("preview environment names must be unique.", 2);
      }
      configuration.preview = {
        domain,
        ...(environments === undefined ? {} : { environments }),
      };
    }
  }
  const apps: SupportedBlueprint["apps"] = [];
  let aiSettings: SupportedBlueprint["aiSettings"];
  if (value.ai !== undefined) {
    if (
      !isObject(value.ai) ||
      Object.keys(value.ai).some(
        (key) => !["enabled", "inherit_org_configuration"].includes(key),
      ) ||
      typeof value.ai.enabled !== "boolean" ||
      typeof value.ai.inherit_org_configuration !== "boolean"
    )
      throw new CliError(
        "ai.enabled and ai.inherit_org_configuration must both be booleans.",
        2,
      );
    aiSettings = {
      enabled: value.ai.enabled,
      inheritOrgConfiguration: value.ai.inherit_org_configuration,
    };
  }
  let aiTranslationDisclaimerId: number | undefined;
  const experiments =
    value.experiments === undefined
      ? undefined
      : compileExperiments(value.experiments);
  const releases =
    value.releases === undefined ? [] : compileReleases(value.releases);
  const releasePublications =
    value.releases === undefined
      ? []
      : compileReleasePublications(value.releases as Record<string, unknown>);
  const pipelines =
    value.pipelines === undefined
      ? []
      : compilePipelineBranches(value.pipelines);
  if (value.ai_translation !== undefined) {
    if (
      !isObject(value.ai_translation) ||
      Object.keys(value.ai_translation).some(
        (key) => key !== "disclaimer_id",
      ) ||
      !/^\d+$/.test(String(value.ai_translation.disclaimer_id)) ||
      !Number.isSafeInteger(Number(value.ai_translation.disclaimer_id)) ||
      Number(value.ai_translation.disclaimer_id) <= 0
    )
      throw new CliError(
        "ai_translation.disclaimer_id must be a positive ID.",
        2,
      );
    aiTranslationDisclaimerId = Number(value.ai_translation.disclaimer_id);
  }
  let continueOnAppError = false;
  if (value.apps !== undefined) {
    if (!isObject(value.apps)) throw new CliError("apps must be an object.", 2);
    if (
      value.apps.continue_on_error !== undefined &&
      typeof value.apps.continue_on_error !== "boolean"
    )
      throw new CliError("apps.continue_on_error must be a boolean.", 2);
    continueOnAppError = value.apps.continue_on_error === true;
    if (value.apps.install !== undefined) {
      if (!Array.isArray(value.apps.install))
        throw new CliError("apps.install must be an array.", 2);
      for (const item of value.apps.install) {
        if (typeof item === "string" && item.trim())
          apps.push({ slug: item.trim() });
        else if (
          isObject(item) &&
          Object.keys(item).length === 1 &&
          (typeof item.id === "string" || typeof item.id === "number") &&
          /^\d+$/.test(String(item.id)) &&
          Number.isSafeInteger(Number(item.id)) &&
          Number(item.id) > 0
        )
          apps.push({ id: String(Number(item.id)) });
        else
          throw new CliError(
            "apps.install entries must be slugs or positive IDs.",
            2,
          );
      }
    }
  }
  const tags: SupportedBlueprint["tags"] = [];
  const fields: DesiredComponentField[] = [];
  const assets: AssetDirectory[] = [];
  const remoteAssets: RemoteAsset[] = [];
  const stories: StoryCreate[] = [];
  const aiTranslations: SupportedBlueprint["aiTranslations"] = [];
  const storyFolders: string[] = [];
  const storyUpdates: StoryBlockUpdate[] = [];
  const translations: StoryTranslations[] = [];
  const workflow: BlueprintWorkflow = {
    assignUnstaged: false,
    assignments: [],
  };
  const workflowEdits: SupportedBlueprint["workflowEdits"] = [];
  if (value.workflow !== undefined) {
    if (
      !isObject(value.workflow) ||
      Object.keys(value.workflow).some(
        (key) =>
          !["assign_unstaged", "stage_id", "assign", "edit"].includes(key),
      )
    )
      throw new CliError("Unsupported workflow options.", 2);
    if (value.workflow.edit !== undefined) {
      if (!Array.isArray(value.workflow.edit) || !value.workflow.edit.length)
        throw new CliError("workflow.edit must be a nonempty array.", 2);
      for (const item of value.workflow.edit) {
        if (
          !isObject(item) ||
          Object.keys(item).some(
            (key) =>
              ![
                "workflow",
                "name",
                "content_types",
                "per_language_stages",
              ].includes(key),
          ) ||
          typeof item.workflow !== "string" ||
          !item.workflow.trim() ||
          item.workflow !== item.workflow.trim() ||
          (item.name !== undefined &&
            (typeof item.name !== "string" ||
              !item.name.trim() ||
              item.name !== item.name.trim() ||
              !/^\d+$/.test(item.workflow))) ||
          (item.per_language_stages !== undefined &&
            typeof item.per_language_stages !== "boolean") ||
          (item.content_types !== undefined &&
            (!Array.isArray(item.content_types) ||
              item.content_types.some(
                (value) =>
                  typeof value !== "string" ||
                  !value.trim() ||
                  value !== value.trim(),
              ) ||
              new Set(item.content_types).size !==
                item.content_types.length)) ||
          (item.name === undefined &&
            item.content_types === undefined &&
            item.per_language_stages === undefined)
        )
          throw new CliError(
            "Invalid workflow.edit entry; renaming requires a workflow ID.",
            2,
          );
        workflowEdits.push({
          workflow: item.workflow,
          ...(typeof item.name === "string" ? { name: item.name } : {}),
          ...(Array.isArray(item.content_types)
            ? { contentTypes: item.content_types as string[] }
            : {}),
          ...(typeof item.per_language_stages === "boolean"
            ? { perLanguageStages: item.per_language_stages }
            : {}),
        });
      }
    }
    if (
      value.workflow.assign_unstaged !== undefined &&
      typeof value.workflow.assign_unstaged !== "boolean"
    )
      throw new CliError("workflow.assign_unstaged must be a boolean.", 2);
    workflow.assignUnstaged = value.workflow.assign_unstaged === true;
    if (
      value.workflow.stage_id !== undefined &&
      value.workflow.stage_id !== null
    ) {
      const id = Number(value.workflow.stage_id);
      if (
        !Number.isSafeInteger(id) ||
        id <= 0 ||
        !/^\d+$/.test(String(value.workflow.stage_id))
      )
        throw new CliError("workflow.stage_id must be a positive ID.", 2);
      if (!workflow.assignUnstaged)
        throw new CliError(
          "workflow.stage_id requires assign_unstaged: true.",
          2,
        );
      workflow.stageId = id;
    }
    if (value.workflow.assign !== undefined) {
      if (!Array.isArray(value.workflow.assign))
        throw new CliError("workflow.assign must be an array.", 2);
      for (const [index, item] of value.workflow.assign.entries()) {
        const path = `workflow.assign[${index}]`;
        if (
          !isObject(item) ||
          Object.keys(item).some(
            (key) => !["stories", "workflow", "stage"].includes(key),
          ) ||
          !isObject(item.stories) ||
          Object.keys(item.stories).some((key) => key !== "slugs") ||
          typeof item.workflow !== "string" ||
          !item.workflow.trim() ||
          typeof item.stage !== "string" ||
          !item.stage.trim()
        )
          throw new CliError(
            `${path} requires stories.slugs, workflow and stage.`,
            2,
          );
        const slugs = strings(item.stories.slugs, `${path}.stories.slugs`).map(
          (slug) => slug.replace(/^\/+|\/+$/g, ""),
        );
        if (
          slugs.some(
            (slug) => !slug || slug.includes("*") || slug.includes(","),
          )
        )
          throw new CliError(`${path} requires exact full story slugs.`, 2);
        workflow.assignments.push({
          slugs: [...new Set(slugs)],
          workflow: item.workflow.trim(),
          stage: item.stage.trim(),
        });
      }
    }
  }
  if (value.stories !== undefined) {
    if (
      !isObject(value.stories) ||
      Object.keys(value.stories).some(
        (key) =>
          ![
            "create",
            "translated_slugs",
            "update_blocks",
            "ensure_folders",
            "ai_translate",
          ].includes(key),
      )
    )
      throw new CliError("Unsupported stories options.", 2);
    if (value.stories.ai_translate !== undefined) {
      if (
        !Array.isArray(value.stories.ai_translate) ||
        !value.stories.ai_translate.length
      )
        throw new CliError("stories.ai_translate must be a nonempty array.", 2);
      for (const item of value.stories.ai_translate) {
        if (
          !isObject(item) ||
          Object.keys(item).some(
            (key) =>
              ![
                "story_id",
                "story_slug",
                "languages",
                "all_languages",
                "overwrite",
                "review_stage",
                "workflow",
              ].includes(key),
          ) ||
          (item.story_id !== undefined
            ? !/^[0-9]+$/.test(String(item.story_id)) ||
              !Number.isSafeInteger(Number(item.story_id)) ||
              Number(item.story_id) <= 0 ||
              item.story_slug !== undefined
            : typeof item.story_slug !== "string" ||
              item.story_slug !== item.story_slug.trim() ||
              !isValidStoryCreationSlug(item.story_slug)) ||
          (item.review_stage !== undefined &&
            (typeof item.review_stage !== "string" ||
              !item.review_stage.trim() ||
              item.review_stage !== item.review_stage.trim())) ||
          (item.workflow !== undefined &&
            (typeof item.workflow !== "string" ||
              !item.workflow.trim() ||
              item.workflow !== item.workflow.trim() ||
              item.review_stage === undefined)) ||
          (item.all_languages !== undefined && item.all_languages !== true) ||
          (item.all_languages === true
            ? item.languages !== undefined
            : !Array.isArray(item.languages) || !item.languages.length) ||
          (item.overwrite !== undefined && typeof item.overwrite !== "boolean")
        )
          throw new CliError("Invalid stories.ai_translate entry.", 2);
        const languages: AiTranslationLanguage[] = [];
        for (const language of Array.isArray(item.languages)
          ? item.languages
          : []) {
          if (
            !isObject(language) ||
            Object.keys(language).some(
              (key) => !["lang", "code"].includes(key),
            ) ||
            typeof language.lang !== "string" ||
            !language.lang.trim() ||
            language.lang !== language.lang.trim() ||
            typeof language.code !== "string" ||
            !language.code.trim() ||
            language.code !== language.code.trim() ||
            languages.some((other) => other.code === language.code)
          )
            throw new CliError(
              "Invalid or duplicate AI translation language.",
              2,
            );
          languages.push({ lang: language.lang, code: language.code });
        }
        aiTranslations.push({
          ...(item.story_id !== undefined
            ? { storyId: Number(item.story_id) }
            : { storySlug: item.story_slug as string }),
          languages,
          allLanguages: item.all_languages === true,
          overwrite: item.overwrite === true,
          ...(typeof item.review_stage === "string"
            ? {
                review: {
                  stage: item.review_stage,
                  ...(typeof item.workflow === "string"
                    ? { workflow: item.workflow }
                    : {}),
                },
              }
            : {}),
        });
      }
    }
    if (value.stories.ensure_folders !== undefined) {
      const paths = strings(
        value.stories.ensure_folders,
        "stories.ensure_folders",
      );
      if (paths.some((path) => !isValidStoryCreationSlug(path)))
        throw new CliError(
          "stories.ensure_folders requires valid folder paths.",
          2,
        );
      storyFolders.push(...paths);
    }
    if (value.stories.update_blocks !== undefined) {
      if (!Array.isArray(value.stories.update_blocks))
        throw new CliError("stories.update_blocks must be an array.", 2);
      for (const item of value.stories.update_blocks) {
        if (
          !isObject(item) ||
          Object.keys(item).some(
            (key) =>
              ![
                "story_slug",
                "component",
                "fields",
                "release_id",
                "release",
              ].includes(key),
          ) ||
          typeof item.story_slug !== "string" ||
          !item.story_slug.trim() ||
          item.story_slug !== item.story_slug.trim() ||
          /[*,]/.test(item.story_slug) ||
          typeof item.component !== "string" ||
          !item.component.trim() ||
          (item.release_id !== undefined &&
            (!Number.isSafeInteger(item.release_id) ||
              (item.release_id as number) <= 0)) ||
          (item.release !== undefined &&
            (typeof item.release !== "string" || !item.release.trim())) ||
          (item.release !== undefined && item.release_id !== undefined) ||
          !isObject(item.fields) ||
          !Object.keys(item.fields).length ||
          Object.keys(item.fields).some((key) =>
            [
              "_uid",
              "component",
              "__proto__",
              "constructor",
              "prototype",
            ].includes(key),
          )
        )
          throw new CliError(
            "stories.update_blocks requires an exact story_slug, component, and valid fields.",
            2,
          );
        storyUpdates.push({
          story_slug: item.story_slug,
          component: item.component,
          fields: item.fields,
          ...(item.release_id === undefined
            ? {}
            : { release_id: item.release_id as number }),
          ...(typeof item.release === "string"
            ? { release: item.release.trim() }
            : {}),
        });
      }
    }
    if (value.stories.create !== undefined) {
      if (!Array.isArray(value.stories.create))
        throw new CliError("stories.create must be an array.", 2);
      for (const [index, item] of value.stories.create.entries()) {
        const path = `stories.create[${index}]`;
        if (
          !isObject(item) ||
          Object.keys(item).some(
            (key) =>
              !["name", "slug", "content", "release_id", "release"].includes(
                key,
              ),
          ) ||
          typeof item.name !== "string" ||
          !item.name.trim() ||
          typeof item.slug !== "string" ||
          !item.slug.trim() ||
          !isValidStoryCreationSlug(item.slug) ||
          (item.release_id !== undefined &&
            (!Number.isSafeInteger(item.release_id) ||
              (item.release_id as number) <= 0)) ||
          (item.release !== undefined &&
            (typeof item.release !== "string" || !item.release.trim())) ||
          (item.release !== undefined && item.release_id !== undefined) ||
          !isObject(item.content) ||
          typeof item.content.component !== "string" ||
          !item.content.component.trim()
        )
          throw new CliError(
            `${path} requires name, a full story slug and content with a component.`,
            2,
          );
        const slug = item.slug.trim();
        if (stories.some((story) => story.slug === slug))
          throw new CliError(`${path} duplicates story slug '${slug}'.`, 2);
        stories.push({
          name: item.name.trim(),
          slug,
          content: item.content,
          ...(item.release_id === undefined
            ? {}
            : { releaseId: item.release_id as number }),
          ...(typeof item.release === "string"
            ? { release: item.release.trim() }
            : {}),
        });
      }
    }
    if (value.stories.translated_slugs !== undefined) {
      if (!Array.isArray(value.stories.translated_slugs))
        throw new CliError("stories.translated_slugs must be an array.", 2);
      for (const [index, item] of value.stories.translated_slugs.entries()) {
        const path = `stories.translated_slugs[${index}]`;
        if (
          !isObject(item) ||
          Object.keys(item).some(
            (key) => !["story_slug", "translations"].includes(key),
          ) ||
          typeof item.story_slug !== "string" ||
          !item.story_slug.trim() ||
          !isObject(item.translations) ||
          !Object.keys(item.translations).length
        )
          throw new CliError(
            `${path} requires story_slug and translations.`,
            2,
          );
        const slug = item.story_slug.trim().replace(/^\/+|\/+$/g, "");
        if (!slug || translations.some((group) => group.slug === slug))
          throw new CliError(
            `${path} has an invalid or duplicate story slug.`,
            2,
          );
        const entries = Object.entries(item.translations).map(
          ([lang, translation]) => {
            if (
              !lang.trim() ||
              !isObject(translation) ||
              Object.keys(translation).some(
                (key) => !["slug", "name"].includes(key),
              ) ||
              typeof translation.slug !== "string" ||
              !translation.slug.trim().replace(/^\/+|\/+$/g, "") ||
              (translation.name !== undefined &&
                typeof translation.name !== "string")
            )
              throw new CliError(
                `${path}.translations.${lang} requires a slug and optional name.`,
                2,
              );
            return {
              lang,
              slug: translation.slug.trim().replace(/^\/+|\/+$/g, ""),
              ...(typeof translation.name === "string"
                ? { name: translation.name }
                : {}),
            };
          },
        );
        translations.push({ slug, translations: entries });
      }
    }
  }
  if (value.assets !== undefined) {
    if (
      !isObject(value.assets) ||
      Object.keys(value.assets).some(
        (key) => !["upload_directory", "upload_url"].includes(key),
      ) ||
      (value.assets.upload_directory !== undefined &&
        !Array.isArray(value.assets.upload_directory)) ||
      (value.assets.upload_url !== undefined &&
        !Array.isArray(value.assets.upload_url))
    )
      throw new CliError("assets upload options must be arrays.", 2);
    for (const [index, item] of (
      value.assets.upload_directory ?? []
    ).entries()) {
      const path = `assets.upload_directory[${index}]`;
      if (
        !isObject(item) ||
        Object.keys(item).some(
          (key) => !["source", "target_folder", "include"].includes(key),
        )
      )
        throw new CliError(`${path} has unsupported options.`, 2);
      if (
        typeof item.source !== "string" ||
        !item.source.trim() ||
        typeof item.target_folder !== "string" ||
        !item.target_folder.trim()
      )
        throw new CliError(`${path} requires source and target_folder.`, 2);
      const folder = item.target_folder.replace(/^\/+|\/+$/g, "");
      if (
        !folder ||
        folder
          .split("/")
          .some((segment) => !segment || segment === "." || segment === "..")
      )
        throw new CliError(`${path}.target_folder is invalid.`, 2);
      const include =
        item.include === undefined
          ? undefined
          : strings(item.include, `${path}.include`);
      if (
        include?.some(
          (pattern) => pattern.includes("/") || pattern.includes("\\"),
        )
      )
        throw new CliError(
          `${path}.include only supports filename patterns.`,
          2,
        );
      assets.push({
        source: item.source,
        target_folder: folder,
        ...(include ? { include } : {}),
      });
    }
    for (const [index, item] of (value.assets.upload_url ?? []).entries()) {
      const path = `assets.upload_url[${index}]`;
      if (
        !isObject(item) ||
        Object.keys(item).some(
          (key) => !["name", "url", "target_folder", "filename"].includes(key),
        ) ||
        typeof item.name !== "string" ||
        !item.name.trim() ||
        typeof item.url !== "string" ||
        typeof item.target_folder !== "string" ||
        !item.target_folder.trim()
      )
        throw new CliError(`${path} requires name, url and target_folder.`, 2);
      let url: URL;
      try {
        url = new URL(item.url);
        if (
          !["http:", "https:"].includes(url.protocol) ||
          url.username ||
          url.password
        )
          throw new Error();
      } catch {
        throw new CliError(
          `${path}.url must be an HTTP or HTTPS URL without credentials.`,
          2,
        );
      }
      const folder = item.target_folder.replace(/^\/+|\/+$/g, "");
      if (
        !folder ||
        folder.split("/").some((part) => !part || part === "." || part === "..")
      )
        throw new CliError(`${path}.target_folder is invalid.`, 2);
      let filename: string;
      try {
        filename =
          item.filename === undefined
            ? decodeURIComponent(url.pathname.split("/").pop() ?? "")
            : String(item.filename);
      } catch {
        throw new CliError(`${path} has an invalid URL filename.`, 2);
      }
      if (
        typeof item.filename !== "undefined" &&
        typeof item.filename !== "string"
      )
        throw new CliError(`${path}.filename must be a string.`, 2);
      if (
        !filename ||
        filename === "." ||
        filename === ".." ||
        /[\/\\\x00-\x1f]/.test(filename) ||
        !/\.[^\.]+$/.test(filename)
      )
        throw new CliError(
          `${path} requires a valid filename with an extension.`,
          2,
        );
      const name = item.name.trim();
      if (remoteAssets.some((asset) => asset.name === name))
        throw new CliError(`${path}.name is duplicated.`, 2);
      remoteAssets.push({
        name,
        url: item.url,
        target_folder: folder,
        filename,
      });
    }
  }
  if (value.components !== undefined) {
    if (
      !isObject(value.components) ||
      Object.keys(value.components).some((key) => key !== "fields") ||
      !Array.isArray(value.components.fields)
    )
      throw new CliError("components.fields must be an array.", 2);
    const types = new Set([
      "text",
      "textarea",
      "richtext",
      "markdown",
      "number",
      "datetime",
      "boolean",
      "option",
      "options",
      "asset",
      "multiasset",
      "multilink",
      "table",
      "bloks",
      "section",
      "custom",
    ]);
    const allowed = [
      "component",
      "field",
      "type",
      "field_type",
      "tab",
      "display_name",
      "required",
      "translatable",
      "customize_toolbar",
    ];
    for (const [index, item] of value.components.fields.entries()) {
      const path = `components.fields[${index}]`;
      if (
        !isObject(item) ||
        Object.keys(item).some((key) => !allowed.includes(key))
      )
        throw new CliError(`${path} has unsupported options.`, 2);
      for (const key of ["component", "field", "type"])
        if (typeof item[key] !== "string" || !item[key].trim())
          throw new CliError(`${path}.${key} must be a non-empty string.`, 2);
      for (const key of ["field_type", "tab", "display_name"])
        if (
          item[key] !== undefined &&
          (typeof item[key] !== "string" || !item[key].trim())
        )
          throw new CliError(`${path}.${key} must be a non-empty string.`, 2);
      for (const key of ["required", "translatable", "customize_toolbar"])
        if (item[key] !== undefined && typeof item[key] !== "boolean")
          throw new CliError(`${path}.${key} must be a boolean.`, 2);
      if (!types.has(item.type as string))
        throw new CliError(`${path}.type is unsupported.`, 2);
      if (item.type === "custom" && !item.field_type)
        throw new CliError(
          `${path}.field_type is required for custom fields.`,
          2,
        );
      if (item.type !== "custom" && item.field_type !== undefined)
        throw new CliError(
          `${path}.field_type is only supported for custom fields.`,
          2,
        );
      if (item.type !== "richtext" && item.customize_toolbar !== undefined)
        throw new CliError(
          `${path}.customize_toolbar is only supported for richtext fields.`,
          2,
        );
      const field = {
        ...item,
        component: (item.component as string).trim(),
        field: (item.field as string).trim(),
        type: item.type as string,
      } as unknown as DesiredComponentField;
      if (
        fields.some(
          (previous) =>
            previous.component === field.component &&
            previous.field === field.field,
        )
      )
        throw new CliError(`${path} duplicates a component field.`, 2);
      fields.push(field);
    }
  }
  if (value.tags !== undefined) {
    if (!Array.isArray(value.tags))
      throw new CliError("tags must be an array.", 2);
    for (const [index, item] of value.tags.entries()) {
      if (
        !isObject(item) ||
        Object.keys(item).some((key) => !["stories", "tags"].includes(key)) ||
        !isObject(item.stories) ||
        Object.keys(item.stories).some((key) => key !== "slugs")
      ) {
        throw new CliError(
          `tags[${index}] must contain only stories.slugs and tags.`,
          2,
        );
      }
      const slugs = strings(item.stories.slugs, `tags[${index}].stories.slugs`);
      if (slugs.some((slug) => slug.includes("*") || slug.includes(",")))
        throw new CliError(`tags[${index}] requires exact full slugs.`, 2);
      tags.push({ slugs, tags: strings(item.tags, `tags[${index}].tags`) });
    }
  }
  if (
    JSON.stringify({
      languages,
      apps,
      fields,
      assets,
      remoteAssets,
      stories,
      aiTranslations,
      storyFolders,
      translations,
      storyUpdates,
      workflow,
      workflowEdits,
      tags,
      experiments,
      releases,
      releasePublications,
      pipelines,
    }).includes("${{")
  )
    throw new CliError(
      "Runtime blueprint expressions are supported only in preview URLs.",
      2,
    );
  return {
    apps: apps.filter(
      (app, index) =>
        apps.findIndex(
          (other) => JSON.stringify(other) === JSON.stringify(app),
        ) === index &&
        !(
          aiTranslationDisclaimerId &&
          "id" in app &&
          app.id === AI_TRANSLATION_APP_ID
        ),
    ),
    configuration,
    continueOnAppError,
    aiTranslationDisclaimerId,
    aiSettings,
    fields,
    assets,
    remoteAssets,
    stories,
    aiTranslations,
    storyFolders,
    translations,
    storyUpdates,
    workflow,
    workflowEdits,
    tags,
    experiments,
    releases,
    releasePublications,
    pipelines,
  };
}

export interface BlueprintProgress {
  stage:
    | "space"
    | "ai-translation"
    | "apps"
    | "components"
    | "assets"
    | "stories"
    | "translate-content"
    | "workflow-settings"
    | "workflow"
    | "tags"
    | "experiments"
    | "releases"
    | "publish-releases"
    | "pipelines";
  current?: number;
  total?: number;
  item?: string;
  failed?: boolean;
}

export async function applySupportedBlueprint(
  gateway: StoryblokGateway,
  spaceId: number,
  blueprint: SupportedBlueprint,
  preparedAssets: PreparedAsset[] = [],
  onProgress?: (progress: BlueprintProgress) => void,
) {
  if (
    (blueprint.assets.length || blueprint.remoteAssets.length) &&
    !preparedAssets.length
  )
    throw new CliError(
      "Asset files must be prepared before applying the blueprint.",
      2,
    );
  const operations: BlueprintOperation[] = [];
  const groups: Array<Array<{ operation: string; key: string }>> = [
    [
      ...blueprint.configuration.languages.map((key) => ({
        operation: "ensure-language",
        key,
      })),
      ...(blueprint.configuration.preview
        ? [{ operation: "configure-preview", key: "preview" }]
        : []),
      ...(blueprint.configuration.removeDemo
        ? [{ operation: "remove-demo-mode", key: "demo" }]
        : []),
      ...(blueprint.aiSettings
        ? [{ operation: "configure-space-ai", key: "space" }]
        : []),
    ],
    blueprint.aiTranslationDisclaimerId === undefined
      ? []
      : [
          {
            operation: "accept-ai-translation-disclaimer",
            key: String(blueprint.aiTranslationDisclaimerId),
          },
          { operation: "install-ai-translations", key: AI_TRANSLATION_APP_ID },
        ],
    [
      ...blueprint.apps.map((app) => ({
        operation: "install-app",
        key: "slug" in app ? app.slug : app.id,
      })),
      ...blueprint.releases.map((item) => ({
        operation: "create-release",
        key: item.name,
      })),
      ...blueprint.workflowEdits.map((item) => ({
        operation: "edit-workflow",
        key: item.workflow,
      })),
    ],
    blueprint.fields.map((field) => ({
      operation: "ensure-component-field",
      key: `${field.component}.${field.field}`,
    })),
    preparedAssets.map((asset) => ({
      operation: "upload-asset",
      key: `${asset.folder}/${asset.name}`,
    })),
    [
      ...blueprint.storyFolders.map((key) => ({
        operation: "ensure-story-folder",
        key,
      })),
      ...blueprint.stories.map((story) => ({
        operation: "create-story",
        key: story.slug,
      })),
      ...blueprint.translations.map((item) => ({
        operation: "translate-story-slugs",
        key: item.slug,
      })),
      ...blueprint.aiTranslations.flatMap((item) =>
        item.allLanguages
          ? [
              {
                operation: "ai-translate-story",
                key: `${item.storySlug ?? item.storyId}/all`,
              },
            ]
          : item.languages.map((language) => ({
              operation: "ai-translate-story",
              key: `${item.storySlug ?? item.storyId}/${language.code}`,
            })),
      ),
    ],
    [
      ...(blueprint.workflow.assignUnstaged
        ? [{ operation: "assign-unstaged", key: "all unstaged stories" }]
        : []),
      ...blueprint.workflow.assignments.flatMap((item) =>
        item.slugs.map((key) => ({ operation: "assign-workflow", key })),
      ),
    ],
    blueprint.tags.flatMap((group) =>
      group.slugs.map((key) => ({ operation: "assign-tags", key })),
    ),
    blueprint.experiments
      ? [
          {
            operation: "accept-experiments-disclaimer",
            key: String(blueprint.experiments.disclaimerId),
          },
          { operation: "install-experiments", key: EXPERIMENTS_APP_ID },
        ]
      : [],
    blueprint.experiments?.create.flatMap(experimentOperations) ?? [],
    blueprint.storyUpdates.map((item) => ({
      operation: "update-story-block",
      key: `${item.story_slug}/${item.component}`,
    })),
    blueprint.experiments?.create.map((item) => ({
      operation: "push-experiment-results",
      key: item.name,
    })) ?? [],
    [],
    blueprint.pipelines.map((item) => ({
      operation: "create-pipeline-branch",
      key: item.name,
    })),
    blueprint.releasePublications.map((key) => ({
      operation: "publish-release",
      key,
    })),
  ];
  const releaseIds = new Map<string, number>();
  const resolveRelease = async (name: string): Promise<number> => {
    const cached = releaseIds.get(name);
    if (cached !== undefined) return cached;
    const matches = (await listReleases(gateway, { spaceId })).filter(
      (item) => item.name === name,
    );
    if (!matches.length)
      throw new CliError(`Release '${name}' was not found.`, 1, "NOT_FOUND");
    if (matches.length > 1)
      throw new CliError(
        `Multiple releases named '${name}' exist.`,
        1,
        "AMBIGUOUS",
      );
    const release = matches[0]!;
    if (!Number.isSafeInteger(release.id) || release.id <= 0)
      throw new CliError(`Release '${name}' has an invalid ID.`, 1, "CONFLICT");
    releaseIds.set(name, release.id);
    return release.id;
  };
  const finish = (stoppedAt?: number) => {
    if (stoppedAt === undefined)
      return finishBlueprintReport(spaceId, operations);
    const pending = groups.slice(stoppedAt).flat();
    const recorded = new Map<string, number>();
    for (const item of operations) {
      const id = `${item.operation}\0${item.key}`;
      recorded.set(id, (recorded.get(id) ?? 0) + 1);
    }
    if (operations.some((item) => item.operation === "assign-unstaged"))
      recorded.set("assign-unstaged\0all unstaged stories", 1);
    const notRun = pending.filter((item) => {
      const id = `${item.operation}\0${item.key}`;
      const count = recorded.get(id) ?? 0;
      if (count) {
        recorded.set(id, count - 1);
        return false;
      }
      return true;
    });
    const report = finishBlueprintReport(spaceId, operations, notRun);
    if (stoppedAt >= 8 && stoppedAt <= 11 && report.recovery)
      report.recovery.message = `Inspect the experiment and partial changes in space ${spaceId} before retrying.`;
    return report;
  };
  try {
    if (groups[0]?.length) onProgress?.({ stage: "space" });
    await configureBlueprintSpace(
      gateway,
      spaceId,
      blueprint.configuration,
      operations,
    );
    if (blueprint.aiSettings) {
      try {
        const status = await configureSpaceAi(
          gateway,
          spaceId,
          blueprint.aiSettings,
        );
        operations.push({
          operation: "configure-space-ai",
          key: "space",
          status,
        });
      } catch (error) {
        throw new BlueprintOperationError("configure-space-ai", "space", error);
      }
    }
  } catch (error) {
    operations.push({
      operation:
        error instanceof BlueprintOperationError
          ? error.operation
          : "configure-space",
      key: error instanceof BlueprintOperationError ? error.key : "space",
      status: "failed",
      ...blueprintFailure(error),
    });
    if (
      error instanceof BlueprintOperationError &&
      error.operation === "configure-languages"
    )
      groups[0] = (groups[0] ?? []).filter(
        (item) => item.operation !== "ensure-language",
      );
    return finish(0);
  }
  if (blueprint.aiTranslationDisclaimerId !== undefined) {
    onProgress?.({ stage: "ai-translation" });
    try {
      await enableAiTranslation(
        gateway,
        spaceId,
        blueprint.aiTranslationDisclaimerId,
        operations,
      );
    } catch (error) {
      const last = operations.at(-1);
      if (last?.status === "failed")
        Object.assign(last, blueprintFailure(error));
      else
        operations.push({
          operation: "enable-ai-translations",
          key: AI_TRANSLATION_APP_ID,
          status: "failed",
          ...blueprintFailure(error),
        });
      return finish(1);
    }
  }
  for (const [index, app] of blueprint.apps.entries()) {
    const key = "slug" in app ? app.slug : app.id;
    onProgress?.({
      stage: "apps",
      current: index + 1,
      total: blueprint.apps.length,
      item: key,
    });
    try {
      const result =
        "slug" in app
          ? await installAppBySlug(gateway, spaceId, app.slug)
          : await installAppById(gateway, spaceId, app.id);
      operations.push({ operation: "install-app", key, status: result.status });
    } catch (error) {
      operations.push({
        operation: "install-app",
        key,
        status: "failed",
        ...blueprintFailure(error),
      });
      onProgress?.({
        stage: "apps",
        current: index + 1,
        total: blueprint.apps.length,
        item: key,
        failed: true,
      });
      if (!blueprint.continueOnAppError) return finish(2);
    }
  }
  for (const [index, release] of blueprint.releases.entries()) {
    onProgress?.({
      stage: "releases",
      current: index + 1,
      total: blueprint.releases.length,
      item: release.name,
    });
    try {
      const result = await createRelease(gateway, { spaceId, ...release });
      if (!Number.isSafeInteger(result.release.id) || result.release.id <= 0)
        throw new CliError(
          `Release '${release.name}' has an invalid ID.`,
          1,
          "CONFLICT",
        );
      releaseIds.set(release.name, result.release.id);
      operations.push({
        operation: "create-release",
        key: release.name,
        status: result.status,
      });
    } catch (error) {
      operations.push({
        operation: "create-release",
        key: release.name,
        status: "failed",
        ...blueprintFailure(error),
      });
      return finish(2);
    }
  }
  for (const item of blueprint.workflowEdits) {
    onProgress?.({ stage: "workflow-settings", item: item.workflow });
    try {
      const result = await editWorkflow(gateway, { spaceId, ...item });
      operations.push({
        operation: "edit-workflow",
        key: item.workflow,
        status: result.status,
      });
    } catch (error) {
      operations.push({
        operation: "edit-workflow",
        key: item.workflow,
        status: "failed",
        ...blueprintFailure(error),
      });
      return finish(2);
    }
  }
  for (const [index, field] of blueprint.fields.entries()) {
    const key = `${field.component}.${field.field}`;
    onProgress?.({
      stage: "components",
      current: index + 1,
      total: blueprint.fields.length,
      item: key,
    });
    try {
      const result = await ensureComponentField(gateway, spaceId, field);
      operations.push({
        operation: "ensure-component-field",
        key,
        status: result.status,
      });
    } catch (error) {
      operations.push({
        operation: "ensure-component-field",
        key,
        status: "failed",
        ...blueprintFailure(error),
      });
      return finish(3);
    }
  }
  try {
    if (preparedAssets.length)
      onProgress?.({ stage: "assets", total: preparedAssets.length });
    await applyAssets(
      gateway,
      spaceId,
      preparedAssets,
      operations,
      (item, current, total) =>
        onProgress?.({ stage: "assets", item, current, total }),
    );
  } catch (error) {
    operations.push({
      operation: "upload-asset",
      key: error instanceof BlueprintOperationError ? error.key : "assets",
      status: "failed",
      ...blueprintFailure(error),
    });
    return finish(4);
  }
  try {
    if (
      blueprint.storyFolders.length ||
      blueprint.stories.length ||
      blueprint.translations.length
    )
      onProgress?.({ stage: "stories" });
    for (const path of blueprint.storyFolders) {
      try {
        onProgress?.({ stage: "stories", item: path });
        const result = await ensureStoryFolder(gateway, { spaceId, path });
        operations.push({
          operation: "ensure-story-folder",
          key: path,
          status: result.status,
        });
      } catch (error) {
        throw new BlueprintOperationError("ensure-story-folder", path, error);
      }
    }
    await applyStories(
      gateway,
      spaceId,
      blueprint.stories,
      blueprint.translations,
      operations,
      blueprint.remoteAssets,
      resolveRelease,
      (item) => onProgress?.({ stage: "stories", item }),
    );
    if (blueprint.aiTranslations.length)
      onProgress?.({ stage: "translate-content" });
    for (const item of blueprint.aiTranslations) {
      const reference = item.storySlug ?? String(item.storyId);
      if (item.allLanguages)
        onProgress?.({ stage: "translate-content", item: `${reference}/all` });
      let storyId = item.storyId;
      if (item.storySlug !== undefined) {
        try {
          const found = await gateway.findStoryBySlug(spaceId, item.storySlug);
          if (
            !found ||
            found.is_folder ||
            found.full_slug !== item.storySlug ||
            !Number.isSafeInteger(found.id) ||
            found.id <= 0
          )
            throw new CliError(
              `Story '${item.storySlug}' was not found or could not be verified.`,
              1,
              "NOT_FOUND",
            );
          storyId = found.id;
        } catch (error) {
          const firstLanguage = item.allLanguages
            ? "all"
            : item.languages[0]?.code;
          throw new BlueprintOperationError(
            "ai-translate-story",
            `${reference}/${firstLanguage}`,
            error,
          );
        }
      }
      if (storyId === undefined)
        throw new CliError(
          "A story ID or slug is required.",
          1,
          "INVALID_INPUT",
        );
      if (item.allLanguages) {
        const key = `${reference}/all`;
        try {
          const report = await translateStoryWithAi(gateway, {
            spaceId,
            storyId,
            allLanguages: true,
            overwrite: item.overwrite,
            review: item.review,
          });
          const details = report.results
            .map(
              (result) =>
                `${result.language.code}: ${result.status}${result.backgroundTaskId ? ` (background task ${result.backgroundTaskId})` : ""}${result.error ? ` (${result.error.message})` : ""}${result.review ? `, review ${result.review.status}${result.review.error ? ` (${result.review.error.message})` : ""}` : ""}`,
            )
            .join("; ");
          const failures = report.results.flatMap((result) => [
            ...(result.error
              ? [
                  {
                    language: result.language.code,
                    phase: "translation" as const,
                    error: result.error,
                  },
                ]
              : []),
            ...(result.review?.error
              ? [
                  {
                    language: result.language.code,
                    phase: "review" as const,
                    error: result.review.error,
                  },
                ]
              : []),
          ]);
          operations.push({
            operation: "ai-translate-story",
            key,
            status: report.failed
              ? "failed"
              : report.results.some((result) => result.status === "queued")
                ? "queued"
                : report.results.some((result) => result.status === "updated")
                  ? "updated"
                  : "unchanged",
            ...(report.failed ? { error: details } : { reason: details }),
            ...(failures.length ? { failures } : {}),
            ...(failures.length === 1 ? { errorInfo: failures[0]!.error } : {}),
          });
          if (report.failed) return finish(5);
        } catch (error) {
          throw new BlueprintOperationError("ai-translate-story", key, error);
        }
        continue;
      }
      for (const language of item.languages) {
        const key = `${reference}/${language.code}`;
        onProgress?.({ stage: "translate-content", item: key });
        const report = await translateStoryWithAi(gateway, {
          spaceId,
          storyId,
          languages: [language],
          overwrite: item.overwrite,
          review: item.review,
        });
        const result = report.results[0]!;
        operations.push({
          operation: "ai-translate-story",
          key,
          status: result.review?.status === "failed" ? "failed" : result.status,
          ...(result.error || result.review?.error
            ? {
                error:
                  result.error?.message ??
                  `Translation ${result.status}${result.backgroundTaskId ? ` (background task ${result.backgroundTaskId})` : ""}; review failed: ${result.review?.error?.message}`,
                errorInfo: result.error ?? result.review?.error,
              }
            : {}),
          ...(result.backgroundTaskId
            ? {
                reason: `Background task ${result.backgroundTaskId} started; completion was not checked.`,
              }
            : {}),
        });
        if (report.failed) return finish(5);
      }
    }
  } catch (error) {
    operations.push({
      operation:
        error instanceof BlueprintOperationError
          ? error.operation
          : "configure-stories",
      key: error instanceof BlueprintOperationError ? error.key : "stories",
      status: "failed",
      ...blueprintFailure(error),
    });
    return finish(5);
  }
  try {
    if (
      blueprint.workflow.assignUnstaged ||
      blueprint.workflow.assignments.length
    )
      onProgress?.({ stage: "workflow" });
    if (
      await applyBlueprintWorkflow(
        gateway,
        spaceId,
        blueprint.workflow,
        operations,
        (item, current, failed) =>
          onProgress?.({ stage: "workflow", item, current, failed }),
      )
    )
      return finish(6);
  } catch (error) {
    operations.push({
      operation: "configure-workflow",
      key: "workflow",
      status: "failed",
      ...blueprintFailure(error),
    });
    return finish(6);
  }
  for (const [index, group] of blueprint.tags.entries()) {
    onProgress?.({
      stage: "tags",
      current: index + 1,
      total: blueprint.tags.length,
    });
    try {
      const failures = new Map<number, unknown>();
      const report = await assignStoryTags(
        gateway,
        spaceId,
        group.slugs,
        group.tags,
        { onFailure: (storyId, error) => failures.set(storyId, error) },
      );
      for (const item of report.operations)
        operations.push({
          operation: "assign-tags",
          key: item.slug,
          status: item.status,
          ...(failures.has(item.storyId)
            ? blueprintFailure(failures.get(item.storyId))
            : item.error
              ? { error: item.error }
              : {}),
        });
    } catch (error) {
      operations.push({
        operation: "assign-tags",
        key: group.slugs.join(", "),
        status: "failed",
        ...blueprintFailure(error),
      });
    }
  }
  if (blueprint.experiments) {
    if (operations.some((operation) => operation.status === "failed"))
      return finish(8);
    onProgress?.({ stage: "experiments", item: "Install Experiments" });
    try {
      await enableExperiments(
        gateway,
        spaceId,
        blueprint.experiments.disclaimerId,
        operations,
      );
      if (
        !operations.some(
          (item) => item.operation === "accept-experiments-disclaimer",
        )
      )
        operations.push({
          operation: "accept-experiments-disclaimer",
          key: String(blueprint.experiments.disclaimerId),
          status: "skipped",
          reason:
            "Experiments is already installed; disclaimer was not checked.",
        });
    } catch (error) {
      const last = operations.at(-1);
      if (last?.status === "failed")
        Object.assign(last, blueprintFailure(error));
      else
        operations.push({
          operation: "install-experiments",
          key: EXPERIMENTS_APP_ID,
          status: "failed",
          ...blueprintFailure(error),
        });
      return finish(8);
    }
    const created: Array<{
      item: (typeof blueprint.experiments.create)[number];
      id: number;
      storyId: number;
      status: string;
    }> = [];
    for (const item of blueprint.experiments.create) {
      onProgress?.({ stage: "experiments", item: item.name });
      try {
        const result = await applyExperiment(
          gateway,
          spaceId,
          item,
          operations,
        );
        created.push({
          item,
          id: result.id,
          storyId: result.storyId,
          status: result.status,
        });
      } catch {
        return finish(9);
      }
    }
    for (const update of blueprint.storyUpdates) {
      const key = `${update.story_slug}/${update.component}`;
      try {
        if (update.release !== undefined || update.release_id !== undefined) {
          const releaseId =
            update.release === undefined
              ? update.release_id
              : await resolveRelease(update.release);
          const changed = await updateBlueprintStoryBlock(
            gateway,
            spaceId,
            update,
            undefined,
            true,
            releaseId,
          );
          operations.push({
            operation: "update-story-block",
            key,
            status: changed ? "updated" : "unchanged",
          });
          continue;
        }
        const ids: number[] = [];
        let running = false;
        for (const experiment of created) {
          const response = await gateway.getExperiment(spaceId, experiment.id);
          if (
            !isObject(response) ||
            !isObject(response.experiment) ||
            !Array.isArray(response.experiment.experiment_variants)
          )
            throw new CliError(
              "Experiment variant mappings are missing; cannot safely identify the variant story.",
            );
          for (const variant of response.experiment.experiment_variants) {
            if (
              !isObject(variant) ||
              typeof variant.is_control !== "boolean" ||
              !Array.isArray(variant.story_mappings)
            )
              throw new CliError("Experiment variant mappings are incomplete.");
            if (variant.is_control) continue;
            for (const mapping of variant.story_mappings)
              if (
                isObject(mapping) &&
                mapping.original_story_id === experiment.storyId &&
                mapping.variant_slug === update.story_slug &&
                typeof mapping.variant_story_id === "number" &&
                Number.isSafeInteger(mapping.variant_story_id) &&
                mapping.variant_story_id > 0 &&
                mapping.variant_story_id !== experiment.storyId
              ) {
                ids.push(mapping.variant_story_id);
                running = experiment.status === "running";
              }
          }
        }
        if (ids.length !== 1)
          throw new CliError(
            `Expected exactly one non-control mapping for '${update.story_slug}'; found ${ids.length}.`,
          );
        const changed = await updateBlueprintStoryBlock(
          gateway,
          spaceId,
          update,
          ids[0],
          !running,
          undefined,
        );
        operations.push({
          operation: "update-story-block",
          key,
          status: changed ? "updated" : "unchanged",
        });
      } catch (error) {
        operations.push({
          operation: "update-story-block",
          key,
          status: "failed",
          ...blueprintFailure(error),
        });
        return finish(10);
      }
    }
    for (const experiment of created) {
      if (!experiment.item.activate) {
        operations.push({
          operation: "push-experiment-results",
          key: experiment.item.name,
          status: "skipped",
          reason:
            "The experiment is a draft; set activate to publish variants and start it.",
        });
        continue;
      }
      const key = experiment.item.name;
      try {
        const original = await gateway.getStory(spaceId, experiment.storyId);
        if (!original.published)
          throw new CliError(
            `Original story '${experiment.item.story_slug}' must be published before activation.`,
          );
        const response = await gateway.getExperiment(spaceId, experiment.id);
        if (
          !isObject(response) ||
          !isObject(response.experiment) ||
          !Array.isArray(response.experiment.experiment_variants)
        )
          throw new CliError("Experiment variant mappings are missing.");
        const ids: number[] = [];
        for (const desired of experiment.item.variants.filter(
          (variant) => !variant.is_control,
        )) {
          const matches = response.experiment.experiment_variants.filter(
            (variant: unknown) =>
              isObject(variant) &&
              variant.name === desired.name &&
              variant.is_control === false,
          );
          if (
            matches.length !== 1 ||
            !isObject(matches[0]) ||
            !Array.isArray(matches[0].story_mappings)
          )
            throw new CliError(
              `Mappings for variant '${desired.name}' are missing or ambiguous.`,
            );
          const mappings = matches[0].story_mappings.filter(
            (mapping: unknown) =>
              isObject(mapping) &&
              mapping.original_story_id === experiment.storyId,
          );
          const mapping = mappings[0];
          if (
            mappings.length !== 1 ||
            !isObject(mapping) ||
            typeof mapping.variant_story_id !== "number" ||
            !Number.isSafeInteger(mapping.variant_story_id) ||
            mapping.variant_story_id <= 0 ||
            mapping.variant_story_id === experiment.storyId
          )
            throw new CliError(
              `Mapping for variant '${desired.name}' is invalid.`,
            );
          ids.push(mapping.variant_story_id);
        }
        if (new Set(ids).size !== ids.length)
          throw new CliError(
            "Variant mappings must reference distinct stories.",
          );
        for (const id of ids) {
          const story = await gateway.getStory(spaceId, id);
          if (story.id !== id || story.is_folder)
            throw new CliError(`Variant story ${id} is invalid.`);
          if (
            experiment.status === "running" &&
            (!story.published || story.unpublished_changes)
          )
            throw new CliError(
              `Running variant story ${id} has unpublished changes; inspect it before continuing.`,
            );
          const result = await publishStoryIfNeeded(gateway, spaceId, story);
          operations.push({
            operation: "publish-experiment-variant",
            key: String(id),
            status: result.status === "published" ? "completed" : "unchanged",
          });
        }
        if (experiment.status !== "running")
          await gateway.activateExperiment(spaceId, experiment.id);
        operations.push({
          operation: "activate-experiment",
          key,
          status: experiment.status === "running" ? "unchanged" : "completed",
        });
      } catch (error) {
        operations.push({
          operation: "activate-experiment",
          key,
          status: "failed",
          ...blueprintFailure(error),
        });
        return finish(11);
      }
      try {
        const existing = await gateway.getExperimentResults(
          spaceId,
          experiment.id,
        );
        if (existing == null)
          await pushBlueprintExperimentResults(
            gateway,
            spaceId,
            experiment.id,
            experiment.item,
            operations,
          );
        else
          operations.push({
            operation: "push-experiment-results",
            key,
            status: "skipped",
            reason: "Existing results were preserved.",
          });
      } catch (error) {
        if (
          !operations.some(
            (operation) =>
              operation.operation === "push-experiment-results" &&
              operation.key === key &&
              operation.status === "failed",
          )
        )
          operations.push({
            operation: "push-experiment-results",
            key,
            status: "failed",
            ...blueprintFailure(error),
          });
        return finish(11);
      }
    }
  } else {
    for (const update of blueprint.storyUpdates) {
      const key = `${update.story_slug}/${update.component}`;
      try {
        const changed = await updateBlueprintStoryBlock(
          gateway,
          spaceId,
          update,
          undefined,
          true,
          update.release === undefined
            ? update.release_id
            : await resolveRelease(update.release),
        );
        operations.push({
          operation: "update-story-block",
          key,
          status:
            update.release !== undefined || update.release_id !== undefined
              ? changed
                ? "updated"
                : "unchanged"
              : "updated",
        });
      } catch (error) {
        operations.push({
          operation: "update-story-block",
          key,
          status: "failed",
          ...blueprintFailure(error),
        });
        return finish(10);
      }
    }
  }
  for (const [index, branch] of blueprint.pipelines.entries()) {
    onProgress?.({
      stage: "pipelines",
      current: index + 1,
      total: blueprint.pipelines.length,
      item: branch.name,
    });
    try {
      const result = await ensurePipelineBranch(gateway, {
        spaceId,
        ...branch,
      });
      operations.push({
        operation: "create-pipeline-branch",
        key: branch.name,
        status: result.status,
      });
    } catch (error) {
      operations.push({
        operation: "create-pipeline-branch",
        key: branch.name,
        status: "failed",
        ...blueprintFailure(error),
      });
      return finish(13);
    }
  }
  if (operations.some((operation) => operation.status === "failed"))
    return finish(14);
  for (const [index, reference] of blueprint.releasePublications.entries()) {
    onProgress?.({
      stage: "publish-releases",
      item: reference,
      current: index + 1,
      total: blueprint.releasePublications.length,
    });
    try {
      if (
        operations.some(
          (operation) =>
            operation.operation === "ai-translate-story" &&
            operation.status === "queued",
        )
      )
        throw new CliError(
          "Translation tasks were queued in this setup; check their completion before publishing the release.",
          1,
          "CONFLICT",
        );
      const result = await publishRelease(gateway, { spaceId, reference });
      operations.push({
        operation: "publish-release",
        key: reference,
        status: result.status,
      });
    } catch (error) {
      operations.push({
        operation: "publish-release",
        key: reference,
        status: "failed",
        ...blueprintFailure(error),
      });
      return finish(14);
    }
  }
  return finish();
}
