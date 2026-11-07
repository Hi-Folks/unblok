import { expect, test } from "bun:test";
import {
  createExperiment,
  validateCharts,
  validateExperiment,
} from "./experiments.ts";

const experiment = {
  name: "hero_test",
  display_name: "Hero test",
  story_ids: [10],
  experiment_variants_attributes: [
    { name: "control", display_name: "Control", weight: 50, is_control: true },
    { name: "test", display_name: "Test", weight: 50, is_control: false },
  ],
};
test("validates experiment names, variants and traffic allocation", () => {
  expect(validateExperiment(experiment)).toEqual(experiment);
  expect(() =>
    validateExperiment({
      ...experiment,
      experiment_variants_attributes: [
        { ...experiment.experiment_variants_attributes[0], weight: 70 },
        experiment.experiment_variants_attributes[1],
      ],
    }),
  ).toThrow("total 100");
  expect(() => validateExperiment({ ...experiment, story_ids: [-1] })).toThrow(
    "story_ids",
  );
});
test("validates chart series before pushing a result", () => {
  expect(
    validateCharts({
      charts: [
        {
          kind: "bar",
          labels: ["Control", "Test"],
          series: [{ label: "Rate", data: [0.12, 0.15] }],
        },
      ],
    }),
  ).toHaveLength(1);
  expect(() =>
    validateCharts({
      charts: [
        {
          kind: "bar",
          labels: ["Control", "Test"],
          series: [{ label: "Rate", data: [0.12] }],
        },
      ],
    }),
  ).toThrow("matching the labels");
});

test("resolves and deduplicates exact story slugs before creating an experiment", async () => {
  let payload: Record<string, unknown> | undefined;
  const lookups: string[] = [];
  const gateway = {
    findStoryBySlug: async (_space: number, slug: string) => {
      lookups.push(slug);
      return { id: slug === "home" ? 10 : 20 } as never;
    },
    createExperiment: async (
      _space: number,
      input: Record<string, unknown>,
    ) => {
      payload = input;
      return { id: 1 };
    },
  };
  await createExperiment(gateway, 42, {
    ...experiment,
    story_slugs: ["home", "home", "pages/about"],
  });
  expect(lookups).toEqual(["home", "pages/about"]);
  expect(payload?.story_ids).toEqual([10, 20]);
  expect(payload).not.toHaveProperty("story_slugs");
});

test("never creates an experiment when a slug is invalid, missing, or lookup fails", async () => {
  let creates = 0;
  const gateway = {
    findStoryBySlug: async (_space: number, slug: string) => {
      if (slug === "error") throw new Error("API failure");
      return undefined;
    },
    createExperiment: async () => {
      creates++;
      return {};
    },
  };
  await expect(
    createExperiment(gateway, 42, { ...experiment, story_slugs: ["*"] }),
  ).rejects.toThrow("exact");
  await expect(
    createExperiment(gateway, 42, { ...experiment, story_slugs: ["missing"] }),
  ).rejects.toThrow("no experiment was created");
  await expect(
    createExperiment(gateway, 42, { ...experiment, story_slugs: ["error"] }),
  ).rejects.toThrow("API failure");
  expect(creates).toBe(0);
});
