import { expect, test } from "bun:test";
import {
  compileSupportedBlueprint,
  applySupportedBlueprint,
} from "./blueprint-apply.ts";
import { compileExperiments } from "./blueprint-experiments.ts";
import { resolveBlueprint } from "./blueprint-validation.ts";
import type { StoryblokGateway } from "../storyblok/gateway.ts";

const definition = {
  version: 1,
  experiments: {
    disclaimer_id: 123,
    create: [
      {
        name: "hero_demo",
        display_name: "Hero demo",
        story_slug: "home",
        variants: [
          {
            name: "control",
            display_name: "Control",
            weight: 50,
            is_control: true,
            result: 0.12,
          },
          {
            name: "test",
            display_name: "Hero test",
            weight: 50,
            is_control: false,
            result: 0.15,
          },
        ],
        results: { title: "Rate", series_label: "Simulated rate" },
      },
    ],
  },
  stories: {
    update_blocks: [
      {
        story_slug: "home-hero_demo-test",
        component: "hero",
        fields: { color: "blue" },
      },
    ],
  },
};

test("installs, creates, links, and updates the mapped variant while skipping draft results", async () => {
  const calls: string[] = [];
  let installed = false;
  let charts: unknown[] = [];
  const gateway = {
    listInstalledApps: async () =>
      installed ? [{ app_id: "173657247642152" }] : [],
    getSpace: async () => ({ id: 42, disclaimer_ids: [] }),
    acceptSpaceDisclaimer: async () => {
      calls.push("disclaimer");
    },
    installApp: async () => {
      calls.push("install");
      installed = true;
      return { app_id: "173657247642152" };
    },
    listExperiments: async () => ({ experiments: [] }),
    // Variant stories are omitted from Storyblok's ordinary story list.
    findStoryBySlug: async (_s: number, slug: string) =>
      slug === "home" ? { id: 10 } : undefined,
    createExperiment: async (_s: number, input: Record<string, unknown>) => {
      calls.push("create");
      expect(input.story_ids).toBeUndefined();
      return { experiment: { id: 20 } };
    },
    linkExperimentStory: async (
      _s: number,
      experimentId: number,
      storyId: number,
    ) => {
      calls.push("link");
      expect([experimentId, storyId]).toEqual([20, 10]);
      return {};
    },
    getExperiment: async () => ({
      experiment: {
        experiment_variants: [
          {
            id: 30,
            name: "test",
            is_control: false,
            story_mappings: [
              {
                original_story_id: 10,
                variant_story_id: 40,
                variant_slug: "home-hero_demo-test",
              },
            ],
          },
        ],
      },
    }),
    getStory: async () => ({
      id: 40,
      full_slug: "home-hero_demo-test",
      content: {
        component: "page",
        body: [{ _uid: "hero-uid", component: "hero", color: "red" }],
      },
    }),
    updateStoryContent: async (_s: number, id: number, content: unknown) => {
      calls.push("update");
      expect(id).toBe(40);
      expect(content).toEqual({
        component: "page",
        body: [{ _uid: "hero-uid", component: "hero", color: "blue" }],
      });
      return {};
    },
    pushExperimentResults: async (_s: number, id: number, data: unknown[]) => {
      calls.push("results");
      expect(id).toBe(20);
      charts = data;
      return {};
    },
  } as unknown as StoryblokGateway;
  const report = await applySupportedBlueprint(
    gateway,
    42,
    compileSupportedBlueprint(resolveBlueprint(definition)),
  );
  expect(report.failed).toBe(false);
  expect(calls).toEqual(["disclaimer", "install", "create", "link", "update"]);
  expect(charts).toEqual([]);
  expect(
    report.operations.find(
      (item) => item.operation === "push-experiment-results",
    )?.status,
  ).toBe("skipped");
});

test("rejects invalid allocation and nested variant edits", () => {
  const invalid = structuredClone(definition.experiments);
  invalid.create[0]!.variants[1]!.weight = 60;
  expect(() => compileExperiments(invalid)).toThrow("total 100");
  const nested = structuredClone(definition.experiments);
  Object.assign(nested.create[0]!.variants[1]!, {
    block: { component: "hero" },
  });
  expect(() => compileExperiments(nested)).toThrow();
});

