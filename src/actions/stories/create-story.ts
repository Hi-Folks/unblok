import { CliError } from "../../errors.ts";
import type { StoryblokGateway } from "../../storyblok/gateway.ts";
import { toUnblokError } from "../action-error.ts";

export type StoryCreateGateway = Pick<
  StoryblokGateway,
  "findStoryBySlug" | "createStory"
>;
export interface EnsureStoryCreatedInput {
  spaceId: number;
  name: string;
  slug: string;
  content: Record<string, unknown>;
}
export interface EnsureStoryCreatedResult {
  status: "created" | "unchanged";
}

function addComponentIds(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(addComponentIds);
  if (typeof value !== "object" || value === null) return value;
  const item = value as Record<string, unknown>;
  const result = Object.fromEntries(
    Object.entries(item).map(([key, child]) => [key, addComponentIds(child)]),
  );
  if (typeof item.component === "string" && !item._uid)
    result._uid = crypto.randomUUID();
  return result;
}

/** Shared creation logic; the optional resolver is used by YAML asset references. */
export async function createStoryIfMissing(
  gateway: StoryCreateGateway,
  input: EnsureStoryCreatedInput,
  resolveContent: (
    content: Record<string, unknown>,
  ) => Promise<Record<string, unknown>> = async (content) => content,
): Promise<EnsureStoryCreatedResult> {
  if (await gateway.findStoryBySlug(input.spaceId, input.slug))
    return { status: "unchanged" };
  const content = await resolveContent(input.content);
  await gateway.createStory(input.spaceId, {
    name: input.name,
    slug: input.slug,
    content: addComponentIds(content) as Record<string, unknown>,
  });
  return { status: "created" };
}

/** Create a root-level draft story unless a story with that slug already exists. */
export async function ensureStoryCreated(
  gateway: StoryCreateGateway,
  input: EnsureStoryCreatedInput,
): Promise<EnsureStoryCreatedResult> {
  try {
    if (
      !input ||
      !Number.isSafeInteger(input.spaceId) ||
      input.spaceId <= 0 ||
      typeof input.name !== "string" ||
      !input.name.trim() ||
      typeof input.slug !== "string" ||
      !input.slug.trim() ||
      /[/*,]/.test(input.slug) ||
      !input.content ||
      typeof input.content !== "object" ||
      Array.isArray(input.content) ||
      typeof input.content.component !== "string" ||
      !input.content.component.trim()
    )
      throw new CliError(
        "Provide a positive spaceId, name, root-level slug, and content with a component.",
        1,
        "INVALID_INPUT",
      );
    return await createStoryIfMissing(gateway, {
      ...input,
      name: input.name.trim(),
      slug: input.slug.trim(),
    });
  } catch (error) {
    throw toUnblokError(error);
  }
}
