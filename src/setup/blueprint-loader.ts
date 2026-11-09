import { dirname, isAbsolute, relative, resolve } from "node:path";
import { realpath } from "node:fs/promises";
import { loadDocument } from "../config/document.ts";
import { CliError } from "../errors.ts";

type Mapping = Record<string, unknown>;
const object = (value: unknown): value is Mapping =>
  typeof value === "object" && value !== null && !Array.isArray(value);
const operationLists = new Set([
  "apps.install",
  "components.fields",
  "assets.upload_directory",
  "assets.upload_url",
  "stories.create",
  "stories.ensure_folders",
  "stories.translated_slugs",
  "stories.update_blocks",
  "workflow.assign",
  "tags",
  "experiments.create",
  "releases.create",
  "pipelines.create",
]);

function merge(base: Mapping, overlay: Mapping, prefix = ""): Mapping {
  const output: Mapping = { ...base };
  for (const [key, value] of Object.entries(overlay)) {
    const path = prefix ? `${prefix}.${key}` : key;
    const previous = Object.hasOwn(output, key) ? output[key] : undefined;
    const next =
      object(previous) && object(value)
        ? merge(previous, value, path)
        : operationLists.has(path) &&
            Array.isArray(previous) &&
            Array.isArray(value)
          ? [...previous, ...value]
          : value;
    Object.defineProperty(output, key, {
      value: next,
      writable: true,
      configurable: true,
      enumerable: true,
    });
  }
  return output;
}

/** Merge parents in order, then the current file; each file is included at most once. */
export async function loadBlueprint(path: string): Promise<Mapping> {
  const root = resolve(path);
  const rootDirectory = dirname(root);
  const visited = new Set<string>();
  const active = new Set<string>();
  async function visit(filePath: string): Promise<Mapping> {
    let canonical: string;
    try {
      canonical = await realpath(filePath);
    } catch {
      throw new CliError(`Setup file not found: ${filePath}`, 2);
    }
    if (active.has(canonical))
      throw new CliError(`Circular blueprint extends: ${filePath}`, 2);
    if (visited.has(canonical)) return {};
    active.add(canonical);
    const parsed = await loadDocument(filePath, "Setup");
    if (!object(parsed))
      throw new CliError(`Setup file must contain an object: ${filePath}`, 2);
    if (parsed.version !== undefined && parsed.version !== 1)
      throw new CliError(`Setup version must be 1 in ${filePath}.`, 2);
    const extendsValue = parsed.extends;
    const parents =
      typeof extendsValue === "string"
        ? [extendsValue]
        : extendsValue === undefined
          ? []
          : extendsValue;
    if (
      !Array.isArray(parents) ||
      parents.some(
        (item) =>
          typeof item !== "string" || !item.trim() || item.includes("${{"),
      )
    )
      throw new CliError(
        `extends must be a path or array of paths in ${filePath}.`,
        2,
      );
    let result: Mapping = {};
    for (const parent of parents)
      result = merge(result, await visit(resolve(dirname(filePath), parent)));
    const current: Mapping = Object.fromEntries(
      Object.entries(parsed).filter(([key]) => key !== "extends"),
    );
    // Rebase local asset paths to the main blueprint, preserving each fragment's location.
    if (
      object(current.assets) &&
      Array.isArray(current.assets.upload_directory)
    ) {
      current.assets = {
        ...current.assets,
        upload_directory: current.assets.upload_directory.map((entry) => {
          if (
            !object(entry) ||
            typeof entry.source !== "string" ||
            isAbsolute(entry.source)
          )
            return entry;
          const rebased =
            relative(rootDirectory, resolve(dirname(filePath), entry.source)) ||
            ".";
          return { ...entry, source: rebased };
        }),
      };
    }
    result = merge(result, current);
    active.delete(canonical);
    visited.add(canonical);
    return result;
  }
  return visit(root);
}