test("publishes mapped variants before activation and results", async () => {
  const input = structuredClone(definition);
  Object.assign(input.experiments.create[0]!, { activate: true });
  const calls: string[] = [];
  const gateway = {
    listInstalledApps: async () => [{ app_id: "173657247642152" }],
    listExperiments: async () => ({ experiments: [] }),
    findStoryBySlug: async (_space: number, slug: string) => ({
      id: slug === "home" ? 10 : 40,
    }),
    createExperiment: async () => ({ experiment: { id: 20 } }),
    linkExperimentStory: async () => ({}),
    getExperiment: async () => ({
      experiment: {
        experiment_variants: [
          {
            id: 30,
            name: "test",
            is_control: false,
            story_mappings: [
              {
                original_story_id: 10,
                variant_story_id: 40,
                variant_slug: "home-hero_demo-test",
              },
            ],
          },
        ],
      },
    }),
    getStory: async (_space: number, id: number) =>
      id === 10
        ? { id, published: true }
        : {
            id,
            full_slug: "home-hero_demo-test",
            content: {
              body: [{ _uid: "hero", component: "hero", color: "red" }],
            },
          },
    updateStoryContent: async () => {
      calls.push("update");
      return {};
    },
    publishStory: async () => {
      calls.push("publish");
      return {};
    },
    activateExperiment: async () => {
      calls.push("activate");
      return {};
    },
    getExperimentResults: async () => null,
    pushExperimentResults: async () => {
      calls.push("results");
      return {};
    },
  } as unknown as StoryblokGateway;
  const report = await applySupportedBlueprint(
    gateway,
    42,
    compileSupportedBlueprint(resolveBlueprint(input)),
  );
  expect(report.failed).toBe(false);
  expect(calls).toEqual(["update", "publish", "activate", "results"]);
});

test("resumes a matching draft and reruns without overwriting existing results", async () => {
  const input = structuredClone(definition);
  Object.assign(input.experiments.create[0]!, { activate: true });
  let status = "draft",
    published = false,
    color = "blue",
    results: unknown = null;
  const calls: string[] = [];
  const variants = input.experiments.create[0]!.variants.map((v, i) => ({
    ...v,
    id: i + 30,
    story_mappings: v.is_control
      ? []
      : [
          {
            original_story_id: 10,
            variant_story_id: 40,
            variant_slug: "home-hero_demo-test",
          },
        ],
  }));
  const gateway = {
    listInstalledApps: async () => [{ app_id: "173657247642152" }],
    listExperiments: async () => ({
      experiments: [{ id: 20, name: "hero_demo" }],
    }),
    findStoryBySlug: async (_space: number, slug: string) => ({
      id: slug === "home" ? 10 : 40,
    }),
    getExperiment: async () => ({
      experiment: {
        name: "hero_demo",
        display_name: "Hero demo",
        status,
        story_ids: [10],
        experiment_variants: variants,
      },
    }),
    getStory: async (_space: number, id: number) =>
      id === 10
        ? { id, published: true }
        : {
            id,
            published,
            unpublished_changes: false,
            full_slug: "home-hero_demo-test",
            content: { body: [{ _uid: "hero", component: "hero", color }] },
          },
    updateStoryContent: async () => {
      calls.push("update");
      color = "blue";
    },
    publishStory: async () => {
      calls.push("publish");
      published = true;
    },
    activateExperiment: async () => {
      calls.push("activate");
      status = "running";
    },
    getExperimentResults: async () => results,
    pushExperimentResults: async () => {
      calls.push("results");
      results = { charts: [] };
    },
  } as unknown as StoryblokGateway;
  const compiled = compileSupportedBlueprint(resolveBlueprint(input));
  expect((await applySupportedBlueprint(gateway, 42, compiled)).failed).toBe(
    false,
  );
  expect(calls).toEqual(["publish", "activate", "results"]);
  calls.length = 0;
  expect((await applySupportedBlueprint(gateway, 42, compiled)).failed).toBe(
    false,
  );
  expect(calls).toEqual([]);
  color = "different";
  expect((await applySupportedBlueprint(gateway, 42, compiled)).failed).toBe(
    true,
  );
  expect(calls).toEqual([]);
});

