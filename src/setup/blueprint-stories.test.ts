import { describe, expect, test } from "bun:test";
import { applyStories } from "./blueprint-stories.ts";
import {
  applySupportedBlueprint,
  compileSupportedBlueprint,
} from "./blueprint-apply.ts";

describe("story setup", () => {
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
