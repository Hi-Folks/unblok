import { expect, test } from "bun:test";
import { translateStoryWithAi } from "./ai-translate.ts";

test("saves languages sequentially, preserves prior translations, and reports retries", async () => {
  let content: Record<string, unknown> = {
    component: "default-page",
    title: "Hello",
  };
  const gateway = {
    getStory: async () => ({ id: 7, content: structuredClone(content) }),
    aiTranslateStory: async (
      _space: number,
      _id: number,
      input: { code: string; overwrite: boolean },
    ) => ({
      id: 7,
      content: {
        ...content,
        [`title__i18n__${input.code}`]:
          content[`title__i18n__${input.code}`] ?? `Translation ${input.code}`,
      },
    }),
    updateStoryContent: async (
      _space: number,
      _id: number,
      value: Record<string, unknown>,
    ) => {
      content = value;
      return { id: 7, content };
    },
  };
  const input = {
    spaceId: 42,
    storyId: 7,
    languages: [
      { lang: "de", code: "de" },
      { lang: "fr", code: "fr" },
    ],
  };
  const first = await translateStoryWithAi(gateway as never, input);
  expect(first.results.map((item) => item.status)).toEqual([
    "updated",
    "updated",
  ]);
  expect(content).toEqual({
    component: "default-page",
    title: "Hello",
    title__i18n__de: "Translation de",
    title__i18n__fr: "Translation fr",
  });
  const retry = await translateStoryWithAi(gateway as never, input);
  expect(retry.results.map((item) => item.status)).toEqual([
    "unchanged",
    "unchanged",
  ]);
});

test("reports failures and prevents unrelated or concurrent changes from being overwritten", async () => {
  let reads = 0;
  let writes = 0;
  const gateway = {
    getStory: async () => ({
      id: 7,
      content: {
        component: "page",
        title: ++reads === 2 ? "Changed" : "Hello",
      },
    }),
    aiTranslateStory: async (
      _space: number,
      _id: number,
      input: { code: string },
    ) => ({
      id: 7,
      content: {
        component: "page",
        title: input.code === "de" ? "Hello" : "Damaged",
        [`title__i18n__${input.code}`]: "Test",
      },
    }),
    updateStoryContent: async () => {
      writes++;
    },
  };
  const result = await translateStoryWithAi(gateway as never, {
    spaceId: 42,
    storyId: 7,
    languages: [
      { lang: "de", code: "de" },
      { lang: "fr", code: "fr" },
    ],
  });
  expect(result.failed).toBe(true);
  expect(result.results.map((item) => item.error?.code)).toEqual([
    "CONFLICT",
    "CONFLICT",
  ]);
  expect(writes).toBe(0);
});

test("rejects duplicate language codes before API calls", async () => {
  await expect(
    translateStoryWithAi({} as never, {
      spaceId: 42,
      storyId: 7,
      languages: [
        { lang: "de", code: "de" },
        { lang: "fr", code: "de" },
      ],
    }),
  ).rejects.toMatchObject({ code: "INVALID_INPUT" });
});

test("all languages uses configured AI mappings and validates them before translating", async () => {
  const requested: unknown[] = [];
  const gateway = {
    listLanguages: async () => [
      { name: "German", code: "de", aiTranslationCode: "de" },
      { name: "Brazilian Portuguese", code: "pt-br", aiTranslationCode: "pt" },
    ],
    getStory: async () => ({ id: 7, content: { component: "default-page" } }),
    aiTranslateStory: async (
      _space: number,
      _story: number,
      input: unknown,
    ) => {
      requested.push(input);
      return { id: 7, content: { component: "default-page" } };
    },
    updateStoryContent: async () => {},
  };
  const result = await translateStoryWithAi(gateway as never, {
    spaceId: 42,
    storyId: 7,
    allLanguages: true,
  });
  expect(result.results.map((item) => item.language)).toEqual([
    { lang: "de", code: "de" },
    { lang: "pt", code: "pt-br" },
  ]);
  expect(requested).toEqual([
    { lang: "de", code: "de", overwrite: false },
    { lang: "pt", code: "pt-br", overwrite: false },
  ]);
  requested.length = 0;
  const missing = {
    ...gateway,
    listLanguages: async () => [
      { name: "German", code: "de", aiTranslationCode: null },
    ],
  };
  await expect(
    translateStoryWithAi(missing as never, {
      spaceId: 42,
      storyId: 7,
      allLanguages: true,
    }),
  ).rejects.toMatchObject({
    code: "INVALID_INPUT",
    message: expect.stringContaining("de"),
  });
  expect(requested).toEqual([]);
  await expect(
    translateStoryWithAi(gateway as never, {
      spaceId: 42,
      storyId: 7,
      allLanguages: true,
      languages: [{ lang: "de", code: "de" }],
    }),
  ).rejects.toMatchObject({ code: "INVALID_INPUT" });
  await expect(
    translateStoryWithAi(
      { ...gateway, listLanguages: async () => [] } as never,
      { spaceId: 42, storyId: 7, allLanguages: true },
    ),
  ).rejects.toMatchObject({ code: "NOT_FOUND" });
});

