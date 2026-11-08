import { createHash } from "node:crypto";
import { basename } from "node:path";
import { CliError } from "../../errors.ts";
import type {
  StoryblokAssetFolder,
  StoryblokGateway,
} from "../../storyblok/gateway.ts";
import { toUnblokError } from "../action-error.ts";

export type AssetUploadGateway = Pick<
  StoryblokGateway,
  | "listAssetFolders"
  | "createAssetFolder"
  | "listAssets"
  | "uploadAsset"
  | "readAsset"
>;
export interface EnsureAssetUploadedInput {
  spaceId: number;
  filename: string;
  data: Uint8Array;
  folder?: string;
}
export interface EnsureAssetUploadedResult {
  status: "created" | "unchanged";
  filename: string;
  folder?: string;
}

export async function findAssetFolder(
  gateway: AssetUploadGateway,
  spaceId: number,
  folders: StoryblokAssetFolder[],
  path: string,
  create: boolean,
): Promise<number> {
  let parent: number | undefined;
  for (const name of path.split("/")) {
    const matches = folders.filter(
      (folder) =>
        folder.name === name && (folder.parent_id ?? undefined) === parent,
    );
    if (matches.length > 1)
      throw new CliError(
        `Asset folder '${path}' is ambiguous.`,
        1,
        "AMBIGUOUS",
      );
    let folder = matches[0];
    if (!folder && create) {
      folder = await gateway.createAssetFolder(spaceId, name, parent);
      folders.push(folder);
    }
    if (!folder)
      throw new CliError(
        `Asset folder '${path}' was not found.`,
        1,
        "NOT_FOUND",
      );
    parent = folder.id;
  }
  if (parent === undefined)
    throw new CliError("Asset folder must not be empty.", 1, "INVALID_INPUT");
  return parent;
}

export async function reconcileAsset(
  gateway: AssetUploadGateway,
  input: EnsureAssetUploadedInput,
  folderId: number | undefined,
): Promise<EnsureAssetUploadedResult> {
  const { spaceId, filename, data, folder } = input;
  const existing = (
    await gateway.listAssets(spaceId, folderId, filename)
  ).filter(
    (asset) =>
      (asset.asset_folder_id ?? undefined) === folderId &&
      (asset.short_filename || basename(new URL(asset.filename).pathname)) ===
        filename,
  );
  if (existing.length > 1)
    throw new CliError(
      `Multiple assets named '${filename}' exist in '${folder ?? "root"}'.`,
      1,
      "AMBIGUOUS",
    );
  if (existing[0]) {
    const hash = (bytes: Uint8Array) =>
      createHash("sha256").update(bytes).digest("hex");
    if (hash(await gateway.readAsset(existing[0])) !== hash(data))
      throw new CliError(
        `Asset '${folder ? `${folder}/` : ""}${filename}' already exists with different content.`,
        1,
        "CONFLICT",
      );
    return {
      status: "unchanged",
      filename,
      ...(folder === undefined ? {} : { folder }),
    };
  }
  await gateway.uploadAsset(spaceId, folderId, filename, data);
  return {
    status: "created",
    filename,
    ...(folder === undefined ? {} : { folder }),
  };
}

/** Upload an asset if absent, or verify that the existing asset has identical content. */
export async function ensureAssetUploaded(
  gateway: AssetUploadGateway,
  input: EnsureAssetUploadedInput,
): Promise<EnsureAssetUploadedResult> {
  try {
    if (
      !Number.isSafeInteger(input.spaceId) ||
      input.spaceId <= 0 ||
      typeof input.filename !== "string" ||
      !input.filename.trim() ||
      input.filename !== input.filename.trim() ||
      /[/\\]/.test(input.filename) ||
      !(input.data instanceof Uint8Array) ||
      (input.folder !== undefined &&
        (typeof input.folder !== "string" ||
          input.folder
            .split("/")
            .some((part) => !part.trim() || part !== part.trim())))
    )
      throw new CliError(
        "Provide a positive spaceId, filename, file data, and an optional valid folder path.",
        1,
        "INVALID_INPUT",
      );
    const folderId =
      input.folder === undefined
        ? undefined
        : await findAssetFolder(
            gateway,
            input.spaceId,
            await gateway.listAssetFolders(input.spaceId),
            input.folder,
            true,
          );
    return await reconcileAsset(gateway, input, folderId);
  } catch (error) {
    throw toUnblokError(error);
  }
}
