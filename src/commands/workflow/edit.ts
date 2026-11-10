import { editWorkflow } from "../../actions/workflows/edit-workflow.ts";
import type { Command } from "../../cli/command.ts";
import { getStoryblokToken } from "../../config/environment.ts";
import { resolveSpaceId } from "../../config/space-id.ts";
import { CliError } from "../../errors.ts";

export const editWorkflowCommand: Command = {
  name: "edit",
  description: "Update selected workflow settings",
  usage:
    "unblok workflow edit --workflow <name-or-id> [--name <name>] [--content-types <comma-separated>] [--per-language-stages <true|false>] [--space-id <id>] --yes",
  async run(args, context) {
    if (args.includes("--help") || args.includes("-h")) {
      context.output.text(
        `Usage: ${this.usage}\n\nUpdate only the supplied fields. Renaming requires a workflow ID. Pass an empty --content-types= to clear the list. --yes is required.`,
      );
      return;
    }
    let yes = false;
    const options = new Map<string, string>();
    for (let i = 0; i < args.length; i++) {
      const arg = args[i]!;
      if (arg === "--yes") {
        yes = true;
        continue;
      }
      const equal = arg.indexOf("=");
      const key = equal < 0 ? arg : arg.slice(0, equal);
      if (
        ![
          "--workflow",
          "--name",
          "--content-types",
          "--per-language-stages",
          "--space-id",
        ].includes(key)
      )
        throw new CliError(`Unknown argument '${arg}'.`, 2);
      if (options.has(key))
        throw new CliError(`Option '${key}' may only be used once.`, 2);
      const value = equal < 0 ? args[++i] : arg.slice(equal + 1);
      if (
        value === undefined ||
        value.startsWith("--") ||
        (value === "" && key !== "--content-types")
      )
        throw new CliError(`Option '${key}' requires a value.`, 2);
      options.set(key, value);
    }
    const workflow = options.get("--workflow");
    const mode = options.get("--per-language-stages");
    if (
      !workflow ||
      !yes ||
      (mode !== undefined && mode !== "true" && mode !== "false")
    )
      throw new CliError(
        "Provide --workflow and --yes; --per-language-stages must be true or false.",
        2,
      );
    const types = options.get("--content-types");
    const spaceId = resolveSpaceId({
      environment: context.environment,
      option: options.get("--space-id"),
    });
    const gateway = context.createGateway(
      getStoryblokToken(context.environment),
    );
    const result = await context.output.activity(
      "Checking workflow",
      "Workflow checked",
      () =>
        editWorkflow(gateway, {
          spaceId,
          workflow,
          name: options.get("--name"),
          ...(types === undefined
            ? {}
            : { contentTypes: types === "" ? [] : types.split(",") }),
          ...(mode === undefined ? {} : { perLanguageStages: mode === "true" }),
        }),
    );
    if (context.output.mode === "json") context.output.data(result);
    else
      context.output.info(`Workflow ${result.workflowId}: ${result.status}.`);
  },
};
