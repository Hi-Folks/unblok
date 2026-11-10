import { expect, test } from "bun:test";
import {
  applySupportedBlueprint,
  compileSupportedBlueprint,
} from "./blueprint-apply.ts";
import { loadBlueprint } from "./blueprint-loader.ts";
import { resolveBlueprint } from "./blueprint-validation.ts";

test("campaign recipe composes a release, asset, story, review and tags, and can be repeated", async () => {
  const blueprint = compileSupportedBlueprint(
    resolveBlueprint(
      await loadBlueprint("examples/recipes/campaign-launch.yaml"),
      { asset_url: "https://example.com/banner.jpg" },
    ),
  );
  const data = new TextEncoder().encode("campaign image");
  const releases: Array<{
    id: number;
    name: string;
    release_at?: string | null;
  }> = [];
  const folders: Array<{ id: number; name: string; parent_id?: number }> = [];
  const assets: Array<{
    id: number;
    filename: string;
    short_filename: string;
    asset_folder_id: number;
  }> = [];
  const createdStories: Array<{
    id: number;
    full_slug: string;
    release_ids: number[];
    content: Record<string, unknown>;
  }> = [];
  let homeContent: Record<string, unknown> = {
    component: "page",
    body: [{ component: "hero-section", _uid: "hero", eyebrow: "Old" }],
  };
  let homeTags: string[] = [];
  let stageId: number | undefined;
  let createdInRelease: number | undefined;
  let updatedInRelease: number | undefined;
  const home = () => ({
    id: 10,
    name: "Home",
    full_slug: "home",
    tag_list: [...homeTags],
    is_folder: false,
    stage: stageId === undefined ? undefined : { workflow_stage_id: stageId },
    content: structuredClone(homeContent),
  });
  const gateway = {
    listInstalledApps: async () => [
      { app_id: 1, name: "Releases", slug: "releases_only" },
    ],
    listReleases: async () => releases,
    createRelease: async (_space: number, name: string, releaseAt: string) => {
      const release = { id: 99, name, release_at: releaseAt };
      releases.push(release);
      return release;
    },
    listAssetFolders: async () => [...folders],
    createAssetFolder: async (
      _space: number,
      name: string,
      parentId?: number,
    ) => {
      const folder = { id: 4, name, parent_id: parentId };
      folders.push(folder);
      return folder;
    },
    listAssets: async () => assets,
    uploadAsset: async (_space: number, folderId: number, name: string) => {
      assets.push({
        id: 50,
        filename: `https://assets.example/${name}`,
        short_filename: name,
        asset_folder_id: folderId,
      });
    },
    readAsset: async () => data,
    findStoryBySlug: async (_space: number, slug: string) =>
      slug === "home"
        ? home()
        : createdStories.find((story) => story.full_slug === slug),
    createStory: async (
      _space: number,
      story: { slug: string; content: Record<string, unknown> },
      releaseId?: number,
    ) => {
      createdInRelease = releaseId;
      createdStories.push({
        id: 11,
        full_slug: story.slug,
        release_ids: [releaseId!],
        content: story.content,
      });
    },
    listWorkflows: async () => [{ id: 5, name: "Default", is_default: true }],
    listWorkflowStages: async () => [
      { id: 8, name: "Reviewing", workflow_id: 5 },
    ],
    getWorkflowStage: async () => ({
      id: 8,
      name: "Reviewing",
      workflow_id: 5,
    }),
    listStories: async () => [home()],
    assignWorkflowStage: async (_space: number, input: { stageId: number }) => {
      stageId = input.stageId;
    },
    getStory: async (_space: number, id: number) =>
      id === 10 ? home() : createdStories.find((story) => story.id === id),
    updateStoryTags: async (_space: number, _id: number, tags: string[]) => {
      homeTags = tags;
    },
    updateStoryContent: async (
      _space: number,
      _id: number,
      content: Record<string, unknown>,
      releaseId?: number,
    ) => {
      homeContent = content;
      updatedInRelease = releaseId;
    },
  };
  const assetsToUpload = [{ name: "banner.jpg", folder: "Campaigns", data }];
  const first = await applySupportedBlueprint(
    gateway as never,
    42,
    blueprint,
    assetsToUpload,
  );
  expect(first.failed).toBe(false);
  expect(first.operations.map((item) => item.operation)).toEqual([
    "install-app",
    "create-release",
    "upload-asset",
    "create-story",
    "assign-workflow",
    "assign-tags",
    "update-story-block",
  ]);
  expect(createdInRelease).toBe(99);
  expect(updatedInRelease).toBe(99);
  expect(createdStories[0]?.content).toMatchObject({
    component: "default-page",
    body: [
      {
        component: "hero-section",
        image: { filename: "https://assets.example/banner.jpg" },
      },
    ],
  });
  expect(homeTags).toEqual(["Spring Campaign"]);
  expect(stageId).toBe(8);
  const second = await applySupportedBlueprint(
    gateway as never,
    42,
    blueprint,
    assetsToUpload,
  );
  expect(second.failed).toBe(false);
  expect(second.operations.every((item) => item.status === "unchanged")).toBe(
    true,
  );
  expect(releases).toHaveLength(1);
  expect(createdStories).toHaveLength(1);
});
