import { readdir, readFile, stat } from "node:fs/promises";
import { basename, resolve, matchesGlob } from "node:path";
import { createHash } from "node:crypto";
import { CliError } from "../errors.ts";
import type {
  StoryblokAsset,
  StoryblokAssetFolder,
  StoryblokGateway,
} from "../storyblok/gateway.ts";
import { BlueprintOperationError } from "./blueprint-report.ts";

type Gateway = Pick<
  StoryblokGateway,
  | "listAssetFolders"
  | "createAssetFolder"
  | "listAssets"
  | "uploadAsset"
  | "readAsset"
>;
export interface AssetDirectory {
  source: string;
  target_folder: string;
  include?: string[];
}
export interface RemoteAsset {
  name: string;
  url: string;
  target_folder: string;
  filename: string;
}
export interface PreparedAsset {
  name: string;
  folder: string;
  data: Uint8Array;
}

export async function prepareAssets(
  directories: AssetDirectory[],
  configPath: string,
  remoteAssets: RemoteAsset[] = [],
): Promise<PreparedAsset[]> {
  const prepared: PreparedAsset[] = [];
  const configDir = resolve(configPath, "..");
  for (const directory of directories) {
    const path = resolve(configDir, directory.source);
    let entries: string[];
    try {
      if (!(await stat(path)).isDirectory()) throw new Error();
      entries = (await readdir(path, { withFileTypes: true }))
        .filter((entry) => entry.isFile())
        .map((entry) => entry.name)
        .sort();
    } catch {
      throw new CliError(
        `Asset source directory not found or unreadable: ${directory.source}`,
        2,
      );
    }
    const patterns = directory.include ?? ["*"];
    for (const pattern of patterns) {
      if (!entries.some((entry) => matchesGlob(entry, pattern)))
        throw new CliError(
          `Asset include '${pattern}' matched no files in ${directory.source}.`,
          2,
        );
    }
    for (const name of entries.filter((entry) =>
      patterns.some((pattern) => matchesGlob(entry, pattern)),
    )) {
      const folder = directory.target_folder;
      if (prepared.some((item) => item.folder === folder && item.name === name))
        throw new CliError(
          `Asset ${folder}/${name} is declared more than once.`,
          2,
        );
      try {
        prepared.push({
          name,
          folder,
          data: await readFile(resolve(path, name)),
        });
      } catch {
        throw new CliError(
          `Could not read asset ${directory.source}/${name}.`,
          2,
        );
      }
    }
  }
  for (const remote of remoteAssets) {
    if (
      prepared.some(
        (item) =>
          item.folder === remote.target_folder && item.name === remote.filename,
      )
    )
      throw new CliError(
        `Asset ${remote.target_folder}/${remote.filename} is declared more than once.`,
        2,
      );
    let response: Response;
    try {
      response = await fetch(remote.url, {
        signal: AbortSignal.timeout(30_000),
      });
    } catch {
      throw new CliError(
        `Could not download remote asset '${remote.name}'.`,
        2,
      );
    }
    if (!response.ok)
      throw new CliError(
        `Could not download remote asset '${remote.name}' (HTTP ${response.status}).`,
        2,
      );
    const maximum = 100 * 1024 * 1024;
    const length = Number(response.headers.get("content-length"));
    if (length > maximum)
      throw new CliError(
        `Remote asset '${remote.name}' exceeds the 100 MiB limit.`,
        2,
      );
    const reader = response.body?.getReader();
    if (!reader)
      throw new CliError(`Remote asset '${remote.name}' has no content.`, 2);
    const chunks: Uint8Array[] = [];
    let total = 0;
    try {
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        total += value.length;
        if (total > maximum) {
          await reader.cancel();
          throw new CliError(
            `Remote asset '${remote.name}' exceeds the 100 MiB limit.`,
            2,
          );
        }
        chunks.push(value);
      }
    } catch (error) {
      if (error instanceof CliError) throw error;
      throw new CliError(
        `Could not download remote asset '${remote.name}'.`,
        2,
      );
    }
    if (!total)
      throw new CliError(`Remote asset '${remote.name}' is empty.`, 2);
    const data = new Uint8Array(total);
    let offset = 0;
    for (const chunk of chunks) {
      data.set(chunk, offset);
      offset += chunk.length;
    }
    prepared.push({
      name: remote.filename,
      folder: remote.target_folder,
      data,
    });
  }
  return prepared;
}

async function findFolder(
  gateway: Gateway,
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
      throw new CliError(`Asset folder '${path}' is ambiguous.`);
    let folder = matches[0];
    if (!folder && create) {
      folder = await gateway.createAssetFolder(spaceId, name, parent);
      folders.push(folder);
    }
    if (!folder) throw new CliError(`Asset folder '${path}' was not found.`);
    parent = folder.id;
  }
  return parent!;
}

const hash = (bytes: Uint8Array) =>
  createHash("sha256").update(bytes).digest("hex");
