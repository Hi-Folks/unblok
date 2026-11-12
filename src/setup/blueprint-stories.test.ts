import { describe, expect, test } from "bun:test";
import { applyStories } from "./blueprint-stories.ts";
import {
  applySupportedBlueprint,
  compileSupportedBlueprint,
} from "./blueprint-apply.ts";

describe("story setup", () => {
  test("creates a story in the selected release", async () => {
    let selected: number | undefined;
    const gateway = {
      findStoryBySlug: async () => undefined,
      createStory: async (
        _space: number,
        _story: unknown,
        releaseId?: number,
      ) => {
        selected = releaseId;
        return {};
      },
    };
    const operations: Array<{
      operation: string;
      key: string;
      status: string;
    }> = [];
    await applyStories(
      gateway as never,
      42,
      [
        {
          name: "Page",
          slug: "page",
          content: { component: "page" },
          releaseId: 9,
        },
      ],
      [],
      operations,
    );
    expect(selected).toBe(9);
    expect(operations).toMatchObject([{ status: "created" }]);
  });

  test("updates a block in the selected release", async () => {
    const scopes: Array<number | undefined> = [];
    const gateway = {
      findStoryBySlug: async () => ({ id: 7 }),
      getStory: async (_space: number, _id: number, releaseId?: number) => {
        scopes.push(releaseId);
        return {
          id: 7,
          full_slug: "home",
          is_folder: false,
          content: { component: "page", _uid: "p", title: "Old" },
        };
      },
      updateStoryContent: async (
        _space: number,
        _id: number,
        _content: unknown,
        releaseId?: number,
      ) => {
        scopes.push(releaseId);
      },
    };
    const blueprint = compileSupportedBlueprint({
      version: 1,
      stories: {
        update_blocks: [
          {
            story_slug: "home",
            component: "page",
            fields: { title: "New" },
            release_id: 9,
          },
        ],
      },
    });
    const report = await applySupportedBlueprint(
      gateway as never,
      42,
      blueprint,
    );
    expect(report.failed).toBe(false);
    expect(scopes).toEqual([9, 9, 9]);
  });

  test("resolves an existing release name for a block update", async () => {
    const scopes: Array<number | undefined> = [];
    const gateway = {
      listInstalledApps: async () => [
        { app_id: 1, name: "Releases", slug: "releases_only" },
      ],
      listReleases: async () => [{ id: 9, name: "Campaign" }],
      findStoryBySlug: async () => ({ id: 7 }),
      getStory: async (_space: number, _id: number, releaseId?: number) => {
        scopes.push(releaseId);
        return {
          id: 7,
          full_slug: "home",
          content: { component: "page", _uid: "p", title: "Old" },
        };
      },
      updateStoryContent: async (
        _space: number,
        _id: number,
        _content: unknown,
        releaseId?: number,
      ) => {
        scopes.push(releaseId);
      },
    };
    const blueprint = compileSupportedBlueprint({
      version: 1,
      stories: {
        update_blocks: [
          {
            story_slug: "home",
            component: "page",
            fields: { title: "New" },
            release: "Campaign",
          },
        ],
      },
    });
    const report = await applySupportedBlueprint(
      gateway as never,
      42,
      blueprint,
    );
    expect(report.operations).toMatchObject([
      { operation: "update-story-block", status: "updated" },
    ]);
    expect(scopes).toEqual([9, 9, 9]);
  });
  test("ensures a folder before creating the story and skips both on rerun", async () => {
    const folders = new Map<string, number>();
    let storyExists = false;
    let writes = 0;
    const gateway = {
      findStoryFolderBySlug: async (_space: number, path: string) =>
        folders.has(path) ? { id: folders.get(path)! } : undefined,
      findStoryBySlug: async (_space: number, slug: string) =>
        slug === "articles/news/welcome" && storyExists ? { id: 7 } : undefined,
      createStoryFolder: async (
        _space: number,
        input: { slug: string; parentId: number },
      ) => {
        const path = input.parentId ? `articles/${input.slug}` : input.slug;
        const id = folders.size + 1;
        folders.set(path, id);
        return { id };
      },
      createStory: async (_space: number, story: { parent_id?: number }) => {
        expect(story.parent_id).toBe(2);
        storyExists = true;
        writes++;
        return { id: 7 };
      },
    };
    const blueprint = compileSupportedBlueprint({
      version: 1,
      stories: {
        ensure_folders: ["articles/news"],
        create: [
          {
            name: "Welcome",
            slug: "articles/news/welcome",
            content: { component: "page" },
          },
        ],
      },
    });
    const first = await applySupportedBlueprint(
      gateway as never,
      42,
      blueprint,
    );
    expect(first.operations).toMatchObject([
      { operation: "ensure-story-folder", status: "created" },
      { operation: "create-story", status: "created" },
    ]);
    const second = await applySupportedBlueprint(
      gateway as never,
      42,
      blueprint,
    );
    expect(second.operations).toMatchObject([
      { operation: "ensure-story-folder", status: "unchanged" },
      { operation: "create-story", status: "unchanged" },
    ]);
    expect(writes).toBe(1);
  });

  test("organizes root stories and folders, preserving country folders on rerun", async () => {
    const entries = [
      {
        id: 1,
        slug: "home",
        full_slug: "home",
        parent_id: 0,
        is_folder: false,
      },
      {
        id: 2,
        slug: "articles",
        full_slug: "articles",
        parent_id: 0,
        is_folder: true,
      },
      {
        id: 3,
        slug: "global",
        full_slug: "global",
        parent_id: 0,
        is_folder: true,
      },
      { id: 4, slug: "uk", full_slug: "uk", parent_id: 0, is_folder: true },
      {
        id: 5,
        slug: "welcome",
        full_slug: "articles/welcome",
        parent_id: 2,
        is_folder: false,
      },
    ];
    const writes: Array<[number, boolean | undefined]> = [];
    const gateway = {
      findStoryFolderBySlug: async (_space: number, path: string) => {
        const entry = entries.find(
          (item) => item.is_folder && item.full_slug === path,
        );
        return entry && { id: entry.id };
      },
      findStoryBySlug: async (_space: number, path: string) =>
        entries.find((item) => !item.is_folder && item.full_slug === path),
      listStories: async () => entries,
      moveStory: async (
        _space: number,
        id: number,
        parent: number,
        isFolder?: boolean,
      ) => {
        const entry = entries.find((item) => item.id === id)!;
        writes.push([id, isFolder]);
        entry.parent_id = parent;
        entry.full_slug = `global/${entry.slug}`;
        return entry;
      },
    };
    const blueprint = compileSupportedBlueprint({
      version: 1,
      stories: {
        ensure_folders: ["global", "uk"],
        organize_root: { destination: "global", keep: ["uk"] },
      },
    });
    const first = await applySupportedBlueprint(
      gateway as never,
      42,
      blueprint,
    );
    expect(first.summary.failed).toBe(0);
    expect(writes).toEqual([
      [1, false],
      [2, true],
    ]);
    expect(first.operations).toMatchObject([
      { operation: "ensure-story-folder", status: "unchanged" },
      { operation: "ensure-story-folder", status: "unchanged" },
      { operation: "move-root-entry", key: "home", status: "completed" },
      { operation: "move-root-entry", key: "articles", status: "completed" },
      { operation: "organize-root", status: "completed" },
    ]);
    const second = await applySupportedBlueprint(
      gateway as never,
      42,
      blueprint,
    );
    expect(second.operations.at(-1)).toMatchObject({
      operation: "organize-root",
      status: "unchanged",
    });
    expect(writes).toEqual([
      [1, false],
      [2, true],
    ]);
  });

  test("configures Dimensions after creating folders", async () => {
    const folders = new Map<string, number>();
    const updates: unknown[] = [];
    const gateway = {
      findStoryFolderBySlug: async (_space: number, path: string) =>
        folders.has(path) ? { id: folders.get(path)! } : undefined,
      findStoryBySlug: async () => undefined,
      createStoryFolder: async (_space: number, input: { slug: string }) => {
        const id = folders.size + 1;
        folders.set(input.slug, id);
        return { id };
      },
      getSpace: async () => ({
        id: 42,
        dimensions_app_folder_ids: [],
        dimensions_app_folders: [],
      }),
      updateSpaceSettings: async (_space: number, settings: unknown) => {
        updates.push(settings);
      },
    };
    const blueprint = compileSupportedBlueprint({
      version: 1,
      apps: { dimensions: { folders: ["global", "italy"] } },
      stories: { ensure_folders: ["global", "italy"] },
    });
    const report = await applySupportedBlueprint(
      gateway as never,
      42,
      blueprint,
    );
    expect(report.summary.failed).toBe(0);
    expect(updates).toEqual([
      {
        dimensions_app_folder_ids: [1, 2],
        dimensions_app_folders: [
          { folder_id: 1, ai_translation_code: "" },
          { folder_id: 2, ai_translation_code: "" },
        ],
      },
    ]);
    expect(report.operations.at(-1)).toMatchObject({
      operation: "configure-dimensions",
      status: "updated",
    });
  });

  test("reports a failed folder before a not-run story", async () => {
    const gateway = {
      findStoryFolderBySlug: async () => undefined,
      findStoryBySlug: async () => ({ id: 3 }),
    };
    const blueprint = compileSupportedBlueprint({
      version: 1,
      stories: {
        ensure_folders: ["articles/news"],
        create: [
          {
            name: "Welcome",
            slug: "articles/news/welcome",
            content: { component: "page" },
          },
        ],
      },
    });
    const report = await applySupportedBlueprint(
      gateway as never,
      42,
      blueprint,
    );
    expect(report.operations).toMatchObject([
      {
        operation: "ensure-story-folder",
        key: "articles/news",
        status: "failed",
      },
      {
        operation: "create-story",
        key: "articles/news/welcome",
        status: "not_run",
      },
    ]);
  });
  test("creates a nested story using the parent folder ID", async () => {
    let parent: unknown;
    const gateway = {
      findStoryBySlug: async () => undefined,
      findStoryFolderBySlug: async (_space: number, slug: string) => {
        expect(slug).toBe("articles/news");
        return { id: 19 };
      },
      createStory: async (_space: number, story: unknown) => {
        parent = story;
        return {};
      },
    };
    const operations: Array<{
      operation: string;
      key: string;
      status: string;
    }> = [];
    await applyStories(
      gateway as never,
      42,
      [
        {
          name: "Welcome",
          slug: "articles/news/welcome",
          content: { component: "page" },
        },
      ],
      [],
      operations,
    );
    expect(parent).toMatchObject({ slug: "welcome", parent_id: 19 });
    expect(operations).toEqual([
      {
        operation: "create-story",
        key: "articles/news/welcome",
        status: "created",
      },
    ]);
  });
  test("creates nested content with resolved asset and skips an existing story", async () => {
    let created: any;
    let exists = false;
    const gateway = {
      findStoryBySlug: async () => (exists ? { id: 5 } : undefined),
      listAssetFolders: async () => [{ id: 2, name: "Provisioned" }],
      listAssets: async () => [
        {
          id: 7,
          filename: "https://a.storyblok.com/f/banner.png",
          asset_folder_id: 2,
        },
      ],
      createStory: async (_id: number, story: unknown) => {
        created = story;
        exists = true;
        return { id: 5 };
      },
    };
    const story = {
      name: "Auto",
      slug: "auto-created",
      content: {
        component: "page",
        body: [
          {
            component: "hero",
            image: {
              asset: {
                _find: {
                  search: "banner.png",
                  in_folder: "Provisioned",
                  require_unique: true,
                },
                alt: "Banner",
              },
            },
          },
        ],
      },
    };
    const operations: Array<{
      operation: string;
      key: string;
      status: string;
    }> = [];
    await applyStories(gateway as never, 42, [story], [], operations);
    expect(created.content._uid).toBeTruthy();
    expect(created.content.body[0]._uid).toBeTruthy();
    expect(created.content.body[0].image).toMatchObject({
      id: 7,
      alt: "Banner",
      fieldtype: "asset",
    });
    await applyStories(gateway as never, 42, [story], [], operations);
    expect(operations.map((item) => item.status)).toEqual([
      "created",
      "unchanged",
    ]);
  });

  test("updates translated slugs by ID without touching other translations", async () => {
    let updates: unknown;
    let current = {
      id: 1,
      full_slug: "about",
      is_folder: false,
      translated_slugs: [
        { id: 11, lang: "it", slug: "vecchio", name: "Old" },
        { id: 12, lang: "fr", slug: "ancien" },
      ],
    };
    const gateway = {
      listInstalledApps: async () => [{ slug: "translatable-slugs" }],
      listLanguages: async () => [{ code: "it" }],
      findStoryBySlug: async () => current,
      getStory: async () => current,
      updateTranslatedSlugs: async (
        _space: number,
        _id: number,
        values: unknown,
      ) => {
        updates = values;
        current = {
          ...current,
          translated_slugs: [
            { id: 11, lang: "it", slug: "chi-siamo", name: "Chi siamo" },
            current.translated_slugs[1]!,
          ],
        };
      },
    };
    const operations: Array<{
      operation: string;
      key: string;
      status: string;
    }> = [];
    const translations = [
      {
        slug: "about",
        translations: [{ lang: "it", slug: "chi-siamo", name: "Chi siamo" }],
      },
    ];
    await applyStories(gateway as never, 42, [], translations, operations);
    expect(updates).toEqual([{ id: 11, slug: "chi-siamo", name: "Chi siamo" }]);
    await applyStories(gateway as never, 42, [], translations, operations);
    expect(operations.map((item) => item.status)).toEqual([
      "updated",
      "unchanged",
    ]);
  });

  test("fails closed when translated slug data is missing", async () => {
    const gateway = {
      listInstalledApps: async () => [{ slug: "translatable-slugs" }],
      listLanguages: async () => [{ code: "it" }],
      findStoryBySlug: async () => ({ id: 1 }),
      getStory: async () => ({ id: 1, full_slug: "about", is_folder: false }),
    };
    await expect(
      applyStories(
        gateway as never,
        1,
        [],
        [{ slug: "about", translations: [{ lang: "it", slug: "chi" }] }],
        [],
      ),
    ).rejects.toThrow("did not include translated slugs");
  });

  test("checks all requested languages before updating any story", async () => {
    let writes = 0;
    const gateway = {
      listInstalledApps: async () => [{ slug: "translatable-slugs" }],
      listLanguages: async () => [{ code: "it" }],
      updateTranslatedSlugs: async () => {
        writes++;
      },
    };
    await expect(
      applyStories(
        gateway as never,
        1,
        [],
        [
          { slug: "one", translations: [{ lang: "it", slug: "uno" }] },
          { slug: "two", translations: [{ lang: "fr", slug: "deux" }] },
        ],
        [],
      ),
    ).rejects.toThrow("Language 'fr'");
    expect(writes).toBe(0);
  });
});
