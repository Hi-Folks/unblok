import {
  type Component,
  type ComponentCreate,
  type ComponentUpdate,
  createManagementApiClient,
  createDefaultRateLimiter,
  type Space,
  type SpaceDetail,
  type Story,
  type Workflow,
  type WorkflowStage,
  type WorkflowStageCreate,
} from "@storyblok/management-api-client";
import { getRegion } from "@storyblok/region-helper";
import { CliError } from "../errors.ts";

export interface StoryblokGateway {
  listStoryVersions(
    spaceId: number,
    storyId: number,
    options?: { includeContent?: boolean; limit?: number },
  ): Promise<StoryblokStoryVersion[]>;
  listPipelineBranches(spaceId: number): Promise<StoryblokPipelineBranch[]>;
  getPipelineBranch(
    spaceId: number,
    branchId: number,
  ): Promise<StoryblokPipelineBranch>;
  createPipelineBranch(
    spaceId: number,
    branch: { name: string; source_id?: number },
  ): Promise<StoryblokPipelineBranch>;
  listReleases(spaceId: number): Promise<StoryblokRelease[]>;
  getRelease(spaceId: number, releaseId: number): Promise<StoryblokRelease>;
  publishRelease(
    spaceId: number,
    releaseId: number,
    name: string,
  ): Promise<StoryblokRelease>;
  createRelease(
    spaceId: number,
    name: string,
    releaseAt?: string,
  ): Promise<StoryblokRelease>;
  listAssetFolders(spaceId: number): Promise<StoryblokAssetFolder[]>;
  createAssetFolder(
    spaceId: number,
    name: string,
    parentId?: number,
  ): Promise<StoryblokAssetFolder>;
  listAssets(
    spaceId: number,
    folderId?: number,
    search?: string,
  ): Promise<StoryblokAsset[]>;
  uploadAsset(
    spaceId: number,
    folderId: number | undefined,
    filename: string,
    data: Uint8Array,
  ): Promise<void>;
  readAsset(asset: StoryblokAsset): Promise<Uint8Array>;
  deleteSpace(spaceId: number): Promise<void>;
  createWorkflowStage(
    spaceId: number,
    stage: WorkflowStageCreate,
  ): Promise<WorkflowStage>;
  findStoryBySlug(spaceId: number, slug: string): Promise<Story | undefined>;
  findStoryFolderBySlug(
    spaceId: number,
    slug: string,
  ): Promise<{ id: number } | undefined>;
  createStoryFolder(
    spaceId: number,
    input: { name: string; slug: string; parentId: number },
  ): Promise<{ id: number }>;
  getStory(
    spaceId: number,
    storyId: number,
    releaseId?: number,
  ): Promise<Story>;
  aiTranslateStory(
    spaceId: number,
    storyId: number,
    input: { lang: string; code: string; overwrite: boolean },
  ): Promise<Story | { backgroundTaskId: number }>;
  publishStory(spaceId: number, storyId: number): Promise<unknown>;
  activateExperiment(spaceId: number, experimentId: number): Promise<unknown>;
  updateStoryContent(
    spaceId: number,
    storyId: number,
    content: Record<string, unknown>,
    releaseId?: number,
  ): Promise<Story>;
  listExperiments(spaceId: number): Promise<unknown>;
  getExperiment(spaceId: number, experimentId: number): Promise<unknown>;
  createExperiment(
    spaceId: number,
    experiment: Record<string, unknown>,
  ): Promise<unknown>;
  linkExperimentStory(
    spaceId: number,
    experimentId: number,
    storyId: number,
  ): Promise<unknown>;
  createExperimentMapping(
    spaceId: number,
    experimentId: number,
    variantId: number,
    storyId: number,
  ): Promise<unknown>;
  getExperimentResults(spaceId: number, experimentId: number): Promise<unknown>;
  pushExperimentResults(
    spaceId: number,
    experimentId: number,
    charts: unknown[],
  ): Promise<unknown>;
  createStory(
    spaceId: number,
    story: {
      name: string;
      slug: string;
      content: Record<string, unknown>;
      parent_id?: number;
    },
    releaseId?: number,
  ): Promise<Story>;
  updateTranslatedSlugs(
    spaceId: number,
    storyId: number,
    translations: Array<{
      id?: number;
      lang?: string;
      slug: string;
      name?: string;
    }>,
  ): Promise<void>;
  updateStoryTags(
    spaceId: number,
    storyId: number,
    tags: string[],
  ): Promise<void>;
  listAvailableApps(spaceId: number): Promise<StoryblokApp[]>;
  listInstalledApps(spaceId: number): Promise<StoryblokAppProvision[]>;
  installApp(spaceId: number, appId: string): Promise<StoryblokAppProvision>;
  acceptSpaceDisclaimer(spaceId: number, disclaimerId: number): Promise<void>;
  assignWorkflowStage(
    spaceId: number,
    input: WorkflowStageAssignmentInput,
  ): Promise<WorkflowStageChange>;
  updateWorkflow(
    spaceId: number,
    workflowId: number,
    fields: {
      name?: string;
      content_types?: string[];
      per_language_stages?: boolean;
    },
  ): Promise<void>;
  createComponent(
    spaceId: number,
    component: ComponentCreate,
  ): Promise<Component>;
  duplicateSpace(options: DuplicateSpaceOptions): Promise<SpaceDetail>;
  getComponent(spaceId: number, componentId: number): Promise<Component>;
  getCurrentUserId(): Promise<number>;
  getWorkflowStage(spaceId: number, stageId: number): Promise<WorkflowStage>;
  listLanguages(spaceId: number): Promise<StoryblokLanguage[]>;
  listComponents(
    spaceId: number,
    options?: ListComponentsOptions,
  ): Promise<Component[]>;
  getSpace(spaceId: number): Promise<SpaceDetail>;
  listSpaces(options?: ListSpacesOptions): Promise<Space[]>;
  listStories(spaceId: number, options?: ListStoriesOptions): Promise<Story[]>;
  listWorkflows(spaceId: number): Promise<Workflow[]>;
  listWorkflowStages(
    spaceId: number,
    options?: ListWorkflowStagesOptions,
  ): Promise<WorkflowStage[]>;
  updateSpaceSettings(
    spaceId: number,
    settings: {
      domain?: string;
      environments?: Array<{ name: string; location: string }>;
      is_demo?: boolean;
      ai_text_generator_disabled?: boolean;
      inherit_org_ai_configuration?: boolean;
    },
  ): Promise<void>;
  updateLanguages(
    spaceId: number,
    languages: StoryblokLanguage[],
  ): Promise<StoryblokLanguage[]>;
  updateComponent(
    spaceId: number,
    componentId: number,
    component: ComponentUpdate,
  ): Promise<Component>;
}