export async function applyAssets(
  gateway: Gateway,
  spaceId: number,
  assets: PreparedAsset[],
  operations: Array<{ operation: string; key: string; status: string }>,
  onAsset?: (name: string, current: number, total: number) => void,
): Promise<void> {
  if (!assets.length) return;
  const folders = await gateway.listAssetFolders(spaceId);
  for (const [index, asset] of assets.entries()) {
    onAsset?.(asset.name, index + 1, assets.length);
    try {
      const folderId = await findFolder(
        gateway,
        spaceId,
        folders,
        asset.folder,
        true,
      );
      const existing = (
        await gateway.listAssets(spaceId, folderId, asset.name)
      ).filter(
        (item) =>
          item.asset_folder_id === folderId &&
          (item.short_filename || basename(new URL(item.filename).pathname)) ===
            asset.name,
      );
      if (existing.length > 1)
        throw new CliError(
          `Multiple assets named '${asset.name}' exist in '${asset.folder}'.`,
        );
      if (existing[0]) {
        const remote = await gateway.readAsset(existing[0]);
        if (hash(remote) !== hash(asset.data))
          throw new CliError(
            `Asset '${asset.folder}/${asset.name}' already exists with different content.`,
          );
        operations.push({
          operation: "upload-asset",
          key: `${asset.folder}/${asset.name}`,
          status: "unchanged",
        });
      } else {
        await gateway.uploadAsset(spaceId, folderId, asset.name, asset.data);
        operations.push({
          operation: "upload-asset",
          key: `${asset.folder}/${asset.name}`,
          status: "created",
        });
      }
    } catch (error) {
      throw new BlueprintOperationError(
        "upload-asset",
        `${asset.folder}/${asset.name}`,
        error,
      );
    }
  }
}

export async function resolveAssetFind(
  gateway: Gateway,
  spaceId: number,
  find: { search: string; in_folder?: string; require_unique?: boolean },
): Promise<StoryblokAsset> {
  const folderId = find.in_folder
    ? await findFolder(
        gateway,
        spaceId,
        await gateway.listAssetFolders(spaceId),
        find.in_folder,
        false,
      )
    : undefined;
  const assets = (
    await gateway.listAssets(spaceId, folderId, find.search)
  ).filter(
    (asset) => folderId === undefined || asset.asset_folder_id === folderId,
  );
  if (!assets.length)
    throw new CliError(`No asset found for '${find.search}'.`);
  if (find.require_unique !== false && assets.length !== 1)
    throw new CliError(`Multiple assets found for '${find.search}'.`);
  return assets[0]!;
}

export async function resolveStoryAssetReferences(
  gateway: Gateway,
  spaceId: number,
  value: unknown,
  references: RemoteAsset[] = [],
): Promise<unknown> {
  if (Array.isArray(value))
    return Promise.all(
      value.map((item) =>
        resolveStoryAssetReferences(gateway, spaceId, item, references),
      ),
    );
  if (typeof value !== "object" || value === null) return value;
  const object = value as Record<string, unknown>;
  const directive = object.asset;
  if (
    Object.keys(object).length === 1 &&
    typeof directive === "object" &&
    directive !== null &&
    !Array.isArray(directive) &&
    ("_find" in directive || "_ref" in directive)
  ) {
    const options = directive as Record<string, unknown>;
    if ("_ref" in options) {
      if (
        "_find" in options ||
        typeof options._ref !== "string" ||
        Object.keys(options).some(
          (key) => key.startsWith("_") && key !== "_ref",
        )
      )
        throw new CliError("Invalid asset _ref directive.", 2);
      const ref = references.find((item) => item.name === options._ref);
      if (!ref)
        throw new CliError(
          `Asset reference '${options._ref}' was not declared.`,
          2,
        );
      const folderId = await findFolder(
        gateway,
        spaceId,
        await gateway.listAssetFolders(spaceId),
        ref.target_folder,
        false,
      );
      const assets = (
        await gateway.listAssets(spaceId, folderId, ref.filename)
      ).filter(
        (item) =>
          item.asset_folder_id === folderId &&
          (item.short_filename || basename(new URL(item.filename).pathname)) ===
            ref.filename,
      );
      if (assets.length !== 1)
        throw new CliError(
          `Asset reference '${ref.name}' was not found or is ambiguous.`,
        );
      const overrides = Object.fromEntries(
        await Promise.all(
          Object.entries(options)
            .filter(([key]) => key !== "_ref")
            .map(async ([key, item]) => [
              key,
              await resolveStoryAssetReferences(
                gateway,
                spaceId,
                item,
                references,
              ),
            ]),
        ),
      );
      return {
        id: assets[0]!.id,
        filename: assets[0]!.filename,
        fieldtype: "asset",
        is_external_url: false,
        ...overrides,
      };
    }
    const find = options._find;
    if (typeof find !== "object" || find === null || Array.isArray(find))
      throw new CliError("Asset _find must be an object.", 2);
    const query = find as Record<string, unknown>;
    if (
      Object.keys(query).some(
        (key) => !["search", "in_folder", "require_unique"].includes(key),
      ) ||
      typeof query.search !== "string" ||
      !query.search.trim() ||
      (query.in_folder !== undefined &&
        (typeof query.in_folder !== "string" || !query.in_folder.trim())) ||
      (query.require_unique !== undefined &&
        typeof query.require_unique !== "boolean")
    )
      throw new CliError(
        "Asset _find requires a search and supports in_folder and require_unique.",
        2,
      );
    if (
      Object.keys(options).some((key) => key.startsWith("_") && key !== "_find")
    )
      throw new CliError("Unsupported asset directive.", 2);
    const asset = await resolveAssetFind(
      gateway,
      spaceId,
      query as unknown as {
        search: string;
        in_folder?: string;
        require_unique?: boolean;
      },
    );
    const overrides = Object.fromEntries(
      await Promise.all(
        Object.entries(options)
          .filter(([key]) => key !== "_find")
          .map(async ([key, item]) => [
            key,
            await resolveStoryAssetReferences(
              gateway,
              spaceId,
              item,
              references,
            ),
          ]),
      ),
    );
    return {
      id: asset.id,
      filename: asset.filename,
      fieldtype: "asset",
      is_external_url: false,
      ...overrides,
    };
  }
  return Object.fromEntries(
    await Promise.all(
      Object.entries(object).map(async ([key, item]) => [
        key,
        await resolveStoryAssetReferences(gateway, spaceId, item, references),
      ]),
    ),
  );
}
