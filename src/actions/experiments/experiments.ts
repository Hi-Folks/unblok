import { CliError } from "../../errors.ts";
import type { StoryblokGateway } from "../../storyblok/gateway.ts";

export function object(value: unknown, label: string): Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value))
    throw new CliError(`${label} must be an object.`);
  return value as Record<string, unknown>;
}

export function validateExperiment(value: unknown): Record<string, unknown> {
  const experiment = object(value, "Experiment");
  if (
    typeof experiment.name !== "string" ||
    !/^[a-z0-9_]+$/.test(experiment.name) ||
    typeof experiment.display_name !== "string" ||
    !experiment.display_name.trim()
  )
    throw new CliError(
      "Experiment requires a lowercase technical name and display_name.",
    );
  const variants = experiment.experiment_variants_attributes;
  if (!Array.isArray(variants) || variants.length < 2)
    throw new CliError("Provide at least two variants.");
  const names = new Set<string>();
  let controls = 0;
  let total = 0;
  for (const entry of variants) {
    const variant = object(entry, "Variant");
    if (
      typeof variant.name !== "string" ||
      !/^[a-z0-9_]+$/.test(variant.name) ||
      names.has(variant.name) ||
      typeof variant.display_name !== "string" ||
      !variant.display_name.trim() ||
      typeof variant.weight !== "number" ||
      !Number.isFinite(variant.weight) ||
      variant.weight < 0 ||
      variant.weight > 100 ||
      typeof variant.is_control !== "boolean"
    )
      throw new CliError(
        "Variants require unique technical names, display names, weights from 0 to 100, and is_control.",
      );
    names.add(variant.name);
    total += variant.weight;
    if (variant.is_control) controls++;
  }
  if (controls !== 1 || total !== 100)
    throw new CliError(
      "Exactly one control is required and variant weights must total 100.",
    );
  if (
    experiment.story_ids !== undefined &&
    (!Array.isArray(experiment.story_ids) ||
      experiment.story_ids.some((id) => !Number.isSafeInteger(id) || id <= 0))
  )
    throw new CliError("story_ids must contain positive integer IDs.");
  if (
    experiment.story_slugs !== undefined &&
    (!Array.isArray(experiment.story_slugs) ||
      experiment.story_slugs.some(
        (slug) =>
          typeof slug !== "string" ||
          !slug.trim() ||
          slug !== slug.trim() ||
          slug.includes("*") ||
          slug.includes(","),
      ))
  )
    throw new CliError("story_slugs must contain exact, nonempty full slugs.");
  return experiment;
}

export async function createExperiment(
  gateway: Pick<StoryblokGateway, "findStoryBySlug" | "createExperiment">,
  spaceId: number,
  value: unknown,
): Promise<unknown> {
  const definition = validateExperiment(value);
  const { story_slugs, ...payload } = definition;
  const ids = new Set<number>(
    (definition.story_ids as number[] | undefined) ?? [],
  );
  for (const slug of new Set((story_slugs as string[] | undefined) ?? [])) {
    const story = await gateway.findStoryBySlug(spaceId, slug);
    if (!story)
      throw new CliError(
        `Story '${slug}' was not found; no experiment was created.`,
      );
    if (!Number.isSafeInteger(story.id) || story.id <= 0)
      throw new CliError(
        `Story '${slug}' has an invalid ID; no experiment was created.`,
      );
    ids.add(story.id);
  }
  if (story_slugs !== undefined || definition.story_ids !== undefined)
    payload.story_ids = [...ids];
  return gateway.createExperiment(spaceId, payload);
}

export function validateCharts(value: unknown): unknown[] {
  const charts = object(value, "Results").charts;
  if (!Array.isArray(charts) || charts.length < 1 || charts.length > 20)
    throw new CliError("Results must contain 1 to 20 charts.");
  for (const entry of charts) {
    const chart = object(entry, "Chart");
    if (chart.kind === "text") {
      if (typeof chart.body !== "string" || !chart.body.trim())
        throw new CliError("Text charts require body.");
      continue;
    }
    if (
      (chart.kind !== "bar" && chart.kind !== "line") ||
      !Array.isArray(chart.labels) ||
      !chart.labels.length ||
      chart.labels.some((label) => typeof label !== "string") ||
      !Array.isArray(chart.series) ||
      !chart.series.length
    )
      throw new CliError("Bar and line charts require labels and series.");
    for (const item of chart.series) {
      const series = object(item, "Series");
      if (
        typeof series.label !== "string" ||
        !Array.isArray(series.data) ||
        series.data.length !== chart.labels.length ||
        series.data.some(
          (number) => typeof number !== "number" || !Number.isFinite(number),
        )
      )
        throw new CliError(
          "Series require a label and numeric data matching the labels.",
        );
    }
  }
  return charts;
}
