import { expect, test } from "bun:test";
import {
  applySupportedBlueprint,
  compileSupportedBlueprint,
} from "./blueprint-apply.ts";
import { loadBlueprint } from "./blueprint-loader.ts";
import { resolveBlueprint } from "./blueprint-validation.ts";

test("loads the example and reports a failed language and remaining work", async () => {
  const blueprint = compileSupportedBlueprint(
    resolveBlueprint(
      await loadBlueprint("examples/features/setup-ai-translation-story.yaml"),
    ),
  );
  const gateway = {
    getStory: async () => ({
      id: 123456,
      content: { component: "default-page", title: "Hello" },
    }),
    aiTranslateStory: async () => {
      throw new Error("translation unavailable");
    },
  };
  const report = await applySupportedBlueprint(gateway as never, 42, blueprint);
  expect(report.operations).toMatchObject([
    { operation: "ai-translate-story", key: "123456/de", status: "failed" },
    { operation: "ai-translate-story", key: "123456/fr", status: "not_run" },
  ]);
});

test("all languages resolves at apply time and reports each language", async () => {
  const blueprint = compileSupportedBlueprint(
    resolveBlueprint({
      version: 1,
      stories: { ai_translate: [{ story_id: 7, all_languages: true }] },
    }),
  );
  const gateway = {
    listLanguages: async () => [
      { code: "de", name: "German", aiTranslationCode: "de" },
    ],
    getStory: async () => ({ id: 7, content: { component: "default-page" } }),
    aiTranslateStory: async () => ({
      id: 7,
      content: { component: "default-page" },
    }),
  };
  const report = await applySupportedBlueprint(gateway as never, 42, blueprint);
  expect(report.operations).toMatchObject([
    {
      operation: "ai-translate-story",
      key: "7/all",
      status: "unchanged",
      reason: "de: unchanged",
    },
  ]);
});

test("queues every declared language without waiting", async () => {
  const blueprint = compileSupportedBlueprint(
    resolveBlueprint({
      version: 1,
      stories: {
        ai_translate: [
          {
            story_id: 7,
            languages: [
              { lang: "de", code: "de" },
              { lang: "fr", code: "fr" },
            ],
          },
        ],
      },
    }),
  );
  let requests = 0;
  const gateway = {
    getStory: async () => ({ id: 7, content: { component: "default-page" } }),
    aiTranslateStory: async () => {
      requests++;
      return { backgroundTaskId: 123 };
    },
  };
  const report = await applySupportedBlueprint(gateway as never, 42, blueprint);
  expect(report.failed).toBe(false);
  expect(report.operations).toMatchObject([
    { operation: "ai-translate-story", key: "7/de", status: "queued" },
    { operation: "ai-translate-story", key: "7/fr", status: "queued" },
  ]);
  expect(requests).toBe(2);
});

test("YAML assigns the queued language to the review stage", async () => {
  const blueprint = compileSupportedBlueprint(
    resolveBlueprint({
      version: 1,
      stories: {
        ai_translate: [
          {
            story_id: 7,
            all_languages: true,
            review_stage: "Review translation",
            workflow: "Default",
          },
        ],
      },
    }),
  );
  const assignments: unknown[] = [];
  const gateway = {
    listLanguages: async () => [
      { name: "Spanish", code: "es", aiTranslationCode: "es" },
    ],
    listWorkflows: async () => [
      { id: 5, name: "Default", per_language_stages: true },
    ],
    listWorkflowStages: async () => [
      { id: 8, name: "Review translation", workflow_id: 5 },
    ],
    getWorkflowStage: async () => ({}),
    updateWorkflow: async () => {},
    assignWorkflowStage: async (_space: number, assignment: unknown) => {
      assignments.push(assignment);
    },
    getStory: async () => ({
      id: 7,
      content: { component: "default-page" },
      stages: [],
    }),
    aiTranslateStory: async () => ({ backgroundTaskId: 123 }),
    updateStoryContent: async () => {},
  };
  const report = await applySupportedBlueprint(gateway as never, 42, blueprint);
  expect(report.failed).toBe(false);
  expect(report.operations).toMatchObject([
    {
      operation: "ai-translate-story",
      status: "queued",
      reason: expect.stringContaining("review assigned"),
    },
  ]);
  expect(assignments).toEqual([{ storyId: 7, stageId: 8, language: "es" }]);
});

test("resolves a story slug in the target space before queuing translation", async () => {
  const blueprint = compileSupportedBlueprint(
    resolveBlueprint({
      version: 1,
      stories: {
        ai_translate: [
          { story_slug: "home", languages: [{ lang: "it", code: "it" }] },
        ],
      },
    }),
  );
  const calls: unknown[] = [];
  const gateway = {
    findStoryBySlug: async (space: number, slug: string) => {
      calls.push([space, slug]);
      return { id: 999, full_slug: "home", is_folder: false };
    },
    getStory: async (_space: number, id: number) => ({
      id,
      content: { component: "default-page" },
    }),
    aiTranslateStory: async (_space: number, id: number) => {
      calls.push(id);
      return { backgroundTaskId: 123 };
    },
  };
  const report = await applySupportedBlueprint(gateway as never, 42, blueprint);
  expect(report.failed).toBe(false);
  expect(report.operations).toMatchObject([
    { operation: "ai-translate-story", key: "home/it", status: "queued" },
  ]);
  expect(calls).toEqual([[42, "home"], 999]);
});

test("fails safely for missing or unverifiable story slugs", async () => {
  const blueprint = compileSupportedBlueprint(
    resolveBlueprint({
      version: 1,
      stories: {
        ai_translate: [
          {
            story_slug: "home",
            languages: [
              { lang: "it", code: "it" },
              { lang: "de", code: "de" },
            ],
          },
        ],
      },
    }),
  );
  for (const story of [
    undefined,
    { id: 7, full_slug: "other" },
    { id: 7, full_slug: "home", is_folder: true },
  ]) {
    let writes = 0;
    const report = await applySupportedBlueprint(
      {
        findStoryBySlug: async () => story,
        aiTranslateStory: async () => {
          writes++;
        },
      } as never,
      42,
      blueprint,
    );
    expect(report.operations).toMatchObject([
      { operation: "ai-translate-story", key: "home/it", status: "failed" },
      { operation: "ai-translate-story", key: "home/de", status: "not_run" },
    ]);
    expect(writes).toBe(0);
  }
});

test("rejects missing or conflicting story selectors", () => {
  for (const selector of [
    {},
    { story_id: 7, story_slug: "home" },
    { story_slug: "/home" },
  ]) {
    const blueprint = {
      version: 1,
      stories: {
        ai_translate: [
          { ...selector, languages: [{ lang: "it", code: "it" }] },
        ],
      },
    };
    expect(() => resolveBlueprint(blueprint)).toThrow();
    expect(() => compileSupportedBlueprint(blueprint)).toThrow();
  }
});