export interface StoryblokPipelineBranch {
  id: number;
  name: string;
  source_id?: number | null;
}

export interface StoryblokRelease {
  id: number;
  name: string;
  released?: boolean;
  release_at?: string | null;
}

export interface StoryblokApp {
  id: number | string;
  name: string;
  slug: string;
}
export interface StoryblokAssetFolder {
  id: number;
  name: string;
  parent_id?: number | null;
}
export interface StoryblokAsset {
  id: number;
  filename: string;
  short_filename: string;
  asset_folder_id?: number | null;
}
export interface StoryblokAppProvision {
  app_id: number | string;
  name: string;
  slug: string;
}

export interface WorkflowStageAssignmentInput {
  comment?: string;
  dueDate?: string;
  notify?: boolean;
  language?: string;
  releaseId?: number;
  roleIds?: number[];
  stageId: number;
  storyId: number;
  userIds?: number[];
}

export interface WorkflowStageChange {
  created_at?: string;
  due_date?: string | null;
  id: number;
  user_id?: number;
  workflow_id?: number;
  workflow_stage_id: number;
}

export interface StoryblokLanguage {
  aiTranslationCode?: string | null;
  code: string;
  name: string;
}

export interface DuplicateSpaceOptions {
  assignPartner?: boolean;
  demo?: boolean;
  inOrg?: boolean;
  name: string;
  sourceSpaceId: number;
  spaceType?: string;
}

export interface ListSpacesOptions {
  search?: string;
}

export interface ListComponentsOptions {
  search?: string;
}

export interface ListStoriesOptions {
  component?: string;
  ids?: number[];
  search?: string;
  startsWith?: string;
  textSearch?: string;
  tag?: string;
  published?: boolean;
  storyOnly?: boolean;
}

export interface StoryblokStoryVersion {
  id: number;
  storyId: number;
  createdAt?: string;
  status?: string;
  releaseId?: number;
  author?: { id?: number; name?: string };
  content?: unknown;
}

export interface ListWorkflowStagesOptions {
  search?: string;
  workflowId?: number;
}

export type StoryblokGatewayFactory = (token: string) => StoryblokGateway;
export type StoryblokRegion = "eu" | "us" | "ca" | "ap" | "cn";

