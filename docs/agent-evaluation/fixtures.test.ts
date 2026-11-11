import { expect, test } from "bun:test";
import { ClientError } from "@storyblok/management-api-client";
import { translateStoryWithAi } from "../../src/actions/stories/ai-translate.ts";
import {
  blueprintFailure,
  finishBlueprintReport,
} from "../../src/setup/blueprint-report.ts";
import translationFixture from "./fixtures/translation-queued.json";
import partialFixture from "./fixtures/setup-partial.json";

test("queued translation fixture matches the shared action report", async () => {
  let task = 100;
  const gateway = {
    getStory: async () => ({ id: 7, content: { component: "default-page" } }),
    aiTranslateStory: async () => ({ backgroundTaskId: ++task }),
    listWorkflows: async () => [
      { id: 5, name: "Default", is_default: true, per_language_stages: true },
    ],
    listWorkflowStages: async () => [
      { id: 9, name: "Reviewing", workflow_id: 5 },
    ],
    getWorkflowStage: async () => ({
      id: 9,
      name: "Reviewing",
      workflow_id: 5,
    }),
    updateWorkflow: async () => {},
    assignWorkflowStage: async () => ({}),
  };
  const result = await translateStoryWithAi(gateway as never, {
    spaceId: 12345,
    storyId: 7,
    languages: [
      { lang: "de", code: "de" },
      { lang: "it", code: "it" },
    ],
    review: { stage: "Reviewing", workflow: "Default" },
  });
  expect(result as unknown).toEqual(translationFixture);
});

test("partial setup fixture matches a structured report", () => {
  const failure = new ClientError("Forbidden", {
    status: 403,
    statusText: "Forbidden",
    data: {},
  });
  const report = finishBlueprintReport(
    12345,
    [
      { operation: "install-app", key: "releases_only", status: "installed" },
      {
        operation: "create-release",
        key: "Autumn Campaign",
        status: "failed",
        ...blueprintFailure(failure),
      },
    ],
    [{ operation: "create-story", key: "autumn-campaign" }],
  );
  expect(report as unknown).toEqual(partialFixture);
});
