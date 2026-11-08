import { expect, test } from "bun:test";
import { ClientError } from "@storyblok/management-api-client";
import {
  UnblokError,
  updateStoryBlock,
  ensureComponentField,
  assignStoryTags,
  planStoryTags,
  assignStoryWorkflow,
  planStoryWorkflow,
} from "./library.ts";
import type {
  StoryTagGateway,
  WorkflowStoryGateway,
  StoryBlockGateway,
  ComponentFieldGateway,
} from "./library.ts";

test("library story block update saves a draft and skips unchanged content", async () => {
  let content = {
    component: "page",
    body: [{ _uid: "hero", component: "hero", text: "Old" }],
  };
  let writes = 0;
  const gateway = {
    findStoryBySlug: async () => ({ id: 1 }),
    getStory: async () => ({ id: 1, full_slug: "home", content }),
    updateStoryContent: async (
      _space: number,
      _id: number,
      next: typeof content,
    ) => {
      writes++;
      content = next;
      return {};
    },
  } as unknown as StoryBlockGateway;
  const input = {
    spaceId: 42,
    story: "home",
    component: "hero",
    fields: { text: "New" },
  };
  expect((await updateStoryBlock(gateway, input)).status).toBe("updated");
  expect(content.body[0]?.text).toBe("New");
  expect((await updateStoryBlock(gateway, input)).status).toBe("unchanged");
  expect(writes).toBe(1);
  await expect(
    updateStoryBlock(gateway, { ...input, fields: { unknown: "x" } }),
  ).rejects.toMatchObject({ code: "INVALID_INPUT" });
  content.body.push({ _uid: "other", component: "hero", text: "Old" });
  await expect(updateStoryBlock(gateway, input)).rejects.toMatchObject({
    code: "AMBIGUOUS",
  });
  expect(writes).toBe(1);
});

test("library component field reconciliation creates and then skips a matching field", async () => {
  let schema: Record<string, Record<string, unknown>> = {};
  const component = () => ({ id: 1, name: "article", schema });
  const gateway = {
    listComponents: async () => [component()],
    getComponent: async () => component(),
    updateComponent: async (
      _space: number,
      _id: number,
      update: { schema: typeof schema },
    ) => {
      schema = update.schema;
      return component();
    },
  } as unknown as ComponentFieldGateway;
  const input = {
    spaceId: 42,
    component: "article",
    field: "seo",
    type: "custom",
    field_type: "sb-ai-seo",
    tab: "SEO",
  };
  expect((await ensureComponentField(gateway, input)).status).toBe("created");
  expect(schema.seo?.field_type).toBe("sb-ai-seo");
  expect((await ensureComponentField(gateway, input)).status).toBe("unchanged");
  await expect(
    ensureComponentField(gateway, { ...input, field_type: "" }),
  ).rejects.toMatchObject({ code: "INVALID_INPUT" });
  await expect(
    ensureComponentField(gateway, {
      spaceId: 42,
      component: "article",
      field: "seo",
      type: "text",
    }),
  ).rejects.toMatchObject({ code: "CONFLICT" });
});

test("public tag API previews, merges tags, and reports failures and repeat runs", async () => {
  const tags = new Map([
    [1, ["Existing"]],
    [2, [] as string[]],
  ]);
  const writes: number[] = [];
  const gateway = {
    findStoryBySlug: async (_space: number, slug: string) => {
      const id = slug === "home" ? 1 : 2;
      return { id, full_slug: slug, tag_list: tags.get(id) };
    },
    getStory: async (_space: number, id: number) => ({
      id,
      full_slug: id === 1 ? "home" : "about",
      tag_list: tags.get(id),
    }),
    updateStoryTags: async (_space: number, id: number, next: string[]) => {
      writes.push(id);
      if (id === 2)
        throw new ClientError("Forbidden", {
          status: 403,
          statusText: "Forbidden",
          data: { secret: "not for output" },
        });
      tags.set(id, next);
    },
  } as unknown as StoryTagGateway;
  const input = {
    spaceId: 42,
    stories: ["home", "about", "home"],
    tags: ["News", "News"],
  };
  expect((await planStoryTags(gateway, input)).operations).toHaveLength(2);
  expect(writes).toEqual([]);
  const result = await assignStoryTags(gateway, input);
  expect(result.summary).toEqual({ updated: 1, unchanged: 0, failed: 1 });
  expect(tags.get(1)).toEqual(["Existing", "News"]);
  expect(result.operations.find((item) => item.storyId === 2)?.error).toEqual({
    code: "PERMISSION_DENIED",
    message: "Storyblok API request failed (HTTP 403).",
    status: 403,
  });
  writes.length = 0;
  expect((await assignStoryTags(gateway, input)).summary).toEqual({
    updated: 0,
    unchanged: 1,
    failed: 1,
  });
  expect(writes).toEqual([2]);
});