test("stops before writes if the existing experiment conflicts", async () => {
  let writes = 0;
  const gateway = {
    listInstalledApps: async () => [{ app_id: "173657247642152" }],
    listExperiments: async () => ({
      experiments: [{ id: 20, name: "hero_demo" }],
    }),
    findStoryBySlug: async () => ({ id: 10 }),
    getExperiment: async () => ({
      experiment: {
        name: "hero_demo",
        display_name: "Different",
        status: "draft",
        story_ids: [],
        experiment_variants: [],
      },
    }),
    createExperiment: async () => {
      writes++;
      return {};
    },
  } as unknown as StoryblokGateway;
  const report = await applySupportedBlueprint(
    gateway,
    42,
    compileSupportedBlueprint(resolveBlueprint(definition)),
  );
  expect(report.failed).toBe(true);
  expect(writes).toBe(0);
  expect(
    report.operations.find((item) => item.operation === "create-experiment")
      ?.error,
  ).toContain("conflicting");
  expect(
    report.operations.find(
      (item) => item.operation === "push-experiment-results",
    )?.status,
  ).toBe("not_run");
});

test("does not edit a story when Storyblok has no matching non-control mapping", async () => {
  let writes = 0;
  let mappingsCreated = 0;
  const gateway = {
    listInstalledApps: async () => [{ app_id: "173657247642152" }],
    listExperiments: async () => ({ experiments: [] }),
    findStoryBySlug: async () => ({ id: 10 }),
    createExperiment: async () => ({ experiment: { id: 20 } }),
    linkExperimentStory: async () => ({}),
    getExperiment: async () => ({
      experiment: {
        experiment_variants: [
          { id: 30, name: "test", is_control: false, story_mappings: [] },
        ],
      },
    }),
    createExperimentMapping: async (
      _space: number,
      experiment: number,
      variant: number,
      story: number,
    ) => {
      expect([experiment, variant, story]).toEqual([20, 30, 10]);
      mappingsCreated++;
      return {};
    },
    updateStoryContent: async () => {
      writes++;
      return {};
    },
  } as unknown as StoryblokGateway;
  const report = await applySupportedBlueprint(
    gateway,
    42,
    compileSupportedBlueprint(resolveBlueprint(definition)),
  );
  expect(writes).toBe(0);
  expect(mappingsCreated).toBe(1);
  expect(
    report.operations.find((item) => item.operation === "update-story-block")
      ?.error,
  ).toContain("non-control mapping");
  expect(
    report.operations.find(
      (item) => item.operation === "push-experiment-results",
    )?.status,
  ).toBe("not_run");
  expect(report.recovery?.message).toContain("Inspect the experiment");
});

test("reports a link failure after experiment creation", async () => {
  const gateway = {
    listInstalledApps: async () => [{ app_id: "173657247642152" }],
    listExperiments: async () => ({ experiments: [] }),
    findStoryBySlug: async () => ({ id: 10 }),
    createExperiment: async () => ({ experiment: { id: 20 } }),
    linkExperimentStory: async () => {
      throw new Error("Link failed");
    },
  } as unknown as StoryblokGateway;
  const report = await applySupportedBlueprint(
    gateway,
    42,
    compileSupportedBlueprint(resolveBlueprint(definition)),
  );
  expect(
    report.operations.find((item) => item.operation === "create-experiment")
      ?.status,
  ).toBe("completed");
  expect(
    report.operations.find((item) => item.operation === "link-experiment-story")
      ?.error,
  ).toBe("Link failed");
  expect(
    report.operations.find((item) => item.operation === "update-story-block")
      ?.status,
  ).toBe("not_run");
});