export const createStoryblokGateway = (
  token: string,
  options: { requestsPerSecond?: number; region?: StoryblokRegion } = {},
): StoryblokGateway => {
  const limiter = createDefaultRateLimiter();
  const rateLimit = {
    requestsPerSecond: options.requestsPerSecond ?? 6,
    limiter,
  };
  const retry = {
    limit: 8,
    methods: ["get", "post", "put", "patch", "delete"] as (
      "get" | "post" | "put" | "patch" | "delete"
    )[],
    statusCodes: [429],
    backoffLimit: 20_000,
    retryOnTimeout: false,
    shouldRetry: ({ error }: { error: Error }) => {
      const response = "response" in error ? error.response : undefined;
      return response instanceof Response && response.status === 429
        ? undefined
        : false;
    },
  };
  const client = createManagementApiClient({
    personalAccessToken: token,
    throwOnError: true,
    rateLimit,
    retry,
  });
  const spaceClients = new Map<
    number,
    ReturnType<typeof createManagementApiClient<true>>
  >();
  const clientForSpace = (spaceId: number) => {
    const existing = spaceClients.get(spaceId);
    if (existing) return existing;
    const regionalClient = createManagementApiClient({
      personalAccessToken: token,
      region: options.region ?? getRegion(spaceId) ?? "eu",
      spaceId,
      throwOnError: true,
      rateLimit,
      retry,
    });
    spaceClients.set(spaceId, regionalClient);
    return regionalClient;
  };

  return {
    async getPipelineBranch(spaceId, branchId) {
      const response = await clientForSpace(spaceId).get<{
        branch: StoryblokPipelineBranch;
      }>(`/v1/spaces/${spaceId}/branches/${branchId}`);
      const branch = response.data.branch;
      if (
        !branch ||
        branch.id !== branchId ||
        typeof branch.name !== "string" ||
        !branch.name.trim()
      )
        throw new CliError(
          "Invalid pipeline branch returned by Storyblok.",
          1,
          "CONFLICT",
        );
      return {
        id: branch.id,
        name: branch.name,
        ...(branch.source_id === undefined
          ? {}
          : { source_id: branch.source_id }),
      };
    },
    async listPipelineBranches(spaceId) {
      const all: StoryblokPipelineBranch[] = [];
      const seen = new Set<number>();
      for (let page = 1; ; page++) {
        const response = await clientForSpace(spaceId).get<{
          branches: StoryblokPipelineBranch[];
        }>(`/v1/spaces/${spaceId}/branches/`, {
          query: { page, per_page: 100 },
        });
        if (!Array.isArray(response.data.branches))
          throw new Error("Invalid pipeline branch list.");
        for (const branch of response.data.branches) {
          if (
            !branch ||
            !Number.isSafeInteger(branch.id) ||
            branch.id <= 0 ||
            typeof branch.name !== "string" ||
            seen.has(branch.id)
          )
            throw new Error("Invalid or repeated pipeline branch in list.");
          seen.add(branch.id);
          all.push({
            id: branch.id,
            name: branch.name,
            ...(branch.source_id === undefined
              ? {}
              : { source_id: branch.source_id }),
          });
        }
        if (response.data.branches.length < 100) return all;
      }
    },
    async createPipelineBranch(spaceId, branch) {
      const response = await clientForSpace(spaceId).post<{
        branch: StoryblokPipelineBranch;
      }>(`/v1/spaces/${spaceId}/branches/`, {
        headers: { "Content-Type": "application/json" },
        body: { branch },
      });
      const item = response.data.branch;
      if (
        !item ||
        !Number.isSafeInteger(item.id) ||
        item.id <= 0 ||
        typeof item.name !== "string"
      )
        throw new Error("Invalid pipeline branch returned by Storyblok.");
      return {
        id: item.id,
        name: item.name,
        ...(item.source_id === undefined ? {} : { source_id: item.source_id }),
      };
    },
    async getRelease(spaceId, releaseId) {
      const response = await clientForSpace(spaceId).get<{
        release: StoryblokRelease;
      }>(`/v1/spaces/${spaceId}/releases/${releaseId}`);
      const release = response.data.release;
      if (
        !release ||
        release.id !== releaseId ||
        typeof release.name !== "string" ||
        !release.name.trim()
      )
        throw new CliError(
          "Invalid release returned by Storyblok.",
          1,
          "CONFLICT",
        );
      return release;
    },
    async publishRelease(spaceId, releaseId, name) {
      const response = await clientForSpace(spaceId).put<{
        release: StoryblokRelease;
      }>(`/v1/spaces/${spaceId}/releases/${releaseId}`, {
        headers: { "Content-Type": "application/json" },
        body: { do_release: true, release: { name } },
      });
      return response.data.release;
    },
    async listReleases(spaceId) {
      const all: StoryblokRelease[] = [];
      const seenIds = new Set<number>();
      for (let page = 1; ; page++) {
        const response = await clientForSpace(spaceId).get<{
          releases: StoryblokRelease[];
        }>(`/v1/spaces/${spaceId}/releases/`, {
          query: { page, per_page: 100 },
        });
        if (!Array.isArray(response.data.releases))
          throw new Error("Invalid release list.");
        for (const release of response.data.releases) {
          if (
            !release ||
            !Number.isSafeInteger(release.id) ||
            release.id <= 0 ||
            typeof release.name !== "string" ||
            seenIds.has(release.id)
          )
            throw new Error(
              "Invalid or repeated release in list; cannot verify existing releases.",
            );
          seenIds.add(release.id);
          all.push(release);
        }
        if (response.data.releases.length < 100) return all;
      }
    },
    async createRelease(spaceId, name, releaseAt) {
      const response = await clientForSpace(spaceId).post<{
        release: StoryblokRelease;
      }>(`/v1/spaces/${spaceId}/releases/`, {
        headers: { "Content-Type": "application/json" },
        body: {
          release: {
            name,
            ...(releaseAt === undefined ? {} : { release_at: releaseAt }),
          },
        },
      });
      if (
        !response.data.release ||
        !Number.isSafeInteger(response.data.release.id) ||
        response.data.release.id <= 0 ||
        typeof response.data.release.name !== "string"
      )
        throw new Error("Invalid release returned by Storyblok.");
      return response.data.release;
    },
    async listAssetFolders(spaceId) {
      const all: StoryblokAssetFolder[] = [];
      for (let page = 1; ; page++) {
        const response = await clientForSpace(spaceId).get<{
          asset_folders: StoryblokAssetFolder[];
        }>(`/v1/spaces/${spaceId}/asset_folders/`, {
          query: { page, per_page: 100 },
        });
        if (!Array.isArray(response.data.asset_folders))
          throw new Error("Invalid asset folder list.");
        all.push(...response.data.asset_folders);
        if (response.data.asset_folders.length < 100) return all;
      }
    },
    async createAssetFolder(spaceId, name, parentId) {
      const response = await clientForSpace(spaceId).post<{
        asset_folder: StoryblokAssetFolder;
      }>(`/v1/spaces/${spaceId}/asset_folders/`, {
        headers: { "Content-Type": "application/json" },
        body: {
          asset_folder: {
            name,
            ...(parentId === undefined ? {} : { parent_id: parentId }),
          },
        },
      });
      return response.data.asset_folder;
    },
    async listAssets(spaceId, folderId, search) {
      const all: StoryblokAsset[] = [];
      for (let page = 1; ; page++) {
        const response = await clientForSpace(spaceId).get<{
          assets: StoryblokAsset[];
        }>(`/v1/spaces/${spaceId}/assets/`, {
          query: {
            page,
            per_page: 100,
            ...(folderId === undefined ? {} : { in_folder: folderId }),
            ...(search === undefined ? {} : { search }),
          },
        });
        if (!Array.isArray(response.data.assets))
          throw new Error("Invalid asset list.");
        all.push(...response.data.assets);
        if (response.data.assets.length < 100) return all;
      }
    },
    async uploadAsset(spaceId, folderId, filename, data) {
      try {
        await clientForSpace(spaceId).assets.upload({
          body: {
            short_filename: filename,
            ...(folderId === undefined ? {} : { asset_folder_id: folderId }),
            validate_upload: true,
          },
          file: new Blob([new Uint8Array(data)]),
        });
      } catch {
        throw new Error(`Could not upload asset '${filename}'.`);
      }
    },
    async readAsset(asset) {
      const url = new URL(asset.filename);
      if (
        url.protocol !== "https:" ||
        !(
          url.hostname === "a.storyblok.com" ||
          url.hostname.endsWith(".storyblok.com") ||
          url.hostname === "s3.amazonaws.com"
        )
      )
        throw new Error("Asset URL is not a trusted Storyblok asset URL.");
      const response = await fetch(url, { redirect: "error" });
      if (!response.ok)
        throw new Error(
          `Could not read existing asset (HTTP ${response.status}).`,
        );
      return new Uint8Array(await response.arrayBuffer());
    },
    async deleteSpace(spaceId) {
      await clientForSpace(spaceId).spaces.delete();
    },
    async createWorkflowStage(spaceId, stage) {
      const response = await clientForSpace(spaceId).workflowStages.create({
        body: { workflow_stage: stage },
      });
      return response.data.workflow_stage;
    },
    async findStoryBySlug(spaceId, slug) {
      const response = await clientForSpace(spaceId).stories.list({
        query: { with_slug: slug, story_only: true },
      });
      const matches = (response.data.stories ?? []).filter(
        (story) => story.full_slug === slug && !story.is_folder,
      );
      if (matches.length > 1)
        throw new Error(`Multiple stories match full slug '${slug}'.`);
      return matches[0];
    },
    async findStoryFolderBySlug(spaceId, slug) {
      const matches: Story[] = [];
      for (let page = 1; ; page++) {
        const response = await clientForSpace(spaceId).stories.list({
          query: { with_slug: slug, folder_only: true, page, per_page: 100 },
        });
        if (!Array.isArray(response.data.stories))
          throw new Error("Invalid story folder list.");
        matches.push(
          ...response.data.stories.filter(
            (story) =>
              story.is_folder === true &&
              story.full_slug?.replace(/\/+$/, "") === slug,
          ),
        );
        if (matches.length > 1)
          throw new CliError(
            `Multiple folders match '${slug}'.`,
            1,
            "AMBIGUOUS",
          );
        if (response.data.stories.length < 100) break;
      }
      const folder = matches[0];
      if (folder && (!Number.isSafeInteger(folder.id) || folder.id <= 0))
        throw new CliError(
          `Folder '${slug}' has an invalid ID.`,
          1,
          "CONFLICT",
        );
      return folder ? { id: folder.id } : undefined;
    },
    async createStoryFolder(spaceId, input) {
      const response = await clientForSpace(spaceId).post<{
        story: { id: number };
      }>(`/v1/spaces/${spaceId}/stories/`, {
        headers: { "Content-Type": "application/json" },
        body: {
          story: {
            name: input.name,
            slug: input.slug,
            is_folder: true,
            parent_id: input.parentId,
          },
        },
      });
      const id = response.data.story?.id;
      if (!Number.isSafeInteger(id) || id <= 0)
        throw new CliError(
          "Storyblok did not return a valid folder ID.",
          1,
          "CONFLICT",
        );
      return { id };
    },
    async getStory(spaceId, storyId, releaseId) {
      const response = await clientForSpace(spaceId).stories.get(
        storyId,
        releaseId === undefined
          ? undefined
          : { query: { release_id: releaseId } },
      );
      if (!response.data.story)
        throw new Error(`Story ${storyId} was not returned by Storyblok.`);
      return response.data.story;
    },
    async aiTranslateStory(spaceId, storyId, input) {
      const response = await clientForSpace(spaceId).put<{
        story?: Story;
        background_task_id?: number;
      }>(`/v1/spaces/${spaceId}/stories/${storyId}/ai_translate`, {
        headers: { "Content-Type": "application/json" },
        body: input,
      });
      if (response.data?.background_task_id !== undefined) {
        const id = response.data.background_task_id;
        if (!Number.isSafeInteger(id) || id <= 0)
          throw new CliError(
            "Storyblok returned an invalid background task ID.",
            1,
            "CONFLICT",
          );
        return { backgroundTaskId: id };
      }
      if (!response.data?.story)
        throw new CliError(
          "Storyblok did not return a story or a background task ID.",
          1,
          "CONFLICT",
        );
      return response.data.story;
    },
    async publishStory(spaceId, storyId) {
      return (
        await clientForSpace(spaceId).get(
          `/v1/spaces/${spaceId}/stories/${storyId}/publish`,
        )
      ).data;
    },
    async activateExperiment(spaceId, experimentId) {
      return (
        await clientForSpace(spaceId).put(
          `/v1/spaces/${spaceId}/experiments/${experimentId}/activate`,
        )
      ).data;
    },
    async updateStoryContent(spaceId, storyId, content, releaseId) {
      const response = await clientForSpace(spaceId).put<{ story: Story }>(
        `/v1/spaces/${spaceId}/stories/${storyId}`,
        {
          headers: { "Content-Type": "application/json" },
          ...(releaseId === undefined
            ? {}
            : { query: { release_id: releaseId } }),
          body: { story: { content }, publish: false },
        },
      );
      return response.data.story;
    },
    async listExperiments(spaceId) {
      const experiments: unknown[] = [];
      for (let page = 1; ; page++) {
        const response = await clientForSpace(spaceId).get<{
          experiments: unknown[];
        }>(`/v1/spaces/${spaceId}/experiments`, {
          query: { page, per_page: 100 },
        });
        if (!Array.isArray(response.data.experiments))
          throw new Error("Storyblok returned an invalid experiment list.");
        experiments.push(...response.data.experiments);
        if (response.data.experiments.length < 100) return { experiments };
      }
    },
    async getExperiment(spaceId, experimentId) {
      return (
        await clientForSpace(spaceId).get(
          `/v1/spaces/${spaceId}/experiments/${experimentId}`,
        )
      ).data;
    },
    async createExperiment(spaceId, experiment) {
      return (
        await clientForSpace(spaceId).post(
          `/v1/spaces/${spaceId}/experiments`,
          {
            headers: { "Content-Type": "application/json" },
            body: { experiment },
          },
        )
      ).data;
    },
    async linkExperimentStory(spaceId, experimentId, storyId) {
      return (
        await clientForSpace(spaceId).post(
          `/v1/spaces/${spaceId}/experiments/${experimentId}/stories`,
          {
            headers: { "Content-Type": "application/json" },
            body: { experiment_story: { story_id: storyId } },
          },
        )
      ).data;
    },
    async createExperimentMapping(spaceId, experimentId, variantId, storyId) {
      return (
        await clientForSpace(spaceId).post(
          `/v1/spaces/${spaceId}/experiments/${experimentId}/variants/${variantId}/story_mappings`,
          {
            headers: { "Content-Type": "application/json" },
            body: { story_mapping: { original_story_id: storyId } },
          },
        )
      ).data;
    },
    async getExperimentResults(spaceId, experimentId) {
      return (
        await clientForSpace(spaceId).get(
          `/v1/spaces/${spaceId}/experiments/${experimentId}/results`,
        )
      ).data;
    },
    async pushExperimentResults(spaceId, experimentId, charts) {
      return (
        await clientForSpace(spaceId).post(
          `/v1/spaces/${spaceId}/experiments/${experimentId}/results`,
          { headers: { "Content-Type": "application/json" }, body: { charts } },
        )
      ).data;
    },
    async createStory(spaceId, story, releaseId) {
      const response = await clientForSpace(spaceId).post<{ story: Story }>(
        `/v1/spaces/${spaceId}/stories/`,
        {
          headers: { "Content-Type": "application/json" },
          body: { story },
          ...(releaseId === undefined
            ? {}
            : { query: { release_id: releaseId } }),
        },
      );
      return response.data.story;
    },
    async updateTranslatedSlugs(spaceId, storyId, translations) {
      await clientForSpace(spaceId).put(
        `/v1/spaces/${spaceId}/stories/${storyId}`,
        {
          headers: { "Content-Type": "application/json" },
          body: { story: { translated_slugs_attributes: translations } },
        },
      );
    },
    async updateStoryTags(spaceId, storyId, tags) {
      await clientForSpace(spaceId).stories.update(storyId, {
        body: { story: { tag_list: tags } },
      });
    },
    async listAvailableApps(spaceId) {
      const apps: StoryblokApp[] = [];
      for (let page = 1; ; page++) {
        const response = await clientForSpace(spaceId).get<{
          apps: StoryblokApp[];
        }>("/v1/apps", { query: { space_id: spaceId, page, per_page: 100 } });
        if (!Array.isArray(response.data.apps))
          throw new Error("Storyblok returned an invalid app list.");
        apps.push(...response.data.apps);
        if (response.data.apps.length < 100) return apps;
      }
    },
    async listInstalledApps(spaceId) {
      const response = await clientForSpace(spaceId).get<{
        app_provisions: StoryblokAppProvision[];
      }>(`/v1/spaces/${spaceId}/app_provisions`);
      if (!Array.isArray(response.data.app_provisions))
        throw new Error("Storyblok returned an invalid installed app list.");
      return response.data.app_provisions;
    },
    async installApp(spaceId, appId) {
      const response = await clientForSpace(spaceId).post<{
        app_provision: StoryblokAppProvision;
      }>(`/v1/spaces/${spaceId}/app_provisions/`, {
        headers: { "Content-Type": "application/json" },
        body: {
          app_provision: {
            app_id:
              /^\d+$/.test(appId) && Number.isSafeInteger(Number(appId))
                ? Number(appId)
                : appId,
          },
        },
      });
      return response.data.app_provision;
    },
    async acceptSpaceDisclaimer(spaceId, disclaimerId) {
      await clientForSpace(spaceId).put(`/v1/spaces/${spaceId}`, {
        headers: { "Content-Type": "application/json" },
        body: { space: { disclaimer_id: disclaimerId } },
      });
    },
    async updateSpaceSettings(spaceId, settings) {
      await clientForSpace(spaceId).spaces.update({
        body: { space: settings },
      });
    },
    async assignWorkflowStage(spaceId, input) {
      const response = await clientForSpace(spaceId).post<{
        workflow_stage_change: WorkflowStageChange;
      }>(`/v1/spaces/${spaceId}/workflow_stage_changes`, {
        headers: { "Content-Type": "application/json" },
        body: {
          ...(input.comment ? { comment: { message: input.comment } } : {}),
          ...(input.notify ? { notify: true } : {}),
          ...(input.releaseId ? { release_id: input.releaseId } : {}),
          ...(input.roleIds?.length || input.userIds?.length
            ? {
                assign: {
                  space_role_ids: input.roleIds ?? [],
                  user_ids: input.userIds ?? [],
                },
              }
            : {}),
          workflow_stage_change: {
            ...(input.dueDate ? { due_date: input.dueDate } : {}),
            ...(input.language ? { language: input.language } : {}),
            story_id: input.storyId,
            workflow_stage_id: input.stageId,
          },
        },
      });
      return response.data.workflow_stage_change;
    },
    async updateWorkflow(spaceId, workflowId, fields) {
      await clientForSpace(spaceId).put(
        `/v1/spaces/${spaceId}/workflows/${workflowId}`,
        {
          headers: { "Content-Type": "application/json" },
          body: { workflow: fields },
        },
      );
    },
    async createComponent(spaceId, component) {
      const response = await clientForSpace(spaceId).components.create({
        body: { component },
      });
      return response.data.component;
    },
    async duplicateSpace(options) {
      const regionalClient = clientForSpace(options.sourceSpaceId);
      const response = await regionalClient.post<{ space: SpaceDetail }>(
        "/v1/spaces",
        {
          headers: { "Content-Type": "application/json" },
          body: {
            dup_id: options.sourceSpaceId,
            ...(options.inOrg ? { in_org: true } : {}),
            ...(options.assignPartner ? { assign_partner: true } : {}),
            ...(options.spaceType ? { space_type: options.spaceType } : {}),
            space: {
              is_demo: options.demo,
              name: options.name,
            },
          },
        },
      );
      return response.data.space;
    },
    async getCurrentUserId() {
      const response = await client.users.me();
      return response.data.user.id;
    },
    async getComponent(spaceId, componentId) {
      const response =
        await clientForSpace(spaceId).components.get(componentId);
      return response.data.component;
    },
    async getWorkflowStage(spaceId, stageId) {
      const response =
        await clientForSpace(spaceId).workflowStages.get(stageId);
      return response.data.workflow_stage;
    },
    async listLanguages(spaceId) {
      const response = await clientForSpace(spaceId).spaces.get();
      return response.data.space.languages.map((language) => {
        if (!language.code || !language.name)
          throw new CliError(
            "Storyblok returned a space language without a code or name.",
            1,
            "CONFLICT",
          );
        return {
          aiTranslationCode: language.ai_translation_code,
          code: language.code,
          name: language.name,
        };
      });
    },
    async listComponents(spaceId, options = {}) {
      const response = await clientForSpace(spaceId).components.list({
        query: options.search ? { search: options.search } : undefined,
      });
      return response.data.components;
    },
    async getSpace(spaceId) {
      const response = await clientForSpace(spaceId).spaces.get();
      return response.data.space;
    },
    async listSpaces(options = {}) {
      const response = await client.spaces.list({
        query: options.search ? { search: options.search } : undefined,
      });
      return response.data.spaces;
    },
    async listStoryVersions(spaceId, storyId, options = {}) {
      const versions: StoryblokStoryVersion[] = [];
      if (
        options.limit !== undefined &&
        (!Number.isSafeInteger(options.limit) || options.limit <= 0)
      )
        throw new CliError(
          "Version limit must be a positive integer.",
          1,
          "INVALID_INPUT",
        );
      const seen = new Set<number>();
      const perPage = Math.min(options.limit ?? 100, 100);
      for (let page = 1; ; page++) {
        const response = await clientForSpace(spaceId).get<{
          story_versions?: Array<{
            id?: number;
            story_id?: number;
            created_at?: string;
            status?: string;
            release_id?: number | null;
            user_id?: number | null;
            user?: { id?: number; friendly_name?: string | null } | null;
            content?: unknown;
          }>;
        }>(`/v1/spaces/${spaceId}/story_versions`, {
          query: {
            by_story_id: storyId,
            page,
            per_page: perPage,
            ...(options.includeContent ? { show_content: true } : {}),
          },
        });
        const batch = response.data.story_versions;
        if (!Array.isArray(batch))
          throw new CliError("Storyblok did not return a story versions list.");
        for (const item of batch) {
          if (
            !item ||
            !Number.isSafeInteger(item.id) ||
            !item.id ||
            item.id <= 0 ||
            item.story_id !== storyId
          )
            throw new CliError(
              "Storyblok returned a version with an invalid ID or story identity.",
              1,
              "CONFLICT",
            );
          if (seen.has(item.id))
            throw new CliError(
              "Storyblok returned a duplicate story version while paging; retry the request.",
              1,
              "CONFLICT",
            );
          seen.add(item.id);
          versions.push({
            id: item.id,
            storyId,
            ...(typeof item.created_at === "string"
              ? { createdAt: item.created_at }
              : {}),
            ...(typeof item.status === "string" ? { status: item.status } : {}),
            ...(typeof item.release_id === "number"
              ? { releaseId: item.release_id }
              : {}),
            ...(typeof item.user?.id === "number" ||
            typeof item.user_id === "number" ||
            typeof item.user?.friendly_name === "string"
              ? {
                  author: {
                    ...(typeof item.user?.id === "number"
                      ? { id: item.user.id }
                      : typeof item.user_id === "number"
                        ? { id: item.user_id }
                        : {}),
                    ...(typeof item.user?.friendly_name === "string"
                      ? { name: item.user.friendly_name }
                      : {}),
                  },
                }
              : {}),
            ...(options.includeContent && Object.hasOwn(item, "content")
              ? { content: item.content }
              : {}),
          });
        }
        if (options.limit !== undefined && versions.length >= options.limit)
          break;
        const totalHeader = response.response.headers.get("total");
        const pageSizeHeader =
          response.response.headers.get("per-page") ??
          response.response.headers.get("per_page");
        const total =
          totalHeader !== null && /^\d+$/.test(totalHeader)
            ? Number(totalHeader)
            : undefined;
        const actualPageSize =
          pageSizeHeader !== null && /^\d+$/.test(pageSizeHeader)
            ? Number(pageSizeHeader)
            : perPage;
        if (total !== undefined && Number.isSafeInteger(total)) {
          if (versions.length >= total) break;
          if (batch.length === 0)
            throw new CliError(
              "Storyblok returned an incomplete story version history while paging; retry the request.",
              1,
              "CONFLICT",
            );
        } else if (
          batch.length < (actualPageSize > 0 ? actualPageSize : perPage)
        )
          break;
      }
      return options.limit === undefined
        ? versions
        : versions.slice(0, options.limit);
    },
    async listStories(spaceId, options = {}) {
      const stories: Story[] = [];
      const perPage = 1000;
      for (let page = 1; ; page += 1) {
        const response = await clientForSpace(spaceId).get<{
          stories?: Story[];
        }>(`/v1/spaces/${spaceId}/stories`, {
          query: {
            ...(options.ids?.length ? { by_ids: options.ids.join(",") } : {}),
            ...(options.component
              ? { contain_component: options.component }
              : {}),
            ...(options.search ? { search: options.search } : {}),
            ...(options.startsWith ? { starts_with: options.startsWith } : {}),
            ...(options.textSearch ? { text_search: options.textSearch } : {}),
            ...(options.tag ? { with_tag: options.tag } : {}),
            ...(options.published === undefined
              ? {}
              : { is_published: options.published }),
            ...(options.storyOnly === undefined
              ? {}
              : { story_only: options.storyOnly }),
            show_stage: true,
            page,
            per_page: perPage,
          },
        });
        const batch = response.data.stories;
        if (!Array.isArray(batch))
          throw new CliError("Storyblok did not return a stories list.");
        stories.push(...batch);
        if (batch.length < perPage) break;
      }
      return stories;
    },
    async listWorkflows(spaceId) {
      const response = await clientForSpace(spaceId).workflows.list();
      return response.data.workflows;
    },
    async listWorkflowStages(spaceId, options = {}) {
      const response = await clientForSpace(spaceId).workflowStages.list({
        query: {
          ...(options.search ? { search: options.search } : {}),
          ...(options.workflowId ? { in_workflow: options.workflowId } : {}),
        },
      });
      return response.data.workflow_stages;
    },
    async updateLanguages(spaceId, languages) {
      const response = await clientForSpace(spaceId).spaces.update({
        body: {
          space: {
            languages: languages.map((language) => ({
              ai_translation_code: language.aiTranslationCode,
              code: language.code,
              name: language.name,
            })),
          },
        },
      });
      return response.data.space.languages.flatMap((language) =>
        language.code && language.name
          ? [
              {
                aiTranslationCode: language.ai_translation_code,
                code: language.code,
                name: language.name,
              },
            ]
          : [],
      );
    },
    async updateComponent(spaceId, componentId, component) {
      const response = await clientForSpace(spaceId).components.update(
        componentId,
        {
          body: { component },
        },
      );
      return response.data.component;
    },
  };
};
