import { configureSpaceAi } from "../actions/spaces/configure-ai.ts";
import { installAppById, installAppBySlug } from "../actions/apps/apps.ts";
import { assignStoryTags } from "../actions/stories/story-tags.ts";
import { CliError } from "../errors.ts";
import type { StoryblokGateway } from "../storyblok/gateway.ts";
import { planBlueprint } from "./blueprint.ts";
import { configureBlueprintSpace, type BlueprintConfiguration } from "./blueprint-configuration.ts";
import { ensureComponentField, type DesiredComponentField } from "../actions/components/ensure-field.ts";
import { applyAssets, type AssetDirectory, type PreparedAsset, type RemoteAsset } from "./blueprint-assets.ts";
import { applyStories, type StoryCreate, type StoryTranslations } from "./blueprint-stories.ts";
import { applyBlueprintWorkflow, type BlueprintWorkflow } from "./blueprint-workflow.ts";
import { AI_TRANSLATION_APP_ID, enableAiTranslation } from "../actions/apps/ai-translation.ts";
import { BlueprintOperationError, finishBlueprintReport, type BlueprintOperation } from "./blueprint-report.ts";

type Mapping = Record<string, unknown>;
function isObject(value: unknown): value is Mapping {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function strings(value: unknown, path: string): string[] {
  if (!Array.isArray(value) || !value.length || value.some((item) => typeof item !== "string" || !item.trim())) {
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
  fields: DesiredComponentField[];
  assets: AssetDirectory[];
  remoteAssets: RemoteAsset[];
  stories: StoryCreate[];
  translations: StoryTranslations[];
  workflow: BlueprintWorkflow;
  tags: Array<{ slugs: string[]; tags: string[] }>;
}

export function compileSupportedBlueprint(value: unknown): SupportedBlueprint {
  planBlueprint(value);
  if (!isObject(value)) throw new CliError("Setup file must contain an object.", 2);
  const unsupported = Object.keys(value).filter((key) => !["version", "template", "execution", "inputs", "space", "preview", "demo_mode", "ai", "ai_translation", "apps", "components", "assets", "stories", "workflow", "tags"].includes(key));
  if (unsupported.length) throw new CliError(`Blueprint execution does not yet support: ${unsupported.join(", ")}. No changes were made.`, 2);
  if (value.space !== undefined) {
    if (!isObject(value.space)) throw new CliError("space must be an object.", 2);
    const unsupportedSpace = Object.keys(value.space).filter((key) => !["name", "duplicate_from", "in_org", "demo", "readiness", "languages"].includes(key));
    if (unsupportedSpace.length) throw new CliError(`Blueprint execution does not yet support: ${unsupportedSpace.map((key) => `space.${key}`).join(", ")}. No changes were made.`, 2);
  }
  if (value.execution !== undefined && (!isObject(value.execution) || Object.keys(value.execution).some((key) => key !== "mode") || (value.execution.mode !== undefined && value.execution.mode !== "reconcile"))) {
    throw new CliError("Only execution.mode: reconcile is supported.", 2);
  }
  const space = isObject(value.space) ? value.space : {};
  const languages = space.languages === undefined ? [] : strings(space.languages, "space.languages");
  const configuration: BlueprintConfiguration = { languages, removeDemo: isObject(value.demo_mode) && value.demo_mode.remove === true };
  if (value.preview !== undefined) {
    if (!isObject(value.preview)) throw new CliError("preview must be an object.", 2);
    if (value.preview.enabled !== false) {
      if (typeof value.preview.default !== "string" || !value.preview.default.trim()) throw new CliError("preview.default is required when preview is enabled.", 2);
      const url = (value: string, path: string) => {
        try {
          const parsed = new URL(value.replaceAll("${{ space.preview_token }}", "preview-token"));
          if (parsed.protocol !== "https:" && parsed.protocol !== "http:") throw new Error();
        } catch { throw new CliError(`${path} must be an HTTP or HTTPS URL.`, 2); }
        return value;
      };
      const domain = url(value.preview.default, "preview.default");
      let environments: Array<{ name: string; location: string }> | undefined;
      if (value.preview.environments !== undefined) {
        if (!Array.isArray(value.preview.environments)) throw new CliError("preview.environments must be an array.", 2);
        environments = value.preview.environments.map((item, index) => {
          if (!isObject(item) || typeof item.name !== "string" || !item.name.trim() || typeof item.url !== "string") throw new CliError(`preview.environments[${index}] requires name and url.`, 2);
          return { name: item.name.trim(), location: url(item.url, `preview.environments[${index}].url`) };
        });
        if (new Set(environments.map((item) => item.name)).size !== environments.length) throw new CliError("preview environment names must be unique.", 2);
      }
      configuration.preview = { domain, ...(environments === undefined ? {} : { environments }) };
    }
  }
  const apps: SupportedBlueprint["apps"] = [];
  let aiSettings: SupportedBlueprint["aiSettings"];
  if (value.ai !== undefined) {
    if (!isObject(value.ai) || Object.keys(value.ai).some((key) => !["enabled", "inherit_org_configuration"].includes(key)) || typeof value.ai.enabled !== "boolean" || typeof value.ai.inherit_org_configuration !== "boolean") throw new CliError("ai.enabled and ai.inherit_org_configuration must both be booleans.", 2);
    aiSettings = { enabled: value.ai.enabled, inheritOrgConfiguration: value.ai.inherit_org_configuration };
  }
  let aiTranslationDisclaimerId: number | undefined;
  if (value.ai_translation !== undefined) {
    if (!isObject(value.ai_translation) || Object.keys(value.ai_translation).some((key) => key !== "disclaimer_id") || !/^\d+$/.test(String(value.ai_translation.disclaimer_id)) || !Number.isSafeInteger(Number(value.ai_translation.disclaimer_id)) || Number(value.ai_translation.disclaimer_id) <= 0) throw new CliError("ai_translation.disclaimer_id must be a positive ID.", 2);
    aiTranslationDisclaimerId = Number(value.ai_translation.disclaimer_id);
  }
  let continueOnAppError = false;
  if (value.apps !== undefined) {
    if (!isObject(value.apps)) throw new CliError("apps must be an object.", 2);
    if (value.apps.continue_on_error !== undefined && typeof value.apps.continue_on_error !== "boolean") throw new CliError("apps.continue_on_error must be a boolean.", 2);
    continueOnAppError = value.apps.continue_on_error === true;
    if (value.apps.install !== undefined) {
      if (!Array.isArray(value.apps.install)) throw new CliError("apps.install must be an array.", 2);
      for (const item of value.apps.install) {
        if (typeof item === "string" && item.trim()) apps.push({ slug: item.trim() });
        else if (isObject(item) && Object.keys(item).length === 1 && (typeof item.id === "string" || typeof item.id === "number") && /^\d+$/.test(String(item.id)) && Number.isSafeInteger(Number(item.id)) && Number(item.id) > 0) apps.push({ id: String(Number(item.id)) });
        else throw new CliError("apps.install entries must be slugs or positive IDs.", 2);
      }
    }
  }
  const tags: SupportedBlueprint["tags"] = [];
  const fields: DesiredComponentField[] = [];
  const assets: AssetDirectory[] = [];
  const remoteAssets: RemoteAsset[] = [];
  const stories: StoryCreate[] = [];
  const translations: StoryTranslations[] = [];
  const workflow: BlueprintWorkflow = { assignUnstaged: false, assignments: [] };
  if (value.workflow !== undefined) {
    if (!isObject(value.workflow) || Object.keys(value.workflow).some((key) => !["assign_unstaged", "stage_id", "assign"].includes(key))) throw new CliError("Unsupported workflow options.", 2);
    if (value.workflow.assign_unstaged !== undefined && typeof value.workflow.assign_unstaged !== "boolean") throw new CliError("workflow.assign_unstaged must be a boolean.", 2);
    workflow.assignUnstaged = value.workflow.assign_unstaged === true;
    if (value.workflow.stage_id !== undefined && value.workflow.stage_id !== null) {
      const id = Number(value.workflow.stage_id);
      if (!Number.isSafeInteger(id) || id <= 0 || !/^\d+$/.test(String(value.workflow.stage_id))) throw new CliError("workflow.stage_id must be a positive ID.", 2);
      if (!workflow.assignUnstaged) throw new CliError("workflow.stage_id requires assign_unstaged: true.", 2);
      workflow.stageId = id;
    }
    if (value.workflow.assign !== undefined) {
      if (!Array.isArray(value.workflow.assign)) throw new CliError("workflow.assign must be an array.", 2);
      for (const [index, item] of value.workflow.assign.entries()) {
        const path = `workflow.assign[${index}]`;
        if (!isObject(item) || Object.keys(item).some((key) => !["stories", "workflow", "stage"].includes(key)) || !isObject(item.stories) || Object.keys(item.stories).some((key) => key !== "slugs") || typeof item.workflow !== "string" || !item.workflow.trim() || typeof item.stage !== "string" || !item.stage.trim()) throw new CliError(`${path} requires stories.slugs, workflow and stage.`, 2);
        const slugs = strings(item.stories.slugs, `${path}.stories.slugs`).map((slug) => slug.replace(/^\/+|\/+$/g, ""));
        if (slugs.some((slug) => !slug || slug.includes("*") || slug.includes(","))) throw new CliError(`${path} requires exact full story slugs.`, 2);
        workflow.assignments.push({ slugs: [...new Set(slugs)], workflow: item.workflow.trim(), stage: item.stage.trim() });
      }
    }
  }
  if (value.stories !== undefined) {
    if (!isObject(value.stories) || Object.keys(value.stories).some((key) => !["create", "translated_slugs"].includes(key))) throw new CliError("Unsupported stories options.", 2);
    if (value.stories.create !== undefined) {
      if (!Array.isArray(value.stories.create)) throw new CliError("stories.create must be an array.", 2);
      for (const [index, item] of value.stories.create.entries()) {
        const path = `stories.create[${index}]`;
        if (!isObject(item) || Object.keys(item).some((key) => !["name", "slug", "content"].includes(key)) || typeof item.name !== "string" || !item.name.trim() || typeof item.slug !== "string" || !item.slug.trim() || item.slug.includes("/") || !isObject(item.content) || typeof item.content.component !== "string" || !item.content.component.trim()) throw new CliError(`${path} requires name, a root-level slug and content with a component.`, 2);
        const slug = item.slug.trim();
        if (stories.some((story) => story.slug === slug)) throw new CliError(`${path} duplicates story slug '${slug}'.`, 2);
        stories.push({ name: item.name.trim(), slug, content: item.content });
      }
    }
    if (value.stories.translated_slugs !== undefined) {
      if (!Array.isArray(value.stories.translated_slugs)) throw new CliError("stories.translated_slugs must be an array.", 2);
      for (const [index, item] of value.stories.translated_slugs.entries()) {
        const path = `stories.translated_slugs[${index}]`;
        if (!isObject(item) || Object.keys(item).some((key) => !["story_slug", "translations"].includes(key)) || typeof item.story_slug !== "string" || !item.story_slug.trim() || !isObject(item.translations) || !Object.keys(item.translations).length) throw new CliError(`${path} requires story_slug and translations.`, 2);
        const slug = item.story_slug.trim().replace(/^\/+|\/+$/g, "");
        if (!slug || translations.some((group) => group.slug === slug)) throw new CliError(`${path} has an invalid or duplicate story slug.`, 2);
        const entries = Object.entries(item.translations).map(([lang, translation]) => {
          if (!lang.trim() || !isObject(translation) || Object.keys(translation).some((key) => !["slug", "name"].includes(key)) || typeof translation.slug !== "string" || !translation.slug.trim().replace(/^\/+|\/+$/g, "") || (translation.name !== undefined && typeof translation.name !== "string")) throw new CliError(`${path}.translations.${lang} requires a slug and optional name.`, 2);
          return { lang, slug: translation.slug.trim().replace(/^\/+|\/+$/g, ""), ...(typeof translation.name === "string" ? { name: translation.name } : {}) };
        });
        translations.push({ slug, translations: entries });
      }
    }
  }
  if (value.assets !== undefined) {
    if (!isObject(value.assets) || Object.keys(value.assets).some((key) => !["upload_directory", "upload_url"].includes(key)) || (value.assets.upload_directory !== undefined && !Array.isArray(value.assets.upload_directory)) || (value.assets.upload_url !== undefined && !Array.isArray(value.assets.upload_url))) throw new CliError("assets upload options must be arrays.", 2);
    for (const [index, item] of (value.assets.upload_directory ?? []).entries()) {
      const path = `assets.upload_directory[${index}]`;
      if (!isObject(item) || Object.keys(item).some((key) => !["source", "target_folder", "include"].includes(key))) throw new CliError(`${path} has unsupported options.`, 2);
      if (typeof item.source !== "string" || !item.source.trim() || typeof item.target_folder !== "string" || !item.target_folder.trim()) throw new CliError(`${path} requires source and target_folder.`, 2);
      const folder = item.target_folder.replace(/^\/+|\/+$/g, "");
      if (!folder || folder.split("/").some((segment) => !segment || segment === "." || segment === "..")) throw new CliError(`${path}.target_folder is invalid.`, 2);
      const include = item.include === undefined ? undefined : strings(item.include, `${path}.include`);
      if (include?.some((pattern) => pattern.includes("/") || pattern.includes("\\"))) throw new CliError(`${path}.include only supports filename patterns.`, 2);
      assets.push({ source: item.source, target_folder: folder, ...(include ? { include } : {}) });
    }
    for (const [index, item] of (value.assets.upload_url ?? []).entries()) {
      const path = `assets.upload_url[${index}]`;
      if (!isObject(item) || Object.keys(item).some((key) => !["name", "url", "target_folder", "filename"].includes(key)) || typeof item.name !== "string" || !item.name.trim() || typeof item.url !== "string" || typeof item.target_folder !== "string" || !item.target_folder.trim()) throw new CliError(`${path} requires name, url and target_folder.`, 2);
      let url: URL;
      try { url = new URL(item.url); if (!["http:", "https:"].includes(url.protocol) || url.username || url.password) throw new Error(); } catch { throw new CliError(`${path}.url must be an HTTP or HTTPS URL without credentials.`, 2); }
      const folder = item.target_folder.replace(/^\/+|\/+$/g, "");
      if (!folder || folder.split("/").some((part) => !part || part === "." || part === "..")) throw new CliError(`${path}.target_folder is invalid.`, 2);
      let filename: string;
      try { filename = item.filename === undefined ? decodeURIComponent(url.pathname.split("/").pop() ?? "") : String(item.filename); } catch { throw new CliError(`${path} has an invalid URL filename.`, 2); }
      if (typeof item.filename !== "undefined" && typeof item.filename !== "string") throw new CliError(`${path}.filename must be a string.`, 2);
      if (!filename || filename === "." || filename === ".." || /[\/\\\x00-\x1f]/.test(filename) || !/\.[^\.]+$/.test(filename)) throw new CliError(`${path} requires a valid filename with an extension.`, 2);
      const name = item.name.trim();
      if (remoteAssets.some((asset) => asset.name === name)) throw new CliError(`${path}.name is duplicated.`, 2);
      remoteAssets.push({ name, url: item.url, target_folder: folder, filename });
    }
  }
  if (value.components !== undefined) {
    if (!isObject(value.components) || Object.keys(value.components).some((key) => key !== "fields") || !Array.isArray(value.components.fields)) throw new CliError("components.fields must be an array.", 2);
    const types = new Set(["text", "textarea", "richtext", "markdown", "number", "datetime", "boolean", "option", "options", "asset", "multiasset", "multilink", "table", "bloks", "section", "custom"]);
    const allowed = ["component", "field", "type", "field_type", "tab", "display_name", "required", "translatable", "customize_toolbar"];
    for (const [index, item] of value.components.fields.entries()) {
      const path = `components.fields[${index}]`;
      if (!isObject(item) || Object.keys(item).some((key) => !allowed.includes(key))) throw new CliError(`${path} has unsupported options.`, 2);
      for (const key of ["component", "field", "type"]) if (typeof item[key] !== "string" || !item[key].trim()) throw new CliError(`${path}.${key} must be a non-empty string.`, 2);
      for (const key of ["field_type", "tab", "display_name"]) if (item[key] !== undefined && (typeof item[key] !== "string" || !item[key].trim())) throw new CliError(`${path}.${key} must be a non-empty string.`, 2);
      for (const key of ["required", "translatable", "customize_toolbar"]) if (item[key] !== undefined && typeof item[key] !== "boolean") throw new CliError(`${path}.${key} must be a boolean.`, 2);
      if (!types.has(item.type as string)) throw new CliError(`${path}.type is unsupported.`, 2);
      if (item.type === "custom" && !item.field_type) throw new CliError(`${path}.field_type is required for custom fields.`, 2);
      if (item.type !== "custom" && item.field_type !== undefined) throw new CliError(`${path}.field_type is only supported for custom fields.`, 2);
      if (item.type !== "richtext" && item.customize_toolbar !== undefined) throw new CliError(`${path}.customize_toolbar is only supported for richtext fields.`, 2);
      const field = { ...item, component: (item.component as string).trim(), field: (item.field as string).trim(), type: item.type as string } as unknown as DesiredComponentField;
      if (fields.some((previous) => previous.component === field.component && previous.field === field.field)) throw new CliError(`${path} duplicates a component field.`, 2);
      fields.push(field);
    }
  }
  if (value.tags !== undefined) {
    if (!Array.isArray(value.tags)) throw new CliError("tags must be an array.", 2);
    for (const [index, item] of value.tags.entries()) {
      if (!isObject(item) || Object.keys(item).some((key) => !["stories", "tags"].includes(key)) || !isObject(item.stories) || Object.keys(item.stories).some((key) => key !== "slugs")) {
        throw new CliError(`tags[${index}] must contain only stories.slugs and tags.`, 2);
      }
      const slugs = strings(item.stories.slugs, `tags[${index}].stories.slugs`);
      if (slugs.some((slug) => slug.includes("*") || slug.includes(","))) throw new CliError(`tags[${index}] requires exact full slugs.`, 2);
      tags.push({ slugs, tags: strings(item.tags, `tags[${index}].tags`) });
    }
  }
  if (JSON.stringify({ languages, apps, fields, assets, remoteAssets, stories, translations, workflow, tags }).includes("${{")) throw new CliError("Runtime blueprint expressions are supported only in preview URLs.", 2);
  return { apps: apps.filter((app, index) => apps.findIndex((other) => JSON.stringify(other) === JSON.stringify(app)) === index && !(aiTranslationDisclaimerId && "id" in app && app.id === AI_TRANSLATION_APP_ID)), configuration, continueOnAppError, aiTranslationDisclaimerId, aiSettings, fields, assets, remoteAssets, stories, translations, workflow, tags };
}

export interface BlueprintProgress {
  stage: "space" | "ai-translation" | "apps" | "components" | "assets" | "stories" | "workflow" | "tags";
  current?: number;
  total?: number;
  item?: string;
  failed?: boolean;
}

export async function applySupportedBlueprint(gateway: StoryblokGateway, spaceId: number, blueprint: SupportedBlueprint, preparedAssets: PreparedAsset[] = [], onProgress?: (progress: BlueprintProgress) => void) {
  if ((blueprint.assets.length || blueprint.remoteAssets.length) && !preparedAssets.length) throw new CliError("Asset files must be prepared before applying the blueprint.", 2);
  const operations: BlueprintOperation[] = [];
  const groups: Array<Array<{ operation: string; key: string }>> = [
    [
      ...blueprint.configuration.languages.map((key) => ({ operation: "ensure-language", key })),
      ...(blueprint.configuration.preview ? [{ operation: "configure-preview", key: "preview" }] : []),
      ...(blueprint.configuration.removeDemo ? [{ operation: "remove-demo-mode", key: "demo" }] : []),
      ...(blueprint.aiSettings ? [{ operation: "configure-space-ai", key: "space" }] : []),
    ],
    blueprint.aiTranslationDisclaimerId === undefined ? [] : [{ operation: "accept-ai-translation-disclaimer", key: String(blueprint.aiTranslationDisclaimerId) }, { operation: "install-ai-translations", key: AI_TRANSLATION_APP_ID }],
    blueprint.apps.map((app) => ({ operation: "install-app", key: "slug" in app ? app.slug : app.id })),
    blueprint.fields.map((field) => ({ operation: "ensure-component-field", key: `${field.component}.${field.field}` })),
    preparedAssets.map((asset) => ({ operation: "upload-asset", key: `${asset.folder}/${asset.name}` })),
    [...blueprint.stories.map((story) => ({ operation: "create-story", key: story.slug })), ...blueprint.translations.map((item) => ({ operation: "translate-story-slugs", key: item.slug }))],
    [...(blueprint.workflow.assignUnstaged ? [{ operation: "assign-unstaged", key: "all unstaged stories" }] : []), ...blueprint.workflow.assignments.flatMap((item) => item.slugs.map((key) => ({ operation: "assign-workflow", key })))],
    blueprint.tags.flatMap((group) => group.slugs.map((key) => ({ operation: "assign-tags", key }))),
  ];
  const finish = (stoppedAt?: number) => {
    if (stoppedAt === undefined) return finishBlueprintReport(spaceId, operations);
    const pending = groups.slice(stoppedAt).flat();
    const recorded = new Map<string, number>();
    for (const item of operations) {
      const id = `${item.operation}\0${item.key}`;
      recorded.set(id, (recorded.get(id) ?? 0) + 1);
    }
    if (operations.some((item) => item.operation === "assign-unstaged")) recorded.set("assign-unstaged\0all unstaged stories", 1);
    const notRun = pending.filter((item) => {
      const id = `${item.operation}\0${item.key}`;
      const count = recorded.get(id) ?? 0;
      if (count) { recorded.set(id, count - 1); return false; }
      return true;
    });
    return finishBlueprintReport(spaceId, operations, notRun);
  };
  try {
    if (groups[0]?.length) onProgress?.({ stage: "space" });
    await configureBlueprintSpace(gateway, spaceId, blueprint.configuration, operations);
    if (blueprint.aiSettings) {
      try {
        const status = await configureSpaceAi(gateway, spaceId, blueprint.aiSettings);
        operations.push({ operation: "configure-space-ai", key: "space", status });
      } catch (error) {
        throw new BlueprintOperationError("configure-space-ai", "space", error);
      }
    }
  } catch (error) {
    operations.push({ operation: error instanceof BlueprintOperationError ? error.operation : "configure-space", key: error instanceof BlueprintOperationError ? error.key : "space", status: "failed", error: error instanceof Error ? error.message : "Unexpected error" });
    if (error instanceof BlueprintOperationError && error.operation === "configure-languages") groups[0] = (groups[0] ?? []).filter((item) => item.operation !== "ensure-language");
    return finish(0);
  }
  if (blueprint.aiTranslationDisclaimerId !== undefined) {
    onProgress?.({ stage: "ai-translation" });
    try {
      await enableAiTranslation(gateway, spaceId, blueprint.aiTranslationDisclaimerId, operations);
    } catch (error) {
      const last = operations.at(-1);
      if (last?.status === "failed") last.error = error instanceof Error ? error.message : "Unexpected error";
      else operations.push({ operation: "enable-ai-translations", key: AI_TRANSLATION_APP_ID, status: "failed", error: error instanceof Error ? error.message : "Unexpected error" });
      return finish(1);
    }
  }
  for (const [index, app] of blueprint.apps.entries()) {
    const key = "slug" in app ? app.slug : app.id;
    onProgress?.({ stage: "apps", current: index + 1, total: blueprint.apps.length, item: key });
    try {
      const result = "slug" in app ? await installAppBySlug(gateway, spaceId, app.slug) : await installAppById(gateway, spaceId, app.id);
      operations.push({ operation: "install-app", key, status: result.status });
    } catch (error) {
      operations.push({ operation: "install-app", key, status: "failed", error: error instanceof Error ? error.message : "Unexpected error" });
      onProgress?.({ stage: "apps", current: index + 1, total: blueprint.apps.length, item: key, failed: true });
      if (!blueprint.continueOnAppError) return finish(2);
    }
  }
  for (const [index, field] of blueprint.fields.entries()) {
    const key = `${field.component}.${field.field}`;
    onProgress?.({ stage: "components", current: index + 1, total: blueprint.fields.length, item: key });
    try {
      const result = await ensureComponentField(gateway, spaceId, field);
      operations.push({ operation: "ensure-component-field", key, status: result.status });
    } catch (error) {
      operations.push({ operation: "ensure-component-field", key, status: "failed", error: error instanceof Error ? error.message : "Unexpected error" });
      return finish(3);
    }
  }
  try {
    if (preparedAssets.length) onProgress?.({ stage: "assets", total: preparedAssets.length });
    await applyAssets(gateway, spaceId, preparedAssets, operations, (item, current, total) => onProgress?.({ stage: "assets", item, current, total }));
  } catch (error) {
    operations.push({ operation: "upload-asset", key: error instanceof BlueprintOperationError ? error.key : "assets", status: "failed", error: error instanceof Error ? error.message : "Unexpected error" });
    return finish(4);
  }
  try {
    if (blueprint.stories.length || blueprint.translations.length) onProgress?.({ stage: "stories" });
    await applyStories(gateway, spaceId, blueprint.stories, blueprint.translations, operations, blueprint.remoteAssets);
  } catch (error) {
    operations.push({ operation: error instanceof BlueprintOperationError ? error.operation : "configure-stories", key: error instanceof BlueprintOperationError ? error.key : "stories", status: "failed", error: error instanceof Error ? error.message : "Unexpected error" });
    return finish(5);
  }
  try {
    if (blueprint.workflow.assignUnstaged || blueprint.workflow.assignments.length) onProgress?.({ stage: "workflow" });
    if (await applyBlueprintWorkflow(gateway, spaceId, blueprint.workflow, operations, (item, current, failed) => onProgress?.({ stage: "workflow", item, current, failed }))) return finish(6);
  } catch (error) {
    operations.push({ operation: "configure-workflow", key: "workflow", status: "failed", error: error instanceof Error ? error.message : "Unexpected error" });
    return finish(6);
  }
  for (const [index, group] of blueprint.tags.entries()) {
    onProgress?.({ stage: "tags", current: index + 1, total: blueprint.tags.length });
    try {
      const report = await assignStoryTags(gateway, spaceId, group.slugs, group.tags);
      for (const item of report.operations) operations.push({ operation: "assign-tags", key: item.slug, status: item.status, ...(item.error ? { error: item.error } : {}) });
    } catch (error) {
      operations.push({ operation: "assign-tags", key: group.slugs.join(", "), status: "failed", error: error instanceof Error ? error.message : "Unexpected error" });
    }
  }
  return finish();
}