test("queues every requested language without waiting for tasks", async () => {
  let requests = 0;
  const gateway = {
    getStory: async () => ({ id: 7, content: { component: "default-page" } }),
    aiTranslateStory: async () => {
      requests++;
      return { backgroundTaskId: 122 + requests };
    },
    updateStoryContent: async () => {},
  };
  const result = await translateStoryWithAi(gateway as never, {
    spaceId: 42,
    storyId: 7,
    languages: [
      { lang: "de", code: "de" },
      { lang: "fr", code: "fr" },
    ],
  });
  expect(result.results.map((item) => item.status)).toEqual([
    "queued",
    "queued",
  ]);
  expect(requests).toBe(2);
  expect(result.results[0]?.backgroundTaskId).toBe(123);
  expect(result.results[1]?.backgroundTaskId).toBe(124);
  expect(result.failed).toBe(false);
});

test("enables language workflow and assigns each accepted language to review", async () => {
  let enabled = false;
  const assigned: unknown[] = [];
  const gateway = {
    listWorkflowStages: async () => [
      { id: 8, name: "Review translation", workflow_id: 5 },
    ],
    listWorkflows: async () => [
      { id: 5, name: "Default", per_language_stages: enabled },
    ],
    getWorkflowStage: async () => ({
      id: 8,
      name: "Review translation",
      workflow_id: 5,
    }),
    updateWorkflow: async (_space: number, workflow: number) => {
      expect(workflow).toBe(5);
      enabled = true;
    },
    assignWorkflowStage: async (_space: number, input: unknown) => {
      assigned.push(input);
    },
    getStory: async () => ({
      id: 7,
      content: { component: "default-page" },
      stages: [],
    }),
    aiTranslateStory: async () => ({ backgroundTaskId: 123 }),
    updateStoryContent: async () => {},
  };
  const result = await translateStoryWithAi(gateway as never, {
    spaceId: 42,
    storyId: 7,
    languages: [
      { lang: "de", code: "de" },
      { lang: "fr", code: "fr-be" },
    ],
    review: { stage: "Review translation", workflow: "Default" },
  });
  expect(result.failed).toBe(false);
  expect(assigned).toEqual([
    { storyId: 7, stageId: 8, language: "de" },
    { storyId: 7, stageId: 8, language: "fr-be" },
  ]);
  expect(result.results).toMatchObject([
    { status: "queued", review: { status: "assigned" } },
    { status: "queued", review: { status: "assigned" } },
  ]);
});

test("reports a review assignment failure without hiding the queued task", async () => {
  const gateway = {
    listWorkflowStages: async () => [{ id: 8, name: "Review", workflow_id: 5 }],
    listWorkflows: async () => [
      { id: 5, name: "Default", per_language_stages: true },
    ],
    getWorkflowStage: async () => ({}),
    updateWorkflow: async () => {
      throw Error("should not run");
    },
    assignWorkflowStage: async () => {
      throw Error("failed");
    },
    getStory: async () => ({
      id: 7,
      content: { component: "default-page" },
      stages: [],
    }),
    aiTranslateStory: async () => ({ backgroundTaskId: 123 }),
    updateStoryContent: async () => {},
  };
  const result = await translateStoryWithAi(gateway as never, {
    spaceId: 42,
    storyId: 7,
    languages: [{ lang: "de", code: "de" }],
    review: { stage: "Review" },
  });
  expect(result.failed).toBe(true);
  expect(result.results).toMatchObject([
    { status: "queued", backgroundTaskId: 123, review: { status: "failed" } },
  ]);
});

test("does not queue translations when workflow language mode cannot be verified", async () => {
  let requested = false;
  const gateway = {
    listWorkflowStages: async () => [{ id: 8, name: "Review", workflow_id: 5 }],
    listWorkflows: async () => [{ id: 5, name: "Default" }],
    getWorkflowStage: async () => ({}),
    updateWorkflow: async () => {},
    assignWorkflowStage: async () => {},
    aiTranslateStory: async () => {
      requested = true;
      return { backgroundTaskId: 123 };
    },
    getStory: async () => ({}),
    updateStoryContent: async () => {},
  };
  await expect(
    translateStoryWithAi(gateway as never, {
      spaceId: 42,
      storyId: 7,
      languages: [{ lang: "de", code: "de" }],
      review: { stage: "Review" },
    }),
  ).rejects.toMatchObject({ code: "CONFLICT" });
  expect(requested).toBe(false);
});
