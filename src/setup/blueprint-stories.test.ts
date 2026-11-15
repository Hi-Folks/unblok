import { describe, expect, test } from "bun:test";
import { applyStories } from "./blueprint-stories.ts";
import {
  applySupportedBlueprint,
  compileSupportedBlueprint,
} from "./blueprint-apply.ts";

describe("story setup", () => {
  test("copies a positional story field through YAML and skips the repeat", async () => {
    const source = {
      id: 1,
      full_slug: "global/home",
      content: {
        component: "page",
        _uid: "p1",
        body: [{ component: "hero", _uid: "h1", title: "Hello" }],
      },
    };
    const target = {
      id: 2,
      full_slug: "italy/home",
      content: {
        component: "page",
        _uid: "p2",
        body: [{ component: "hero", _uid: "h2", title: "Ciao" }],
      },
    };
    let writes = 0;
    const gateway = {
      findStoryBySlug: async (_space: number, slug: string) => ({
        id: slug === source.full_slug ? 1 : 2,
      }),
      getStory: async (_space: number, id: number) =>
        structuredClone(id === 1 ? source : target),
      updateStoryContent: async (
        _space: number,
        _id: number,
        content: unknown,
      ) => {
        writes++;
        target.content = structuredClone(content) as typeof target.content;
        return structuredClone(target);
      },
    };
    const blueprint = compileSupportedBlueprint({
      version: 1,
      stories: {
        sync_paths: [
          {
            source: "global/home",
            target: "italy/home",
            path: "/body/0/title",
          },
        ],
      },
    });
    expect(
      (await applySupportedBlueprint(gateway as never, 42, blueprint))
        .operations,
    ).toContainEqual(
      expect.objectContaining({
        operation: "sync-story-path",
        status: "updated",
      }),
    );
    expect(
      (await applySupportedBlueprint(gateway as never, 42, blueprint))
        .operations,
    ).toContainEqual(
      expect.objectContaining({
        operation: "sync-story-path",
        status: "unchanged",
      }),
    );
    expect(writes).toBe(1);
  });
  test("reports successful and failed bulk variant operations before stopping", async () => {
    const folders = ["global", "italy", "germany", "uk"];
    let writes = 0;
    const gateway = {
      getSpace: async () => ({
        id: 42,
        dimensions_app_folder_ids: [1, 2, 3, 4],
        dimensions_app_folders: [],
      }),
      listStories: async (_space: number, options?: { ids?: number[] }) =>
        options?.ids
          ? folders.map((name, i) => ({
              id: i + 1,
              parent_id: 0,
              is_folder: true,
              full_slug: `${name}/`,
            }))
          : [{ id: 10, full_slug: "global/home" }],
      findStoryBySlug: async () => ({ id: 10 }),
      getStory: async () => ({
        id: 10,
        full_slug: "global/home",
        group_id: "group",
        alternates: [],
      }),
      duplicateStoryToDimension: async (
        _space: number,
        _id: number,
        folder: number,
      ) => {
        writes++;
        if (folder === 3) throw new Error("failure");
        return { id: 20, full_slug: "italy/home", group_id: "group" };
      },
    };
    const blueprint = compileSupportedBlueprint({
      version: 1,
      stories: { create_missing_variants: [{ starts_with: "global/" }] },
    });
    const report = await applySupportedBlueprint(
      gateway as never,
      42,
      blueprint,
    );
    expect(report.failed).toBe(true);
    expect(
      report.operations
        .filter((item) => item.operation === "create-dimension-variant")
        .map((item) => item.status),
    ).toEqual(["created", "failed", "not_run"]);
    expect(writes).toBe(2);
  });
  test("creates missing Dimensions variants from a source folder and skips them on retry", async () => {
    let exists = false,
      writes = 0;
    const gateway = {
      getSpace: async () => ({
        id: 42,
        dimensions_app_folder_ids: [1, 2],
        dimensions_app_folders: [],
      }),
      listStories: async (_space: number, options?: { ids?: number[] }) =>
        options?.ids
          ? [
              { id: 1, is_folder: true, parent_id: 0, full_slug: "global/" },
              { id: 2, is_folder: true, parent_id: 0, full_slug: "italy/" },
            ]
          : [{ id: 10, full_slug: "global/home" }],
      findStoryBySlug: async () => ({ id: 10 }),
      getStory: async () => ({
        id: 10,
        full_slug: "global/home",
        group_id: "group",
        alternates: exists ? [{ id: 20, full_slug: "italy/home" }] : [],
      }),
      duplicateStoryToDimension: async () => {
        exists = true;
        writes++;
        return { id: 20, full_slug: "italy/home", group_id: "group" };
      },
    };
    const blueprint = compileSupportedBlueprint({
      version: 1,
      stories: {
        create_missing_variants: [
          { starts_with: "global/", folders: ["italy"] },
        ],
      },
    });
    expect(
      (await applySupportedBlueprint(gateway as never, 42, blueprint))
        .operations,
    ).toContainEqual(
      expect.objectContaining({
        operation: "create-dimension-variant",
        status: "created",
      }),
    );
    expect(
      (await applySupportedBlueprint(gateway as never, 42, blueprint))
        .operations,
    ).toContainEqual(
      expect.objectContaining({
        operation: "create-dimension-variant",
        status: "unchanged",
      }),
    );
    expect(writes).toBe(1);
  });
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

  test("moves site config to global, restores a root copy, and keeps both on retry", async () => {
    const entries = [
      {
        id: 1,
        slug: "site-config",
        full_slug: "site-config",
        name: "Site config",
        parent_id: 0,
        is_folder: false,
        content: { component: "site-config" },
      },
      {
        id: 2,
        slug: "global",
        full_slug: "global",
        name: "global",
        parent_id: 0,
        is_folder: true,
        content: {},
      },
      {
        id: 3,
        slug: "italy",
        full_slug: "italy",
        name: "italy",
        parent_id: 0,
        is_folder: true,
        content: {},
      },
    ];
    let moves = 0,
      copies = 0;
    const gateway = {
      findStoryFolderBySlug: async (_space: number, slug: string) => {
        const folder = entries.find(
          (item) => item.is_folder && item.full_slug === slug,
        );
        return folder && { id: folder.id };
      },
      findStoryBySlug: async (_space: number, slug: string) =>
        entries.find((item) => !item.is_folder && item.full_slug === slug),
      getStory: async (_space: number, id: number) =>
        entries.find((item) => item.id === id),
      listStories: async () => entries,
      moveStory: async (_space: number, id: number, parent: number) => {
        const item = entries.find((entry) => entry.id === id)!;
        moves++;
        item.parent_id = parent;
        item.full_slug = `global/${item.slug}`;
        return item;
      },
      createStory: async (
        _space: number,
        input: { name: string; slug: string; content: object },
      ) => {
        copies++;
        const item = {
          id: 4,
          name: input.name,
          slug: input.slug,
          full_slug: input.slug,
          parent_id: 0,
          is_folder: false,
          content: input.content,
        };
        entries.push(item);
        return item;
      },
    };
    const blueprint = compileSupportedBlueprint({
      version: 1,
      stories: {
        organize_root: { destination: "global", keep: ["italy"] },
        copy: [{ source: "global/site-config", target: "site-config" }],
      },
    });
    const first = await applySupportedBlueprint(
      gateway as never,
      42,
      blueprint,
    );
    expect(first.summary.failed).toBe(0);
    expect(
      entries
        .filter((entry) => !entry.is_folder)
        .map((entry) => entry.full_slug),
    ).toEqual(["global/site-config", "site-config"]);
    const second = await applySupportedBlueprint(
      gateway as never,
      42,
      blueprint,
    );
    expect(second.summary.failed).toBe(0);
    expect([moves, copies]).toEqual([1, 1]);
    expect(second.operations).toMatchObject([
      { operation: "organize-root", status: "unchanged" },
      { operation: "copy-story", status: "unchanged" },
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

  test("creates a Dimensions variant through the shared action and skips it on retry", async () => {
    let exists = false,
      writes = 0;
    const gateway = {
      getSpace: async () => ({
        id: 42,
        dimensions_app_folder_ids: [9],
        dimensions_app_folders: [],
      }),
      listStories: async () => [
        { id: 9, is_folder: true, full_slug: "italy/", parent_id: 0 },
      ],
      findStoryBySlug: async () => ({ id: 1 }),
      getStory: async () => ({
        id: 1,
        full_slug: "global/home",
        group_id: "group-1",
        alternates: exists ? [{ id: 2, full_slug: "italy/home" }] : [],
      }),
      duplicateStoryToDimension: async () => {
        writes++;
        exists = true;
        return { id: 2, full_slug: "italy/home", group_id: "group-1" };
      },
    };
    const blueprint = compileSupportedBlueprint({
      version: 1,
      stories: { create_variants: [{ story: "global/home", folder: "italy" }] },
    });
    const first = await applySupportedBlueprint(
      gateway as never,
      42,
      blueprint,
    );
    expect(first.operations).toMatchObject([
      { operation: "create-dimension-variant", status: "created" },
    ]);
    const second = await applySupportedBlueprint(
      gateway as never,
      42,
      blueprint,
    );
    expect(second.operations).toMatchObject([
      { operation: "create-dimension-variant", status: "unchanged" },
    ]);
    expect(writes).toBe(1);
  });
  test("syncs only selected block fields via YAML and skips a repeat", async () => {
    const stories = [
      {
        id: 1,
        full_slug: "global/home",
        content: {
          component: "page",
          _uid: "p1",
          body: [
            { component: "hero", _uid: "h1", image: "new", title: "Hello" },
          ],
        },
      },
      {
        id: 2,
        full_slug: "italy/home",
        content: {
          component: "page",
          _uid: "p2",
          body: [
            { component: "hero", _uid: "h2", image: "old", title: "Ciao" },
          ],
        },
      },
    ];
    let writes = 0;
    const gateway = {
      findStoryBySlug: async (_space: number, slug: string) =>
        stories.find((story) => story.full_slug === slug),
      getStory: async (_space: number, id: number) =>
        structuredClone(stories.find((story) => story.id === id)),
      listComponents: async () => [
        {
          name: "hero",
          schema: { image: { type: "asset" }, title: { type: "text" } },
        },
      ],
      updateStoryContent: async (
        _space: number,
        id: number,
        content: unknown,
      ) => {
        writes++;
        const story = stories.find((item) => item.id === id)!;
        story.content = content as typeof story.content;
        return structuredClone(story);
      },
    };
    const blueprint = compileSupportedBlueprint({
      version: 1,
      stories: {
        sync_blocks: [
          {
            source: "global/home",
            target: "italy/home",
            component: "hero",
            fields: ["image"],
          },
        ],
      },
    });
    expect(
      (await applySupportedBlueprint(gateway as never, 42, blueprint))
        .operations,
    ).toMatchObject([{ operation: "sync-block-fields", status: "updated" }]);
    expect(stories[1]?.content.body[0]).toMatchObject({
      image: "new",
      title: "Ciao",
      _uid: "h2",
    });
    expect(
      (await applySupportedBlueprint(gateway as never, 42, blueprint))
        .operations,
    ).toMatchObject([{ operation: "sync-block-fields", status: "unchanged" }]);
    expect(writes).toBe(1);
  });
  test("updates all matching blocks through YAML and skips a repeat", async () => {
    const story = {
      id: 1,
      full_slug: "home",
      content: {
        component: "page",
        _uid: "p",
        body: [
          { component: "hero", _uid: "a", eyebrow: "Welcome", headline: "Old" },
          { component: "hero", _uid: "b", eyebrow: "Other", headline: "Keep" },
        ],
      },
    };
    let writes = 0;
    const gateway = {
      findStoryBySlug: async () => ({ id: 1 }),
      getStory: async () => structuredClone(story),
      listComponents: async () => [
        {
          name: "hero",
          schema: { eyebrow: { type: "text" }, headline: { type: "text" } },
        },
      ],
      updateStoryContent: async (
        _space: number,
        _id: number,
        content: unknown,
      ) => {
        writes++;
        story.content = content as typeof story.content;
        return structuredClone(story);
      },
    };
    const blueprint = compileSupportedBlueprint({
      version: 1,
      stories: {
        update_matching_blocks: [
          {
            story: "home",
            component: "hero",
            where: { field: "eyebrow", equals: "Welcome" },
            fields: { headline: "Hello" },
          },
        ],
      },
    });
    expect(
      (await applySupportedBlueprint(gateway as never, 42, blueprint))
        .operations,
    ).toMatchObject([
      { operation: "update-matching-blocks", status: "updated" },
    ]);
    expect(story.content.body.map((block) => block.headline)).toEqual([
      "Hello",
      "Keep",
    ]);
    expect(
      (await applySupportedBlueprint(gateway as never, 42, blueprint))
        .operations,
    ).toMatchObject([
      { operation: "update-matching-blocks", status: "unchanged" },
    ]);
    expect(writes).toBe(1);
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
