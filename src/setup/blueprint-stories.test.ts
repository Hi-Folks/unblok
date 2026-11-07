import { describe, expect, test } from "bun:test";
import { applyStories } from "./blueprint-stories.ts";

describe("story setup", () => {
  test("creates nested content with resolved asset and skips an existing story", async () => {
    let created: any;
    let exists = false;
    const gateway = {
      findStoryBySlug: async () => exists ? { id: 5 } : undefined,
      listAssetFolders: async () => [{ id: 2, name: "Provisioned" }],
      listAssets: async () => [{ id: 7, filename: "https://a.storyblok.com/f/banner.png", asset_folder_id: 2 }],
      createStory: async (_id: number, story: unknown) => { created = story; exists = true; return { id: 5 }; },
    };
    const story = { name: "Auto", slug: "auto-created", content: { component: "page", body: [{ component: "hero", image: { asset: { _find: { search: "banner.png", in_folder: "Provisioned", require_unique: true }, alt: "Banner" } } }] } };
    const operations: Array<{ operation: string; key: string; status: string }> = [];
    await applyStories(gateway as never, 42, [story], [], operations);
    expect(created.content._uid).toBeTruthy();
    expect(created.content.body[0]._uid).toBeTruthy();
    expect(created.content.body[0].image).toMatchObject({ id: 7, alt: "Banner", fieldtype: "asset" });
    await applyStories(gateway as never, 42, [story], [], operations);
    expect(operations.map((item) => item.status)).toEqual(["created", "unchanged"]);
  });

  test("updates translated slugs by ID without touching other translations", async () => {
    let updates: unknown;
    let current = { id: 1, full_slug: "about", is_folder: false, translated_slugs: [{ id: 11, lang: "it", slug: "vecchio", name: "Old" }, { id: 12, lang: "fr", slug: "ancien" }] };
    const gateway = {
      listInstalledApps: async () => [{ slug: "translatable-slugs" }],
      listLanguages: async () => [{ code: "it" }],
      findStoryBySlug: async () => current,
      getStory: async () => current,
      updateTranslatedSlugs: async (_space: number, _id: number, values: unknown) => { updates = values; current = { ...current, translated_slugs: [{ id: 11, lang: "it", slug: "chi-siamo", name: "Chi siamo" }, current.translated_slugs[1]!] }; },
    };
    const operations: Array<{ operation: string; key: string; status: string }> = [];
    const translations = [{ slug: "about", translations: [{ lang: "it", slug: "chi-siamo", name: "Chi siamo" }] }];
    await applyStories(gateway as never, 42, [], translations, operations);
    expect(updates).toEqual([{ id: 11, slug: "chi-siamo", name: "Chi siamo" }]);
    await applyStories(gateway as never, 42, [], translations, operations);
    expect(operations.map((item) => item.status)).toEqual(["updated", "unchanged"]);
  });

  test("fails closed when translated slug data is missing", async () => {
    const gateway = { listInstalledApps: async () => [{ slug: "translatable-slugs" }], listLanguages: async () => [{ code: "it" }], findStoryBySlug: async () => ({ id: 1 }), getStory: async () => ({ id: 1, full_slug: "about", is_folder: false }) };
    await expect(applyStories(gateway as never, 1, [], [{ slug: "about", translations: [{ lang: "it", slug: "chi" }] }], [])).rejects.toThrow("did not include translated slugs");
  });
});
