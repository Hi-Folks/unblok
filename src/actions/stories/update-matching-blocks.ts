import { isDeepStrictEqual } from "node:util";
import { CliError } from "../../errors.ts";
import type { StoryblokGateway } from "../../storyblok/gateway.ts";
import { toUnblokError } from "../action-error.ts";
import { isValidStoryCreationSlug } from "./create-story.ts";

export type UpdateMatchingBlocksGateway = Pick<
  StoryblokGateway,
  "findStoryBySlug" | "getStory" | "listComponents" | "updateStoryContent"
>;
export interface UpdateMatchingBlocksInput {
  spaceId: number;
  story: string;
  component: string;
  where: { field: string; equals: unknown };
  fields: Record<string, unknown>;
  apply?: boolean;
}
export interface UpdateMatchingBlocksReport {
  status: "planned" | "updated" | "unchanged" | "no_matches";
  story: { id: number; fullSlug: string };
  component: string;
  matched: number;
  blocks: Array<{
    uid: string;
    path: string;
    changes: Array<{ field: string; before: unknown; after: unknown }>;
  }>;
}
const object = (value: unknown): value is Record<string, unknown> =>
  value !== null && typeof value === "object" && !Array.isArray(value);
const reserved = new Set([
  "_uid",
  "component",
  "__proto__",
  "constructor",
  "prototype",
]);

