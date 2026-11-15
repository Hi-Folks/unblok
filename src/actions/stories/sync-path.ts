import { isDeepStrictEqual } from "node:util";
import { CliError } from "../../errors.ts";
import type { StoryblokGateway } from "../../storyblok/gateway.ts";
import { toUnblokError } from "../action-error.ts";
import { isValidStoryCreationSlug } from "./create-story.ts";

export type SyncPathGateway = Pick<
  StoryblokGateway,
  "findStoryBySlug" | "getStory" | "updateStoryContent"
>;
export interface SyncPathInput {
  spaceId: number;
  source: string;
  target: string;
  path: string;
  apply?: boolean;
}
export interface SyncPathReport {
  apiVersion: "unblok/story-sync-path-v1";
  status: "planned" | "updated" | "unchanged";
  source: { id: number; fullSlug: string };
  target: { id: number; fullSlug: string };
  path: string;
  before: unknown;
  after: unknown;
}
const object = (value: unknown): value is Record<string, unknown> =>
  !!value && typeof value === "object" && !Array.isArray(value);
const reserved = new Set([
  "__proto__",
  "prototype",
  "constructor",
  "_uid",
  "component",
]);

export function parseStorySyncPath(path: string): string[] {
  if (typeof path !== "string" || !path.startsWith("/") || path === "/")
    throw new CliError(
      "Provide a non-root JSON Pointer path.",
      2,
      "INVALID_INPUT",
    );
  return path
    .slice(1)
    .split("/")
    .map((token) => {
      if (/~(?![01])/.test(token))
        throw new CliError("Invalid JSON Pointer escape.", 2, "INVALID_INPUT");
      const decoded = token.replace(/~1/g, "/").replace(/~0/g, "~");
      if (!decoded || reserved.has(decoded))
        throw new CliError(
          "The path contains a reserved or empty segment.",
          2,
          "INVALID_INPUT",
        );
      return decoded;
    });
}

