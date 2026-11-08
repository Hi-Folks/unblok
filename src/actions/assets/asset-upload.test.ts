import { describe, expect, test } from "bun:test";
import { UnblokError } from "../action-error.ts";
import {
  ensureAssetUploaded,
  type AssetUploadGateway,
} from "./asset-upload.ts";

describe("ensureAssetUploaded", () => {
  test("uploads to root, skips identical content, and rejects different content", async () => {
    const bytes = new Uint8Array([1, 2]);
    let uploaded = false;
    let folder: number | undefined = 99;
    const gateway: AssetUploadGateway = {
      listAssetFolders: async () => [],
      createAssetFolder: async () => {
        throw new Error("unexpected folder creation");
      },
      listAssets: async () =>
        uploaded
          ? [
              {
                id: 1,
                filename: "https://a.storyblok.com/a.png",
                short_filename: "a.png",
                asset_folder_id: null,
              },
            ]
          : [],
      readAsset: async () => bytes,
      uploadAsset: async (_spaceId, id) => {
        folder = id;
        uploaded = true;
      },
    };
    const input = { spaceId: 1, filename: "a.png", data: bytes };
    expect((await ensureAssetUploaded(gateway, input)).status).toBe("created");
    expect(folder).toBeUndefined();
    expect((await ensureAssetUploaded(gateway, input)).status).toBe(
      "unchanged",
    );
    try {
      await ensureAssetUploaded(gateway, {
        ...input,
        data: new Uint8Array([3]),
      });
      throw new Error("expected conflict");
    } catch (error) {
      expect(error).toBeInstanceOf(UnblokError);
      expect((error as UnblokError).code).toBe("CONFLICT");
    }
  });

  test("validates before requests and classifies ambiguous matches", async () => {
    let calls = 0;
    const gateway: AssetUploadGateway = {
      listAssetFolders: async () => {
        calls++;
        return [];
      },
      createAssetFolder: async () => {
        throw new Error("unexpected");
      },
      listAssets: async () => {
        calls++;
        return [1, 2].map((id) => ({
          id,
          filename: "https://a.storyblok.com/a.png",
          short_filename: "a.png",
        }));
      },
      readAsset: async () => new Uint8Array(),
      uploadAsset: async () => {
        throw new Error("unexpected");
      },
    };
    await expect(
      ensureAssetUploaded(gateway, {
        spaceId: 1,
        filename: "../a.png",
        data: new Uint8Array(),
      }),
    ).rejects.toMatchObject({ code: "INVALID_INPUT" });
    expect(calls).toBe(0);
    await expect(
      ensureAssetUploaded(gateway, {
        spaceId: 1,
        filename: "a.png",
        data: new Uint8Array(),
      }),
    ).rejects.toMatchObject({ code: "AMBIGUOUS" });
  });
});
