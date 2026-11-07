import {
  createExperiment,
  object,
  validateExperiment,
} from "../actions/experiments/experiments.ts";
import { CliError } from "../errors.ts";
import type { StoryblokGateway } from "../storyblok/gateway.ts";
import type { BlueprintOperation } from "./blueprint-report.ts";

type Variant = {
  name: string;
  display_name: string;
  weight: number;
  is_control: boolean;
  result: number;
};
export type BlueprintExperiment = {
  name: string;
  display_name: string;
  story_slug: string;
  activate: boolean;
  variants: Variant[];
  results: { title: string; series_label: string };
};

export function compileExperiments(value: unknown): {
  disclaimerId: number;
  create: BlueprintExperiment[];
} {
  const section = object(value, "experiments");
  if (
    Object.keys(section).some(
      (key) => !["disclaimer_id", "create"].includes(key),
    ) ||
    !/^\d+$/.test(String(section.disclaimer_id)) ||
    !Number.isSafeInteger(Number(section.disclaimer_id)) ||
    Number(section.disclaimer_id) <= 0 ||
    !Array.isArray(section.create) ||
    !section.create.length
  )
    throw new CliError(
      "experiments requires a positive disclaimer_id and a nonempty create list.",
      2,
    );
  const names = new Set<string>();
  const create = section.create.map((entry): BlueprintExperiment => {
    const item = object(entry, "experiment");
    if (
      Object.keys(item).some(
        (key) =>
          ![
            "name",
            "display_name",
            "story_slug",
            "activate",
            "variants",
            "results",
          ].includes(key),
      ) ||
      typeof item.story_slug !== "string" ||
      !item.story_slug.trim() ||
      item.story_slug !== item.story_slug.trim() ||
      /[*,]/.test(item.story_slug) ||
      !Array.isArray(item.variants)
    )
      throw new CliError(
        "Experiment requires an exact story_slug and variants.",
        2,
      );
    if (item.activate !== undefined && typeof item.activate !== "boolean")
      throw new CliError("Experiment activate must be a boolean.", 2);
    const variants = item.variants.map((entry): Variant => {
      const variant = object(entry, "variant");
      if (
        Object.keys(variant).some(
          (key) =>
            ![
              "name",
              "display_name",
              "weight",
              "is_control",
              "result",
            ].includes(key),
        ) ||
        typeof variant.result !== "number" ||
        !Number.isFinite(variant.result)
      )
        throw new CliError(
          "Each variant requires a numeric simulated result.",
          2,
        );
      return variant as Variant;
    });
    validateExperiment({
      name: item.name,
      display_name: item.display_name,
      experiment_variants_attributes: variants.map(
        ({ name, display_name, weight, is_control }) => ({
          name,
          display_name,
          weight,
          is_control,
        }),
      ),
    });
    const results = object(item.results, "experiment.results");
    if (
      Object.keys(results).some(
        (key) => !["title", "series_label"].includes(key),
      ) ||
      typeof results.title !== "string" ||
      !results.title.trim() ||
      typeof results.series_label !== "string" ||
      !results.series_label.trim()
    )
      throw new CliError(
        "Experiment results require a title and series_label.",
        2,
      );
    if (names.has(item.name as string))
      throw new CliError("Experiment names must be unique.", 2);
    names.add(item.name as string);
    return {
      name: item.name as string,
      display_name: item.display_name as string,
      story_slug: item.story_slug,
      activate: item.activate === true,
      variants,
      results: results as BlueprintExperiment["results"],
    };
  });
  return { disclaimerId: Number(section.disclaimer_id), create };
}

export function experimentOperations(
  item: BlueprintExperiment,
): Array<{ operation: string; key: string }> {
  return [
    { operation: "create-experiment", key: item.name },
    {
      operation: "link-experiment-story",
      key: `${item.name}/${item.story_slug}`,
    },
  ];
}

async function record<T>(
  operations: BlueprintOperation[],
  operation: string,
  key: string,
  run: () => Promise<T>,
): Promise<T> {
  try {
    const result = await run();
    operations.push({ operation, key, status: "completed" });
    return result;
  } catch (error) {
    operations.push({
      operation,
      key,
      status: "failed",
      error: error instanceof Error ? error.message : "Unexpected error",
    });
    throw error;
  }
}

