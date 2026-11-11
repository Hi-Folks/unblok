import { isDeepStrictEqual } from "node:util";
import { CliError } from "../../errors.ts";
import type {
  StoryblokGateway,
  StoryblokStoryVersion,
} from "../../storyblok/gateway.ts";
import { toUnblokError } from "../action-error.ts";

export type StoryVersionsGateway = Pick<
  StoryblokGateway,
  "findStoryBySlug" | "getStory" | "listStoryVersions"
>;
export interface ListStoryVersionsInput {
  spaceId: number;
  story: string;
  limit?: number;
}
export interface CompareStoryVersionsInput {
  spaceId: number;
  story: string;
  from: number;
  to: number;
}
export interface StoryVersionChange {
  path: string;
  type: "added" | "removed" | "changed";
  before?: unknown;
  after?: unknown;
}

function validateReference(spaceId: number, reference: string): void {
  if (
    !Number.isSafeInteger(spaceId) ||
    spaceId <= 0 ||
    typeof reference !== "string" ||
    !reference.trim() ||
    reference !== reference.trim() ||
    /[*,]/.test(reference) ||
    (/^\d+$/.test(reference) &&
      (!Number.isSafeInteger(Number(reference)) || Number(reference) <= 0))
  )
    throw new CliError(
      "Provide a positive spaceId and an exact story ID or slug.",
      1,
      "INVALID_INPUT",
    );
}
async function resolveStoryData(
  gateway: StoryVersionsGateway,
  spaceId: number,
  reference: string,
): Promise<{ identity: { id: number; fullSlug: string }; content: unknown }> {
  const isId = /^\d+$/.test(reference);
  const found = isId
    ? undefined
    : await gateway.findStoryBySlug(spaceId, reference);
  if (!isId && !found)
    throw new CliError(`Story '${reference}' was not found.`, 1, "NOT_FOUND");
  const id = isId ? Number(reference) : found?.id;
  if (!Number.isSafeInteger(id) || !id || id <= 0)
    throw new CliError(
      "The story lookup returned an invalid ID.",
      1,
      "CONFLICT",
    );
  const story = await gateway.getStory(spaceId, id);
  if (
    !story ||
    story.id !== id ||
    story.is_folder ||
    !story.full_slug ||
    (!isId && story.full_slug !== reference)
  )
    throw new CliError("Story identity could not be verified.", 1, "CONFLICT");
  return {
    identity: { id, fullSlug: story.full_slug },
    content: story.content,
  };
}

export async function listStoryVersions(
  gateway: StoryVersionsGateway,
  input: ListStoryVersionsInput,
): Promise<{
  apiVersion: "unblok/story-versions-v1";
  story: { id: number; fullSlug: string };
  versions: StoryblokStoryVersion[];
}> {
  try {
    if (!input)
      throw new CliError("Provide a story reference.", 1, "INVALID_INPUT");
    validateReference(input.spaceId, input.story);
    if (
      input.limit !== undefined &&
      (!Number.isSafeInteger(input.limit) || input.limit <= 0)
    )
      throw new CliError(
        "Provide a positive version limit.",
        1,
        "INVALID_INPUT",
      );
    const { identity: story } = await resolveStoryData(
      gateway,
      input.spaceId,
      input.story,
    );
    const versions = await gateway.listStoryVersions(input.spaceId, story.id, {
      limit: input.limit ?? 25,
    });
    return { apiVersion: "unblok/story-versions-v1", story, versions };
  } catch (error) {
    throw toUnblokError(error);
  }
}

