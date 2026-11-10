import {
  ensurePipelineBranch,
  getPipelineBranch,
  listPipelineBranches,
} from "../../actions/pipelines/branches.ts";
import type { Command } from "../../cli/command.ts";
import { resourceGetCommand } from "../resource-get.ts";
import { dispatch } from "../../cli/dispatch.ts";
import { getStoryblokToken } from "../../config/environment.ts";
import { resolveSpaceId } from "../../config/space-id.ts";
import { CliError } from "../../errors.ts";

function command(mode: "list" | "create"): Command {
  return {
    name: mode,
    description:
      mode === "list" ? "List pipeline stages" : "Create a pipeline stage",
    usage:
      mode === "list"
        ? "unblok pipeline list [--space-id <id>]"
        : "unblok pipeline create --name <name> [--source <name>] [--space-id <id>] --yes",
    async run(args, context) {
      if (args.includes("--help") || args.includes("-h")) {
        context.output.text(
          `Usage: ${this.usage}\n\n${mode === "create" ? "Create a stage by name, or skip a matching stage. --source selects an existing stage by exact name; --yes is required." : "List Storyblok pipeline stages."}\nUse --json for structured output.`,
        );
        return;
      }
      const values: Record<string, string> = {};
      let yes = false;
      for (let i = 0; i < args.length; i++) {
        const arg = args[i]!;
        if (arg === "--yes" && mode === "create") {
          yes = true;
          continue;
        }
        const equal = arg.indexOf("=");
        const key = equal < 0 ? arg : arg.slice(0, equal);
        if (
          key !== "--space-id" &&
          !(mode === "create" && (key === "--name" || key === "--source"))
        )
          throw new CliError(`Unknown argument '${arg}'.`, 2);
        const value = equal < 0 ? args[++i] : arg.slice(equal + 1);
        if (!value?.trim() || value.startsWith("--"))
          throw new CliError(`Option '${key}' requires a value.`, 2);
        if (values[key] !== undefined)
          throw new CliError(`Option '${key}' can only be provided once.`, 2);
        values[key] = value;
      }
      if (mode === "create" && !values["--name"])
        throw new CliError("Option '--name <name>' is required.", 2);
      if (mode === "create" && !yes)
        throw new CliError(
          "Refusing to create a pipeline stage without '--yes'.",
          2,
        );
      const spaceId = resolveSpaceId({
        environment: context.environment,
        option: values["--space-id"],
      });
      const gateway = context.createGateway(
        getStoryblokToken(context.environment),
      );
      if (mode === "list") {
        const result = await context.output.activity(
          "Loading pipeline stages",
          "Pipeline stages loaded",
          () => listPipelineBranches(gateway, { spaceId }),
        );
        if (context.output.mode === "json") context.output.data(result);
        else if (!result.length)
          context.output.info("No pipeline stages found.");
        else
          context.output.text(
            result.map((branch) => `${branch.name}  (${branch.id})`).join("\n"),
          );
      } else {
        const result = await context.output.activity(
          "Checking pipeline stage",
          "Pipeline stage checked",
          () =>
            ensurePipelineBranch(gateway, {
              spaceId,
              name: values["--name"]!,
              source: values["--source"],
            }),
        );
        if (context.output.mode === "json") context.output.data(result);
        else
          context.output.info(
            result.status === "created"
              ? `Created pipeline stage ${result.branch.name} (ID ${result.branch.id}).`
              : `Pipeline stage ${result.branch.name} (ID ${result.branch.id}) already exists; skipped.`,
          );
      }
    },
  };
}
export const pipelineCommand: Command = {
  name: "pipeline",
  description: "Manage Storyblok pipeline stages",
  usage: "unblok pipeline <command>",
  async run(args, context) {
    await dispatch(
      "unblok pipeline",
      [
        command("list"),
        resourceGetCommand({
          resource: "pipeline",
          description: "Get a Storyblok pipeline stage",
          lookup: getPipelineBranch,
          render: (branch) => ({
            title: branch.name,
            details: `ID: ${branch.id}\nSource ID: ${branch.source_id ?? "Not specified"}`,
          }),
        }),
        command("create"),
      ],
      args,
      context,
    );
  },
};
