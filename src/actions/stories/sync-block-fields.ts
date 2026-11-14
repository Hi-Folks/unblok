import { isDeepStrictEqual } from "node:util";
import { CliError } from "../../errors.ts";
import type { StoryblokGateway } from "../../storyblok/gateway.ts";
import { toUnblokError } from "../action-error.ts";
import { isValidStoryCreationSlug } from "./create-story.ts";

export type SyncBlockGateway = Pick<
  StoryblokGateway,
  "findStoryBySlug" | "getStory" | "listComponents" | "updateStoryContent"
>;
export interface SyncBlockInput {
  spaceId: number;
  source: string;
  target: string;
  component: string;
  fields: readonly string[];
  sourceUid?: string;
  targetUid?: string;
  apply?: boolean;
}
export interface SyncBlockReport {
  status: "planned" | "updated" | "unchanged";
  source: { id: number; fullSlug: string; blockUid: string };
  target: { id: number; fullSlug: string; blockUid: string };
  component: string;
  changes: Array<{ field: string; before: unknown; after: unknown }>;
}

const object = (v: unknown): v is Record<string, unknown> =>
  !!v && typeof v === "object" && !Array.isArray(v);
const forbidden = new Set([
  "_uid",
  "component",
  "__proto__",
  "prototype",
  "constructor",
]);
export async function syncBlockFields(
  gateway: SyncBlockGateway,
  input: SyncBlockInput,
): Promise<SyncBlockReport> {
  try {
    const ref = (v: unknown): v is string =>
      typeof v === "string" &&
      v === v.trim() &&
      isValidStoryCreationSlug(v) &&
      (!/^\d+$/.test(v) || (Number.isSafeInteger(Number(v)) && Number(v) > 0));
    const text = (v: unknown): v is string =>
      typeof v === "string" && !!v.trim() && v === v.trim();
    if (
      !input ||
      !Number.isSafeInteger(input.spaceId) ||
      input.spaceId <= 0 ||
      !ref(input.source) ||
      !ref(input.target) ||
      !text(input.component) ||
      !Array.isArray(input.fields) ||
      !input.fields.length ||
      input.fields.some((field) => !text(field) || forbidden.has(field)) ||
      new Set(input.fields).size !== input.fields.length ||
      (input.sourceUid !== undefined && !text(input.sourceUid)) ||
      (input.targetUid !== undefined && !text(input.targetUid)) ||
      (input.apply !== undefined && typeof input.apply !== "boolean")
    )
      throw new CliError(
        "Provide valid story references, a component, and unique non-reserved fields.",
        2,
        "INVALID_INPUT",
      );
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
      if (!Number.isSafeInteger(id) || id <= 0)
        throw new CliError(
          "Story lookup returned an invalid ID.",
          1,
          "CONFLICT",
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
    const schemas = (await gateway.listComponents(input.spaceId)).filter(
      (item) => item.name === input.component,
    );
    if (schemas.length !== 1 || !object(schemas[0]?.schema))
      throw new CliError(
        `Component schema '${input.component}' is missing or ambiguous.`,
        1,
        schemas.length > 1 ? "AMBIGUOUS" : "NOT_FOUND",
      );
    for (const field of input.fields)
      if (
        !Object.hasOwn(schemas[0]!.schema, field) ||
        !object(schemas[0]!.schema[field])
      )
        throw new CliError(
          `Field '${field}' is not in the component schema.`,
          1,
          "NOT_FOUND",
        );
    const select = (
      content: unknown,
      uid: string | undefined,
      label: string,
    ) => {
      const matches: Record<string, unknown>[] = [];
      const visit = (value: unknown): void => {
        if (Array.isArray(value)) {
          value.forEach(visit);
          return;
        }
        if (!object(value)) return;
        if (
          value.component === input.component &&
          (uid === undefined || value._uid === uid)
        )
          matches.push(value);
        Object.values(value).forEach(visit);
      };
      visit(content);
      if (matches.length !== 1)
        throw new CliError(
          `${label} requires exactly one matching '${input.component}' block; found ${matches.length}. Specify a block UID when needed.`,
          1,
          matches.length ? "AMBIGUOUS" : "NOT_FOUND",
        );
      const block = matches[0]!;
      if (!text(block._uid))
        throw new CliError(`${label} block has no valid UID.`, 1, "CONFLICT");
      return block;
    };
    const sourceBlock = select(source.content, input.sourceUid, "Source"),
      targetBlock = select(target.content, input.targetUid, "Target");
    const changes = input.fields.flatMap((field) => {
      if (
        !Object.hasOwn(sourceBlock, field) ||
        !Object.hasOwn(targetBlock, field)
      )
        throw new CliError(
          `Field '${field}' is missing from the source or target block.`,
          1,
          "NOT_FOUND",
        );
      return isDeepStrictEqual(sourceBlock[field], targetBlock[field])
        ? []
        : [
            {
              field,
              before: structuredClone(targetBlock[field]),
              after: structuredClone(sourceBlock[field]),
            },
          ];
    });
    const result: SyncBlockReport = {
      status: changes.length ? "planned" : "unchanged",
      source: {
        id: source.id,
        fullSlug: source.full_slug,
        blockUid: sourceBlock._uid as string,
      },
      target: {
        id: target.id,
        fullSlug: target.full_slug,
        blockUid: targetBlock._uid as string,
      },
      component: input.component,
      changes,
    };
    if (!changes.length) return result;
    const content = structuredClone(target.content);
    const block = select(content, targetBlock._uid as string, "Target");
    for (const change of changes)
      block[change.field] = structuredClone(change.after);
    const ids = new Set<string>();
    const validateIds = (value: unknown): void => {
      if (Array.isArray(value)) {
        value.forEach(validateIds);
        return;
      }
      if (!object(value)) return;
      if (
        typeof value.component === "string" &&
        typeof value._uid === "string"
      ) {
        if (ids.has(value._uid))
          throw new CliError(
            "The update would create duplicate block UIDs in the target story.",
            1,
            "CONFLICT",
          );
        ids.add(value._uid);
      }
      Object.values(value).forEach(validateIds);
    };
    validateIds(content);
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
        "Source or target changed during planning; no update was sent. Re-run the operation.",
        1,
        "CONFLICT",
      );
    const saved = await gateway.updateStoryContent(
      input.spaceId,
      target.id,
      content,
    );
    if (
      !saved ||
      saved.id !== target.id ||
      saved.full_slug !== target.full_slug ||
      !object(saved.content)
    )
      throw new CliError(
        "Storyblok did not confirm the updated target; inspect it before retrying.",
        1,
        "CONFLICT",
      );
    const savedBlock = select(
      saved.content,
      targetBlock._uid as string,
      "Saved target",
    );
    if (
      changes.some(
        (change) =>
          !Object.hasOwn(savedBlock, change.field) ||
          !isDeepStrictEqual(savedBlock[change.field], change.after),
      )
    )
      throw new CliError(
        "Storyblok did not confirm the selected field values; inspect the target before retrying.",
        1,
        "CONFLICT",
      );
    return { ...result, status: "updated" };
  } catch (error) {
    throw toUnblokError(error);
  }
}