/** Select matching component blocks and update selected complete field values. */
export async function updateMatchingBlocks(
  gateway: UpdateMatchingBlocksGateway,
  input: UpdateMatchingBlocksInput,
): Promise<UpdateMatchingBlocksReport> {
  try {
    const text = (value: unknown): value is string =>
      typeof value === "string" && !!value.trim() && value === value.trim();
    if (
      !input ||
      !Number.isSafeInteger(input.spaceId) ||
      input.spaceId <= 0 ||
      !text(input.story) ||
      !isValidStoryCreationSlug(input.story) ||
      (/^\d+$/.test(input.story) &&
        (!Number.isSafeInteger(Number(input.story)) ||
          Number(input.story) <= 0)) ||
      !text(input.component) ||
      !object(input.where) ||
      Object.keys(input.where).some(
        (key) => !["field", "equals"].includes(key),
      ) ||
      !text(input.where.field) ||
      reserved.has(input.where.field) ||
      !Object.hasOwn(input.where, "equals") ||
      input.where.equals === undefined ||
      !object(input.fields) ||
      !Object.keys(input.fields).length ||
      Object.keys(input.fields).some(
        (key) =>
          !text(key) || reserved.has(key) || input.fields[key] === undefined,
      ) ||
      (input.apply !== undefined && typeof input.apply !== "boolean")
    )
      throw new CliError(
        "Provide a story, component, equality condition, and nonempty non-reserved fields.",
        2,
        "INVALID_INPUT",
      );
    const numeric = /^\d+$/.test(input.story);
    const id = numeric
      ? Number(input.story)
      : (await gateway.findStoryBySlug(input.spaceId, input.story))?.id;
    if (!id)
      throw new CliError(
        `Story '${input.story}' was not found.`,
        1,
        "NOT_FOUND",
      );
    if (!Number.isSafeInteger(id) || id <= 0)
      throw new CliError("Story ID could not be verified.", 1, "CONFLICT");
    const story = await gateway.getStory(input.spaceId, id);
    if (
      !story ||
      story.id !== id ||
      story.is_folder ||
      !story.full_slug ||
      (!numeric && story.full_slug !== input.story) ||
      !object(story.content)
    )
      throw new CliError(
        "Story identity or content could not be verified.",
        1,
        "CONFLICT",
      );
    const schemas = (await gateway.listComponents(input.spaceId)).filter(
      (component) => component.name === input.component,
    );
    if (schemas.length !== 1 || !object(schemas[0]?.schema))
      throw new CliError(
        `Component schema '${input.component}' is missing or ambiguous.`,
        1,
        schemas.length > 1 ? "AMBIGUOUS" : "NOT_FOUND",
      );
    for (const field of [input.where.field, ...Object.keys(input.fields)])
      if (
        !Object.hasOwn(schemas[0]!.schema, field) ||
        !object(schemas[0]!.schema[field])
      )
        throw new CliError(
          `Field '${field}' is not in the component schema.`,
          1,
          "NOT_FOUND",
        );
    for (const [field, value] of Object.entries(input.fields)) {
      const type = (schemas[0]!.schema[field] as { type?: unknown }).type;
      if (type === "bloks")
        throw new CliError(
          `Field '${field}' contains blocks; replacing nested blocks is not supported.`,
          2,
          "INVALID_INPUT",
        );
      const expected = ["text", "textarea", "markdown"].includes(String(type))
        ? "string"
        : type === "boolean"
          ? "boolean"
          : type === "number"
            ? "number"
            : undefined;
      if (expected && typeof value !== expected)
        throw new CliError(
          `Field '${field}' requires a ${expected} value according to its schema.`,
          2,
          "INVALID_INPUT",
        );
    }
    const containsBlock = (value: unknown): boolean =>
      Array.isArray(value)
        ? value.some(containsBlock)
        : object(value) &&
          (typeof value.component === "string" ||
            Object.values(value).some(containsBlock));
    if (Object.values(input.fields).some(containsBlock))
      throw new CliError(
        "Replacing nested component blocks is not supported by this operation.",
        2,
        "INVALID_INPUT",
      );
    const content = structuredClone(story.content);
    const blocks: UpdateMatchingBlocksReport["blocks"] = [],
      ids = new Set<string>();
    const visit = (value: unknown, path: string): void => {
      if (Array.isArray(value)) {
        value.forEach((item, index) => visit(item, `${path}/${index}`));
        return;
      }
      if (!object(value)) return;
      if (
        value.component === input.component &&
        Object.hasOwn(value, input.where.field) &&
        isDeepStrictEqual(value[input.where.field], input.where.equals)
      ) {
        if (!text(value._uid) || ids.has(value._uid))
          throw new CliError(
            "Matched blocks have missing or duplicate UIDs.",
            1,
            "CONFLICT",
          );
        ids.add(value._uid);
        const changes = Object.entries(input.fields).flatMap(
          ([field, after]) => {
            if (!Object.hasOwn(value, field))
              throw new CliError(
                `Field '${field}' is missing in a matched block.`,
                1,
                "NOT_FOUND",
              );
            if (containsBlock(value[field]))
              throw new CliError(
                "Replacing nested component blocks is not supported by this operation.",
                2,
                "INVALID_INPUT",
              );
            return isDeepStrictEqual(value[field], after)
              ? []
              : [
                  {
                    field,
                    before: structuredClone(value[field]),
                    after: structuredClone(after),
                  },
                ];
          },
        );
        blocks.push({ uid: value._uid, path, changes });
        for (const change of changes)
          value[change.field] = structuredClone(change.after);
      }
      for (const [key, child] of Object.entries(value))
        visit(
          child,
          `${path}/${key.replaceAll("~", "~0").replaceAll("/", "~1")}`,
        );
    };
    visit(content, "");
    const hasChanges = blocks.some((block) => block.changes.length);
    const result: UpdateMatchingBlocksReport = {
      status: !blocks.length
        ? "no_matches"
        : hasChanges
          ? "planned"
          : "unchanged",
      story: { id, fullSlug: story.full_slug },
      component: input.component,
      matched: blocks.length,
      blocks,
    };
    if (!input.apply || !hasChanges) return result;
    const latest = await gateway.getStory(input.spaceId, id);
    if (
      !latest ||
      latest.id !== id ||
      latest.full_slug !== story.full_slug ||
      !isDeepStrictEqual(latest.content, story.content)
    )
      throw new CliError(
        "Story changed during planning; no update was sent. Re-run the operation.",
        1,
        "CONFLICT",
      );
    const saved = await gateway.updateStoryContent(input.spaceId, id, content);
    if (
      !saved ||
      saved.id !== id ||
      saved.full_slug !== story.full_slug ||
      !isDeepStrictEqual(saved.content, content)
    )
      throw new CliError(
        "Storyblok did not confirm the updated content; inspect the story before retrying.",
        1,
        "CONFLICT",
      );
    return { ...result, status: "updated" };
  } catch (error) {
    throw toUnblokError(error);
  }
}
