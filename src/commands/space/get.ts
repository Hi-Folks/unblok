import type { Command } from "../../cli/command.ts";
import { getSpace } from "../../actions/spaces/get-space.ts";
import { getStoryblokToken } from "../../config/environment.ts";
import { CliError } from "../../errors.ts";
import { resolveSpaceId } from "../../config/space-id.ts";
import { formatSpaceDetails } from "./presentation.ts";

function parseSpaceIdArguments(args: string[]): {
  option?: string;
  positional?: string;
} {
  let option: string | undefined;
  let positional: string | undefined;

  for (let index = 0; index < args.length; index += 1) {
    const argument = args[index];
    if (argument === "--space-id" || argument?.startsWith("--space-id=")) {
      const inlineValue = argument.split("=", 2)[1];
      const value = inlineValue ?? args[index + 1];
      if (!value || value.startsWith("--")) {
        throw new CliError("Option '--space-id' requires a value.", 2);
      }
      option = value;
      if (inlineValue === undefined) {
        index += 1;
      }
    } else if (argument?.startsWith("--")) {
      throw new CliError(`Unknown option '${argument}'.`, 2);
    } else if (positional === undefined) {
      positional = argument;
    } else {
      throw new CliError(`Unexpected argument '${argument}'.`, 2);
    }
  }

  return { option, positional };
}

export const getSpaceCommand: Command = {
  name: "get",
  description: "Get details for one space",
  usage: "space-man space get [space-id] [--space-id <id>]",
  async run(args, context) {
    if (args.includes("--help") || args.includes("-h")) {
      context.output.text(
        `Usage: ${this.usage}\n\n${this.description}.\n\nOptions:\n  --space-id <id>  Storyblok space ID; defaults to STORYBLOK_SPACE_ID\n  --json           Emit machine-readable JSON\n  -h, --help       Show command help`,
      );
      return;
    }

    const spaceId = resolveSpaceId({
      ...parseSpaceIdArguments(args),
      environment: context.environment,
    });
    const token = getStoryblokToken(context.environment);
    const gateway = context.createGateway(token);
    const space = await getSpace(gateway, spaceId);

    if (context.output.mode === "json") {
      context.output.data(space);
    } else {
      context.output.summary(space.name, formatSpaceDetails(space));
    }
  },
};
