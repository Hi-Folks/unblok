import { describe, expect, test } from "bun:test";
import { mkdtemp, mkdir, rm, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { applyAssets, prepareAssets, resolveAssetFind, resolveStoryAssetReferences } from "./blueprint-assets.ts";
import { compileSupportedBlueprint } from "./blueprint-apply.ts";
import { resolveBlueprint } from "./blueprint-validation.ts";

describe("blueprint assets", () => {
  test("prepares paths relative to the blueprint and checks includes", async () => {
    const dir = await mkdtemp(join(tmpdir(), "unblok-assets-"));
    try {
      await mkdir(join(dir, "files"));
      await writeFile(join(dir, "files", "banner.png"), "hello");
      await writeFile(join(dir, "files", "skip.txt"), "skip");
      const files = await prepareAssets([{ source: "./files", target_folder: "Demo", include: ["*.png"] }], join(dir, "setup.yaml"));
      expect(files.map((file) => file.name)).toEqual(["banner.png"]);
      await expect(prepareAssets([{ source: "./files", target_folder: "Demo", include: ["missing.png"] }], join(dir, "setup.yaml"))).rejects.toThrow("matched no files");
    } finally { await rm(dir, { recursive: true, force: true }); }
  });

  test("creates folders, uploads once, reuses identical data, and rejects conflicts", async () => {
    const data = new TextEncoder().encode("hello");
    const folders: Array<{ id: number; name: string; parent_id?: number }> = [];
    const assets: Array<{ id: number; short_filename: string; filename: string; asset_folder_id: number }> = [];
    let uploads = 0;
    const gateway = {
      listAssetFolders: async () => folders,
      createAssetFolder: async (_id: number, name: string, parentId?: number) => ({ id: folders.length + 1, name, parent_id: parentId }),
      listAssets: async () => assets,
      uploadAsset: async (_id: number, folderId: number, name: string) => { uploads++; assets.push({ id: 7, short_filename: name, filename: "https://a.storyblok.com/f/banner.png", asset_folder_id: folderId }); },
      readAsset: async () => data,
    };
    const operations: Array<{ operation: string; key: string; status: string }> = [];
    const files = [{ name: "banner.png", folder: "Parent/Demo", data }];
    await applyAssets(gateway, 1, files, operations);
    expect(folders.map((folder) => [folder.name, folder.parent_id])).toEqual([["Parent", undefined], ["Demo", 1]]);
    await applyAssets(gateway, 1, files, operations);
    expect(uploads).toBe(1);
    expect(operations.map((item) => item.status)).toEqual(["created", "unchanged"]);
    await expect(applyAssets(gateway, 1, [{ ...files[0]!, data: new Uint8Array([1]) }], operations)).rejects.toThrow("different content");
    expect((await resolveAssetFind(gateway, 1, { search: "banner", in_folder: "Parent/Demo" })).id).toBe(7);
    expect(await resolveStoryAssetReferences(gateway, 1, { image: { asset: { _find: { search: "banner", in_folder: "Parent/Demo", require_unique: true }, alt: "Banner" } } })).toEqual({ image: { id: 7, filename: "https://a.storyblok.com/f/banner.png", fieldtype: "asset", is_external_url: false, alt: "Banner" } });
    expect(await resolveStoryAssetReferences(gateway, 1, { asset: { _ref: "hero", alt: "Banner" } }, [{ name: "hero", url: "https://example.com/banner.png", target_folder: "Parent/Demo", filename: "banner.png" }])).toMatchObject({ id: 7, alt: "Banner" });
    assets.push({ ...assets[0]!, id: 8 });
    await expect(resolveAssetFind(gateway, 1, { search: "banner", in_folder: "Parent/Demo" })).rejects.toThrow("Multiple assets");
  });

  test("downloads and prepares a named URL with a derived filename", async () => {
    const original = globalThis.fetch;
    let requested = "";
    globalThis.fetch = (async (url: string | URL | Request) => { requested = String(url); return new Response("image-data"); }) as typeof fetch;
    try {
      const blueprint = compileSupportedBlueprint(resolveBlueprint({ version: 1, assets: { upload_url: [{ name: "hero", url: "https://example.com/hero%20image.png?version=1", target_folder: "Demo" }] } }));
      const files = await prepareAssets([], "setup.yaml", blueprint.remoteAssets);
      expect(files[0]?.name).toBe("hero image.png");
      expect(new TextDecoder().decode(files[0]?.data)).toBe("image-data");
      expect(requested).toContain("version=1");
    } finally { globalThis.fetch = original; }
  });

  test("rejects download failures without revealing URL query strings", async () => {
    const original = globalThis.fetch;
    globalThis.fetch = (async () => new Response("missing", { status: 404 })) as unknown as typeof fetch;
    try {
      const remote = [{ name: "hero", url: "https://example.com/x.png?secret=abc", target_folder: "Demo", filename: "x.png" }];
      try { await prepareAssets([], "setup.yaml", remote); throw new Error("expected failure"); }
      catch (error) { expect(String(error)).toContain("HTTP 404"); expect(String(error)).not.toContain("secret"); }
    } finally { globalThis.fetch = original; }
  });

  test("validates remote URLs and duplicate reference names before execution", () => {
    const remote = { name: "hero", url: "https://example.com/hero.png", target_folder: "Demo" };
    expect(() => compileSupportedBlueprint({ version: 1, assets: { upload_url: [{ ...remote, url: "file:///tmp/x.png" }] } })).toThrow("HTTP or HTTPS");
    expect(() => compileSupportedBlueprint({ version: 1, assets: { upload_url: [remote, remote] } })).toThrow("duplicated");
    expect(() => compileSupportedBlueprint({ version: 1, assets: { upload_url: [{ ...remote, url: "https://example.com/image" }] } })).toThrow("extension");
  });
});