export async function applyExperiment(
  gateway: StoryblokGateway,
  spaceId: number,
  item: BlueprintExperiment,
  operations: BlueprintOperation[],
): Promise<{ id: number; storyId: number; status: string }> {
  const original = await record(
    operations,
    "create-experiment",
    item.name,
    async () => {
      const list = object(
        await gateway.listExperiments(spaceId),
        "Experiment list",
      );
      if (!Array.isArray(list.experiments))
        throw new CliError(
          "Experiment list is missing; cannot check for duplicates.",
        );
      const story = await gateway.findStoryBySlug(spaceId, item.story_slug);
      if (!story || !Number.isSafeInteger(story.id) || story.id <= 0)
        throw new CliError(`Story '${item.story_slug}' was not found.`);
      const matches = list.experiments
        .map((entry) => object(entry, "Experiment"))
        .filter((entry) => entry.name === item.name);
      if (matches.length > 1)
        throw new CliError(`Multiple experiments named '${item.name}' exist.`);
      if (matches.length === 1) {
        const found = matches[0]!;
        if (
          typeof found.id !== "number" ||
          !Number.isSafeInteger(found.id) ||
          found.id <= 0
        )
          throw new CliError("Existing experiment has no valid ID.");
        const response = object(
          await gateway.getExperiment(spaceId, found.id),
          "Experiment response",
        );
        const existing = object(response.experiment, "Experiment");
        if (
          existing.name !== item.name ||
          existing.display_name !== item.display_name ||
          !["draft", "running"].includes(String(existing.status)) ||
          !Array.isArray(existing.story_ids) ||
          !Array.isArray(existing.experiment_variants)
        )
          throw new CliError(
            `Existing experiment '${item.name}' has conflicting or incomplete configuration.`,
          );
        if (existing.story_ids.some((id) => id !== story.id))
          throw new CliError(
            `Existing experiment '${item.name}' links other stories.`,
          );
        if (existing.status === "running" && !item.activate)
          throw new CliError(
            `Existing experiment '${item.name}' is running but the blueprint requests a draft.`,
          );
        if (
          existing.status === "running" &&
          !existing.story_ids.includes(story.id)
        )
          throw new CliError(
            `Running experiment '${item.name}' is not linked to the requested story.`,
          );
        if (
          existing.experiment_variants.length !== item.variants.length ||
          item.variants.some((desired) => {
            const variants = existing.experiment_variants as unknown[];
            const foundVariants = variants
              .map((entry) => object(entry, "Variant"))
              .filter((entry) => entry.name === desired.name);
            return (
              foundVariants.length !== 1 ||
              ["display_name", "weight", "is_control"].some(
                (key) =>
                  foundVariants[0]![key] !==
                  desired[key as "display_name" | "weight" | "is_control"],
              )
            );
          })
        )
          throw new CliError(
            `Existing experiment '${item.name}' has conflicting variants.`,
          );
        return {
          experimentId: found.id,
          storyId: story.id,
          status: String(existing.status),
          linked: existing.story_ids.includes(story.id),
          existing: true,
        };
      }
      const response = await createExperiment(gateway, spaceId, {
        name: item.name,
        display_name: item.display_name,
        experiment_variants_attributes: item.variants.map(
          ({ name, display_name, weight, is_control }) => ({
            name,
            display_name,
            weight,
            is_control,
          }),
        ),
      });
      const experiment = object(
        object(response, "Create response").experiment,
        "Created experiment",
      );
      if (
        typeof experiment.id !== "number" ||
        !Number.isSafeInteger(experiment.id) ||
        experiment.id <= 0
      )
        throw new CliError(
          "Created experiment has no valid ID; inspect Storyblok before retrying.",
        );
      return {
        experimentId: experiment.id,
        storyId: story.id,
        status: "draft",
        linked: false,
        existing: false,
      };
    },
  );
  if (original.existing)
    operations[operations.length - 1]!.status = "unchanged";
  await record(
    operations,
    "link-experiment-story",
    `${item.name}/${item.story_slug}`,
    () =>
      original.linked
        ? Promise.resolve(undefined)
        : gateway.linkExperimentStory(
            spaceId,
            original.experimentId,
            original.storyId,
          ),
  );
  if (original.linked) operations[operations.length - 1]!.status = "unchanged";
  await record(
    operations,
    "ensure-experiment-mappings",
    item.name,
    async () => {
      const response = object(
        await gateway.getExperiment(spaceId, original.experimentId),
        "Experiment response",
      );
      const experiment = object(response.experiment, "Experiment");
      if (!Array.isArray(experiment.experiment_variants))
        throw new CliError(
          "Experiment variants are missing; cannot create mappings safely.",
        );
      for (const desired of item.variants.filter(
        (variant) => !variant.is_control,
      )) {
        const variants = experiment.experiment_variants
          .map((value) => object(value, "Experiment variant"))
          .filter(
            (variant) =>
              variant.name === desired.name && variant.is_control === false,
          );
        if (variants.length !== 1)
          throw new CliError(
            `Expected exactly one non-control variant '${desired.name}'.`,
          );
        const variant = variants[0]!;
        if (
          typeof variant.id !== "number" ||
          !Number.isSafeInteger(variant.id) ||
          variant.id <= 0 ||
          !Array.isArray(variant.story_mappings)
        )
          throw new CliError(
            `Variant '${desired.name}' has incomplete mapping data.`,
          );
        const matches = variant.story_mappings.filter(
          (value) =>
            object(value, "Story mapping").original_story_id ===
            original.storyId,
        );
        if (matches.length > 1)
          throw new CliError(
            `Variant '${desired.name}' has multiple mappings for the story.`,
          );
        if (!matches.length) {
          if (original.status !== "draft")
            throw new CliError(
              `Running experiment '${item.name}' is missing a mapping.`,
            );
          await gateway.createExperimentMapping(
            spaceId,
            original.experimentId,
            variant.id,
            original.storyId,
          );
        }
      }
    },
  );
  return {
    id: original.experimentId,
    storyId: original.storyId,
    status: original.status,
  };
}

export async function pushBlueprintExperimentResults(
  gateway: StoryblokGateway,
  spaceId: number,
  experimentId: number,
  item: BlueprintExperiment,
  operations: BlueprintOperation[],
): Promise<void> {
  await record(operations, "push-experiment-results", item.name, () =>
    gateway.pushExperimentResults(spaceId, experimentId, [
      {
        kind: "bar",
        title: `SIMULATED: ${item.results.title}`,
        labels: item.variants.map((v) => v.display_name),
        series: [
          {
            label: item.results.series_label,
            data: item.variants.map((v) => v.result),
          },
        ],
      },
      { kind: "text", body: "Simulated demo data; not real analytics." },
    ]),
  );
}