test("public tag API rejects invalid or missing selections before writing", async () => {
  let writes = 0;
  const gateway = {
    findStoryBySlug: async () => undefined,
    updateStoryTags: async () => {
      writes++;
    },
  } as unknown as StoryTagGateway;
  await expect(
    assignStoryTags(gateway, { spaceId: 42, stories: [], tags: ["News"] }),
  ).rejects.toThrow("at least one exact");
  await expect(
    assignStoryTags(gateway, { spaceId: 42, stories: ["home"], tags: [] }),
  ).rejects.toThrow("at least one nonempty tag");
  await expect(
    assignStoryTags(gateway, {
      spaceId: 42,
      stories: ["home"],
      tags: ["News"],
    }),
  ).rejects.toThrow("Stories not found");
  expect(writes).toBe(0);
});

test("public workflow API plans and reports partial assignments for exact slugs", async () => {
  const writes: number[] = [];
  const gateway = {
    findStoryBySlug: async (_space: number, slug: string) => ({
      id: slug === "home" ? 1 : 2,
      full_slug: slug,
      is_folder: false,
    }),
    listStories: async () => [
      { id: 1, name: "Home", full_slug: "home", stage: null },
      { id: 2, name: "About", full_slug: "about", stage: null },
    ],
    listWorkflows: async () => [{ id: 5, name: "Editorial" }],
    listWorkflowStages: async () => [{ id: 8, name: "Review", workflow_id: 5 }],
    getWorkflowStage: async () => ({ id: 8, name: "Review", workflow_id: 5 }),
    assignWorkflowStage: async (_space: number, input: { storyId: number }) => {
      writes.push(input.storyId);
      if (input.storyId === 2)
        throw new ClientError("rate limited", {
          status: 429,
          statusText: "Too Many Requests",
          data: null,
        });
      return {};
    },
  } as unknown as WorkflowStoryGateway;
  const input = {
    spaceId: 42,
    workflow: "Editorial",
    stage: "Review",
    stories: ["home", "about", "home"],
  };
  const plan = await planStoryWorkflow(gateway, input);
  expect(plan.summary.changes).toBe(2);
  expect(writes).toEqual([]);
  const report = await assignStoryWorkflow(gateway, input);
  expect(report.summary).toEqual({ assigned: 1, unchanged: 0, failed: 1 });
  expect(
    report.operations.find((item) => item.storyId === 2)?.error?.code,
  ).toBe("RATE_LIMITED");
  expect(writes.sort()).toEqual([1, 2]);
});

test("library errors have stable codes and retain their cause", async () => {
  const original = new ClientError("raw", {
    status: 403,
    statusText: "Forbidden",
    data: null,
  });
  const gateway = {
    findStoryBySlug: async () => {
      throw original;
    },
  } as unknown as StoryTagGateway;
  try {
    await planStoryTags(gateway, {
      spaceId: 42,
      stories: ["home"],
      tags: ["News"],
    });
    throw new Error("Expected failure");
  } catch (error) {
    expect(error).toBeInstanceOf(UnblokError);
    expect((error as UnblokError).code).toBe("PERMISSION_DENIED");
    expect((error as UnblokError).cause).toBe(original);
  }
  const invalid = await assignStoryTags(gateway, {
    spaceId: 42,
    stories: [],
    tags: ["News"],
  }).catch((error: UnblokError) => error);
  expect(invalid).toBeInstanceOf(UnblokError);
  expect((invalid as UnblokError).code).toBe("INVALID_INPUT");
});

test("public workflow API rejects an empty or missing selection before assignment", async () => {
  let writes = 0;
  const gateway = {
    findStoryBySlug: async () => undefined,
    assignWorkflowStage: async () => {
      writes++;
    },
  } as unknown as WorkflowStoryGateway;
  await expect(
    assignStoryWorkflow(gateway, { spaceId: 42, stage: "Review", stories: [] }),
  ).rejects.toThrow("at least one");
  await expect(
    assignStoryWorkflow(gateway, {
      spaceId: 42,
      stage: "Review",
      stories: ["missing"],
    }),
  ).rejects.toThrow("not found");
  expect(writes).toBe(0);
});