function record(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
function escapePointer(key: string): string {
  return key.replaceAll("~", "~0").replaceAll("/", "~1");
}

function compareContent(before: unknown, after: unknown): StoryVersionChange[] {
  const changes: StoryVersionChange[] = [];
  const visit = (left: unknown, right: unknown, path: string): void => {
    if (isDeepStrictEqual(left, right)) return;
    if (Array.isArray(left) && Array.isArray(right)) {
      for (let i = 0; i < Math.max(left.length, right.length); i++) {
        const child = `${path}/${i}`;
        if (i >= left.length)
          changes.push({ path: child, type: "added", after: right[i] });
        else if (i >= right.length)
          changes.push({ path: child, type: "removed", before: left[i] });
        else visit(left[i], right[i], child);
      }
    } else if (record(left) && record(right)) {
      for (const key of [
        ...new Set([...Object.keys(left), ...Object.keys(right)]),
      ].sort()) {
        const child = `${path}/${escapePointer(key)}`;
        if (!Object.hasOwn(left, key))
          changes.push({ path: child, type: "added", after: right[key] });
        else if (!Object.hasOwn(right, key))
          changes.push({ path: child, type: "removed", before: left[key] });
        else visit(left[key], right[key], child);
      }
    } else changes.push({ path, type: "changed", before: left, after: right });
  };
  visit(before, after, "");
  return changes;
}

export async function compareStoryToPreviousVersion(
  gateway: StoryVersionsGateway,
  input: { spaceId: number; story: string },
): Promise<{
  apiVersion: "unblok/story-version-comparison-v1";
  story: { id: number; fullSlug: string };
  from: number;
  to: "current";
  selection: "previous_after_matching_latest" | "latest_before_current";
  changes: StoryVersionChange[];
}> {
  try {
    if (!input)
      throw new CliError("Provide a story reference.", 1, "INVALID_INPUT");
    validateReference(input.spaceId, input.story);
    const { identity: story, content } = await resolveStoryData(
      gateway,
      input.spaceId,
      input.story,
    );
    if (!record(content))
      throw new CliError(
        "Current story content is unavailable.",
        1,
        "CONFLICT",
      );
    const versions = await gateway.listStoryVersions(input.spaceId, story.id, {
      includeContent: true,
    });
    if (versions.some((version) => version.storyId !== story.id))
      throw new CliError(
        "A history version does not belong to the selected story.",
        1,
        "CONFLICT",
      );
    const candidates = versions.filter(
      (version) => version.releaseId === undefined || version.releaseId === 0,
    );
    const excluded = versions.length - candidates.length;
    if (!candidates.length)
      throw new CliError(
        `No saved story versions are available for comparison (history returned ${versions.length}; release-specific entries excluded: ${excluded}). Run 'unblok story versions --ref YOUR_STORY --space-id YOUR_SPACE_ID --json' to inspect the history.`,
        1,
        "NOT_FOUND",
      );
    const dated = candidates
      .map((version) => {
        const time =
          version.createdAt === undefined ? NaN : Date.parse(version.createdAt);
        if (!Number.isFinite(time))
          throw new CliError(
            "Cannot identify the previous version because a history timestamp is missing or invalid.",
            1,
            "CONFLICT",
          );
        return { version, time };
      })
      .sort((a, b) => b.time - a.time);
    if (dated.length > 1 && dated[0]?.time === dated[1]?.time)
      throw new CliError(
        "Cannot identify the newest saved version because history timestamps are tied.",
        1,
        "AMBIGUOUS",
      );
    const latest = dated[0]?.version;
    if (!latest || !record(latest.content))
      throw new CliError(
        "Content is unavailable for the latest saved version.",
        1,
        "CONFLICT",
      );
    const matchesLatest = isDeepStrictEqual(latest.content, content);
    if (matchesLatest && dated.length > 2 && dated[1]?.time === dated[2]?.time)
      throw new CliError(
        "Cannot identify the previous saved version because history timestamps are tied.",
        1,
        "AMBIGUOUS",
      );
    const previous = dated[matchesLatest ? 1 : 0]?.version;
    if (!previous)
      throw new CliError(
        `No previous saved story version is available for comparison (history returned ${versions.length}; release-specific entries excluded: ${excluded}; the latest eligible entry matches the current draft). Run 'unblok story versions --ref YOUR_STORY --space-id YOUR_SPACE_ID --json' to inspect the history.`,
        1,
        "NOT_FOUND",
      );
    if (!record(previous.content))
      throw new CliError(
        `Content is unavailable for version ${previous.id}.`,
        1,
        "CONFLICT",
      );
    return {
      apiVersion: "unblok/story-version-comparison-v1",
      story,
      from: previous.id,
      to: "current",
      selection: matchesLatest
        ? "previous_after_matching_latest"
        : "latest_before_current",
      changes: compareContent(previous.content, content),
    };
  } catch (error) {
    throw toUnblokError(error);
  }
}

export async function compareStoryVersions(
  gateway: StoryVersionsGateway,
  input: CompareStoryVersionsInput,
): Promise<{
  apiVersion: "unblok/story-version-comparison-v1";
  story: { id: number; fullSlug: string };
  from: number;
  to: number;
  changes: StoryVersionChange[];
}> {
  try {
    if (!input)
      throw new CliError(
        "Provide a story and two version IDs.",
        1,
        "INVALID_INPUT",
      );
    validateReference(input.spaceId, input.story);
    if (
      ![input.from, input.to].every((id) => Number.isSafeInteger(id) && id > 0)
    )
      throw new CliError(
        "Provide two positive version IDs.",
        1,
        "INVALID_INPUT",
      );
    const { identity: story } = await resolveStoryData(
      gateway,
      input.spaceId,
      input.story,
    );
    const versions = await gateway.listStoryVersions(input.spaceId, story.id, {
      includeContent: true,
    });
    const find = (id: number): StoryblokStoryVersion => {
      const matches = versions.filter(
        (version) => version.id === id && version.storyId === story.id,
      );
      if (!matches.length)
        throw new CliError(
          `Version ${id} was not found for this story.`,
          1,
          "NOT_FOUND",
        );
      if (matches.length !== 1)
        throw new CliError(`Version ${id} is ambiguous.`, 1, "AMBIGUOUS");
      const match = matches[0];
      if (!match || !record(match.content))
        throw new CliError(
          `Content is unavailable for version ${id}.`,
          1,
          "CONFLICT",
        );
      return match;
    };
    const before = find(input.from).content;
    const after = find(input.to).content;
    const changes = compareContent(before, after);
    return {
      apiVersion: "unblok/story-version-comparison-v1",
      story,
      from: input.from,
      to: input.to,
      changes,
    };
  } catch (error) {
    throw toUnblokError(error);
  }
}
