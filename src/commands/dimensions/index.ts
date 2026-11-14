import type { Command } from "../../cli/command.ts";
import { dispatch } from "../../cli/dispatch.ts";
import { getStoryblokToken } from "../../config/environment.ts";
import { resolveSpaceId } from "../../config/space-id.ts";
import { CliError } from "../../errors.ts";
import { listDimensionsFolders } from "../../actions/apps/list-dimensions.ts";
import { formatDimensionsFolders } from "./presentation.ts";
import { dimensionsCoverageCommand } from "./coverage.ts";
import { createMissingCommand } from "./create-missing.ts";

const list: Command = {
  name: "list",
  description: "List configured Dimensions folders",
  usage: "unblok dimensions list [--space-id <id>] [--json]",
  async run(args, context) {
    if (args.includes("--help") || args.includes("-h")) {
      context.output.text(
        `Usage: ${this.usage}\n\nList the root folders selected in Dimensions and their AI translation codes.`,
      );
      return;
    }
    let option: string | undefined;
    for (let i = 0; i < args.length; i++) {
      const arg = args[i]!;
      const equal = arg.indexOf("=");
      const key = equal < 0 ? arg : arg.slice(0, equal);
      if (key !== "--space-id" || option !== undefined)
        throw new CliError(`Unknown or repeated option '${arg}'.`, 2);
      option = equal < 0 ? args[++i] : arg.slice(equal + 1);
      if (!option || option.startsWith("--"))
        throw new CliError("Option '--space-id' requires a value.", 2);
    }
    const spaceId = resolveSpaceId({
      environment: context.environment,
      option,
    });
    const gateway = context.createGateway(
      getStoryblokToken(context.environment),
    );
    const folders = await context.output.activity(
      "Loading Dimensions folders",
      "Dimensions folders loaded",
      () => listDimensionsFolders(gateway, { spaceId }),
    );
    if (context.output.mode === "json")
      context.output.data({
        apiVersion: "unblok/dimensions-folders-v1",
        folders,
      });
    else if (!folders.length)
      context.output.info("No Dimensions folders configured.");
    else
      context.output.text(
        formatDimensionsFolders(folders, context.output.width?.()),
      );
  },
};
export const dimensionsCommand: Command = {
  name: "dimensions",
  description: "Inspect Dimensions configuration",
  usage: "unblok dimensions <command>",
  async run(args, context) {
    await dispatch(
      "unblok dimensions",
      [list, dimensionsCoverageCommand, createMissingCommand],
      args,
      context,
    );
  },
};