/** Copy a complete block or field at the same JSON Pointer in two story drafts. */
export async function syncStoryPath(
  gateway: SyncPathGateway,
  input: SyncPathInput,
): Promise<SyncPathReport> {
  try {
    const validRef = (value: unknown): value is string =>
      typeof value === "string" &&
      value === value.trim() &&
      isValidStoryCreationSlug(value) &&
      (!/^\d+$/.test(value) ||
        (Number.isSafeInteger(Number(value)) && Number(value) > 0));
    if (
      !input ||
      !Number.isSafeInteger(input.spaceId) ||
      input.spaceId <= 0 ||
      !validRef(input.source) ||
      !validRef(input.target) ||
      typeof input.path !== "string" ||
      !input.path.startsWith("/") ||
      input.path === "/" ||
      (input.apply !== undefined && typeof input.apply !== "boolean")
    )
      throw new CliError(
        "Provide valid story references and a non-root JSON Pointer path.",
        2,
        "INVALID_INPUT",
      );
    const tokens = parseStorySyncPath(input.path);
    const resolve = async (reference: string) => {
      const numeric = /^\d+$/.test(reference);
      const id = numeric
        ? Number(reference)
        : (await gateway.findStoryBySlug(input.spaceId, reference))?.id;
      if (!id)
        throw new CliError(
          `Story '${reference}' was not found.`,
          1,
          "NOT_FOUND",
        );
      const story = await gateway.getStory(input.spaceId, id);
      if (
        !story ||
        story.id !== id ||
        story.is_folder ||
        !story.full_slug ||
        (!numeric && story.full_slug !== reference) ||
        !object(story.content)
      )
        throw new CliError(
          `Story '${reference}' identity or content could not be verified.`,
          1,
          "CONFLICT",
        );
      return story;
    };
    const source = await resolve(input.source),
      target = await resolve(input.target);
    if (source.id === target.id)
      throw new CliError(
        "Source and target must be different stories.",
        2,
        "INVALID_INPUT",
      );
    const get = (
      root: unknown,
    ): {
      parent: Record<string, unknown> | unknown[];
      key: string;
      value: unknown;
    } => {
      let value: unknown = root;
      for (const [index, token] of tokens.entries()) {
        const parent = value;
        if (Array.isArray(parent)) {
          if (
            !/^(0|[1-9]\d*)$/.test(token) ||
            !Number.isSafeInteger(Number(token)) ||
            Number(token) >= parent.length ||
            !Object.hasOwn(parent, token)
          )
            throw new CliError(
              `Path '${input.path}' does not exist.`,
              1,
              "NOT_FOUND",
            );
        } else if (!object(parent) || !Object.hasOwn(parent, token))
          throw new CliError(
            `Path '${input.path}' does not exist.`,
            1,
            "NOT_FOUND",
          );
        value = (parent as Record<string, unknown>)[token];
        if (index === tokens.length - 1)
          return {
            parent: parent as Record<string, unknown> | unknown[],
            key: token,
            value,
          };
      }
      throw new CliError("Invalid path.", 2, "INVALID_INPUT");
    };
    const before = get(target.content),
      after = get(source.content);
    const isBlock = (v: unknown) =>
      object(v) &&
      typeof v.component === "string" &&
      typeof v._uid === "string" &&
      !!v._uid;
    const blockSelection =
      Array.isArray(after.parent) &&
      Array.isArray(before.parent) &&
      isBlock(after.value) &&
      isBlock(before.value);
    const fieldSelection =
      object(after.parent) &&
      object(before.parent) &&
      isBlock(after.parent) &&
      isBlock(before.parent) &&
      after.parent.component === before.parent.component;
    if (!blockSelection && !fieldSelection)
      throw new CliError(
        "The path must select a block or a field on matching component types.",
        1,
        "CONFLICT",
      );
    const result: SyncPathReport = {
      apiVersion: "unblok/story-sync-path-v1",
      status: isDeepStrictEqual(before.value, after.value)
        ? "unchanged"
        : "planned",
      source: { id: source.id, fullSlug: source.full_slug },
      target: { id: target.id, fullSlug: target.full_slug },
      path: input.path,
      before: structuredClone(before.value),
      after: structuredClone(after.value),
    };
    if (result.status === "unchanged") return result;
    const content = structuredClone(target.content);
    const destination = get(content);
    (destination.parent as Record<string, unknown>)[destination.key] =
      structuredClone(after.value);
    const ids = new Set<string>();
    const check = (value: unknown): void => {
      if (Array.isArray(value)) {
        value.forEach(check);
        return;
      }
      if (!object(value)) return;
      if (typeof value.component === "string") {
        if (
          typeof value._uid !== "string" ||
          !value._uid ||
          ids.has(value._uid)
        )
          throw new CliError(
            "The resulting story contains missing or duplicate block UIDs.",
            1,
            "CONFLICT",
          );
        ids.add(value._uid);
      }
      Object.values(value).forEach(check);
    };
    check(content);
    if (!input.apply) return result;
    const latestSource = await gateway.getStory(input.spaceId, source.id),
      latestTarget = await gateway.getStory(input.spaceId, target.id);
    if (
      !latestSource ||
      !latestTarget ||
      latestSource.id !== source.id ||
      latestTarget.id !== target.id ||
      latestSource.full_slug !== source.full_slug ||
      latestTarget.full_slug !== target.full_slug ||
      !isDeepStrictEqual(latestSource.content, source.content) ||
      !isDeepStrictEqual(latestTarget.content, target.content)
    )
      throw new CliError(
        "Source or target changed during planning; no update was sent.",
        1,
        "CONFLICT",
      );
    const saved = await gateway.updateStoryContent(
      input.spaceId,
      target.id,
      content,
    );
    let confirmed = false;
    if (
      saved &&
      saved.id === target.id &&
      saved.full_slug === target.full_slug &&
      object(saved.content)
    ) {
      try {
        confirmed = isDeepStrictEqual(get(saved.content).value, after.value);
      } catch {
        confirmed = false;
      }
    }
    if (!confirmed)
      throw new CliError(
        "Storyblok did not confirm the update; inspect the target before retrying.",
        1,
        "CONFLICT",
      );
    return { ...result, status: "updated" };
  } catch (error) {
    throw toUnblokError(error);
  }
}
