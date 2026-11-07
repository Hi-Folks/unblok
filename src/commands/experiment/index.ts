import type { Command, CommandContext } from "../../cli/command.ts";
import { dispatch } from "../../cli/dispatch.ts";
import { getStoryblokToken } from "../../config/environment.ts";
import { resolveSpaceId } from "../../config/space-id.ts";
import { loadDocument } from "../../config/document.ts";
import { CliError } from "../../errors.ts";
import {
  createExperiment,
  validateCharts,
  validateExperiment,
} from "../../actions/experiments/experiments.ts";

export function parseOptions(
  args: string[],
  allowed: string[],
  requiresYes = false,
): Record<string, string> {
  const options: Record<string, string> = Object.create(null);
  for (let i = 0; i < args.length; i++) {
    const arg = args[i]!;
    const [key, ...parts] = arg.split("=");
    if (!key || !allowed.includes(key))
      throw new CliError(`Unknown argument '${arg}'.`, 2);
    if (Object.hasOwn(options, key))
      throw new CliError(`Duplicate option '${key}'.`, 2);
    if (key === "--yes") {
      if (parts.length) throw new CliError("--yes takes no value.", 2);
      options[key] = "true";
      continue;
    }
    const value = parts.length ? parts.join("=") : args[++i];
    if (!value?.trim() || value.startsWith("--"))
      throw new CliError(`Option '${key}' requires a value.`, 2);
    options[key] = value;
  }
  if (requiresYes && !options["--yes"])
    throw new CliError("This operation requires --yes.", 2);
  return options;
}
export function required(options: Record<string, string>, key: string): string {
  const value = options[key];
  if (!value) throw new CliError(`Provide ${key}.`, 2);
  return value;
}
export function id(options: Record<string, string>, key: string): number {
  const value = required(options, key);
  const n = Number(value);
  if (!/^\d+$/.test(value) || !Number.isSafeInteger(n) || n < 1)
    throw new CliError(`${key} must be a positive integer.`, 2);
  return n;
}
export function setup(
  context: CommandContext,
  options: Record<string, string>,
) {
  const spaceId = resolveSpaceId({
    environment: context.environment,
    option: options["--space-id"],
  });
  return {
    spaceId,
    gateway: context.createGateway(getStoryblokToken(context.environment)),
  };
}
export function show(context: CommandContext, title: string, value: unknown) {
  if (context.output.mode === "json") context.output.data(value);
  else context.output.note(title, JSON.stringify(value, null, 2));
}

function command(
  name: string,
  description: string,
  usage: string,
  run: Command["run"],
): Command {
  return {
    name,
    description,
    usage,
    async run(args, context) {
      if (args.includes("--help") || args.includes("-h")) {
        context.output.text(
          `Usage: ${usage}\n\n${description}\n\nUse --space-id <id> or STORYBLOK_SPACE_ID. Add --json for JSON output.`,
        );
        return;
      }
      await run(args, context);
    },
  };
}
const list = command(
  "list",
  "List experiments",
  "unblok experiment list [--space-id <id>]",
  async (args, ctx) => {
    const o = parseOptions(args, ["--space-id"]);
    const { gateway, spaceId } = setup(ctx, o);
    show(ctx, "Experiments", await gateway.listExperiments(spaceId));
  },
);
const get = command(
  "get",
  "Get an experiment and its variant mappings",
  "unblok experiment get --id <id> [--space-id <id>]",
  async (args, ctx) => {
    const o = parseOptions(args, ["--id", "--space-id"]);
    const experimentId = id(o, "--id");
    const { gateway, spaceId } = setup(ctx, o);
    show(ctx, "Experiment", await gateway.getExperiment(spaceId, experimentId));
  },
);
const create = command(
  "create",
  "Create a draft experiment from a YAML or JSON definition",
  "unblok experiment create --file <path> --yes [--space-id <id>]",
  async (args, ctx) => {
    const o = parseOptions(args, ["--file", "--space-id", "--yes"], true);
    const definition = validateExperiment(
      await loadDocument(required(o, "--file"), "Experiment"),
    );
    const { gateway, spaceId } = setup(ctx, o);
    show(
      ctx,
      "Experiment created",
      await createExperiment(gateway, spaceId, definition),
    );
  },
);
const mapping = command(
  "mapping-create",
  "Duplicate a story for a variant and create its mapping",
  "unblok experiment mapping-create --id <experiment-id> --variant-id <id> --story-id <id> --yes [--space-id <id>]",
  async (args, ctx) => {
    const o = parseOptions(
      args,
      ["--id", "--variant-id", "--story-id", "--space-id", "--yes"],
      true,
    );
    const experimentId = id(o, "--id"),
      variantId = id(o, "--variant-id"),
      storyId = id(o, "--story-id");
    const { gateway, spaceId } = setup(ctx, o);
    show(
      ctx,
      "Mapping created",
      await gateway.createExperimentMapping(
        spaceId,
        experimentId,
        variantId,
        storyId,
      ),
    );
  },
);
const link = command(
  "link-story",
  "Link an existing story to a draft experiment by ID or full slug",
  "unblok experiment link-story --id <experiment-id> --story <id-or-full-slug> --yes [--space-id <id>]",
  async (args, ctx) => {
    const o = parseOptions(
      args,
      ["--id", "--story", "--space-id", "--yes"],
      true,
    );
    const experimentId = id(o, "--id"),
      reference = required(o, "--story");
    const { gateway, spaceId } = setup(ctx, o);
    const story = /^\d+$/.test(reference)
      ? await gateway.getStory(spaceId, id(o, "--story"))
      : await gateway.findStoryBySlug(spaceId, reference);
    if (!story || !Number.isSafeInteger(story.id) || story.id <= 0)
      throw new CliError(`Story '${reference}' was not found.`);
    show(
      ctx,
      "Story linked",
      await gateway.linkExperimentStory(spaceId, experimentId, story.id),
    );
  },
);
const resultsGet = command(
  "get",
  "Retrieve the current results snapshot",
  "unblok experiment results get --id <id> [--space-id <id>]",
  async (args, ctx) => {
    const o = parseOptions(args, ["--id", "--space-id"]);
    const experimentId = id(o, "--id");
    const { gateway, spaceId } = setup(ctx, o);
    show(
      ctx,
      "Experiment results",
      await gateway.getExperimentResults(spaceId, experimentId),
    );
  },
);
const resultsPush = command(
  "push",
  "Replace the experiment results snapshot from a YAML or JSON file",
  "unblok experiment results push --id <id> --file <path> --yes [--space-id <id>]",
  async (args, ctx) => {
    const o = parseOptions(
      args,
      ["--id", "--file", "--space-id", "--yes"],
      true,
    );
    const experimentId = id(o, "--id");
    const charts = validateCharts(
      await loadDocument(required(o, "--file"), "Results"),
    );
    const { gateway, spaceId } = setup(ctx, o);
    show(
      ctx,
      "Results replaced",
      await gateway.pushExperimentResults(spaceId, experimentId, charts),
    );
  },
);
const results: Command = {
  name: "results",
  description: "Get or replace experiment results",
  async run(args, ctx) {
    await dispatch(
      "unblok experiment results",
      [resultsGet, resultsPush],
      args,
      ctx,
    );
  },
};
export const experimentCommand: Command = {
  name: "experiment",
  description: "Manage Storyblok experiments",
  async run(args, ctx) {
    await dispatch(
      "unblok experiment",
      [list, get, create, link, mapping, results],
      args,
      ctx,
    );
  },
};
