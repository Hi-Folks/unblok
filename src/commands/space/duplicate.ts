import type { Command } from "../../cli/command.ts";
import { duplicateSpace } from "../../actions/spaces/duplicate-space.ts";
import { getStoryblokToken } from "../../config/environment.ts";
import { parseDuplicateSpaceOptions } from "./duplicate-options.ts";
import { formatDuplicatedSpace } from "./presentation.ts";

const HELP = `Usage: space-man space duplicate <source-space-id> <name> [options]
       space-man space duplicate <source-space-id> --name <name> [options]

Duplicate a space, including its content entries and components. Assets remain
references to the source space.

Options:
  --name <name>        Name for the duplicated space
  --in-org             Create the space inside the current organization
  --space-type <type>  Organization space type, when required by the plan
  --assign-partner     Assign the current user's partner to the space
  --demo               Mark the duplicated space as a demo space
  --only-id            Print only the new space ID
  --json               Emit the complete created space as JSON
  -h, --help           Show command help`;

export const duplicateSpaceCommand: Command = {
  name: "duplicate",
  description: "Duplicate a Storyblok space",
  usage: "space-man space duplicate <source-space-id> <name>",
  async run(args, context) {
    if (args.includes("--help") || args.includes("-h")) {
      context.output.text(HELP);
      return;
    }

    const options = parseDuplicateSpaceOptions(args);
    const { onlyId, ...duplicateOptions } = options;
    const token = getStoryblokToken(context.environment);
    const gateway = context.createGateway(token);
    const space = await context.output.activity(
      `Duplicating space ${options.sourceSpaceId}`,
      "Space duplication started",
      () => duplicateSpace(gateway, duplicateOptions),
    );

    if (onlyId) {
      if (context.output.mode === "json") {
        context.output.data(space.id);
      } else {
        context.output.text(String(space.id));
      }
    } else if (context.output.mode === "json") {
      context.output.data(space);
    } else {
      context.output.note(
        "Space duplicated",
        formatDuplicatedSpace(space, options.sourceSpaceId),
      );
    }
  },
};
