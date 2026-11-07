import type { Command } from "../../cli/command.ts";
import { listSpaces } from "../../actions/spaces/list-spaces.ts";
import { getStoryblokToken } from "../../config/environment.ts";
import { parseSpaceListOptions } from "./list-options.ts";
import { formatSpaceList } from "./presentation.ts";

const HELP = `Usage: space-man space list [options]

List spaces available to the current user.

Options:
  --search <text>           Filter spaces by name
  --owned-only             Show only spaces owned by the current user
  --updated-before <days>  Show spaces not updated within the given number of days
  --solo-only              Show owned spaces with no collaborators
  --json                   Emit machine-readable JSON
  -h, --help               Show command help`;

export const listSpacesCommand: Command = {
  name: "list",
  description: "List spaces available to the current user",
  usage: "space-man space list",
  async run(args, context) {
    if (args.includes("--help") || args.includes("-h")) {
      context.output.text(HELP);
      return;
    }

    const options = parseSpaceListOptions(args);
    const token = getStoryblokToken(context.environment);
    const gateway = context.createGateway(token);
    let spaces;

    if (options.soloOnly) {
      const inspection = context.output.task(
        "Finding owned spaces without collaborators",
      );

      try {
        spaces = await listSpaces(gateway, {
          ...options,
          onInspection(result) {
            inspection.message(
              `${result.checked}/${result.total} · ${result.space.name}${result.isSolo ? " · solo" : ""}`,
            );
          },
        });
        inspection.success(
          `Found ${spaces.length} solo ${spaces.length === 1 ? "space" : "spaces"}`,
        );
      } catch (error) {
        inspection.error("Could not finish checking collaborators");
        throw error;
      }
    } else {
      spaces = await context.output.activity(
        "Loading Storyblok spaces",
        "Spaces loaded",
        () => listSpaces(gateway, options),
      );
    }

    if (context.output.mode === "json") {
      context.output.data(spaces);
    } else if (spaces.length === 0) {
      context.output.info("No Storyblok spaces found.");
    } else {
      context.output.text(formatSpaceList(spaces, context.output.width?.()));
    }
  },
};
