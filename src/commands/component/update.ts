import { updateComponent } from "../../actions/components/component.ts";
import type { Command } from "../../cli/command.ts";
import { getStoryblokToken } from "../../config/environment.ts";
import { resolveSpaceId } from "../../config/space-id.ts";
import { loadComponentDefinition } from "./definition.ts";
import { parseComponentUpdateOptions } from "./options.ts";
import { formatComponentDetails } from "./presentation.ts";

export const updateComponentCommand: Command = {
  name: "update",
  description: "Update a component from a definition file",
  usage: "space-man component update <id-or-name> --file <path> [options]",
  async run(args, context) {
    if (args.includes("--help") || args.includes("-h")) {
      context.output.text(
        `Usage: ${this.usage}\n\n${this.description}.\n\nOptions:\n  --file <path>    YAML or JSON component definition\n  --space-id <id>  Target space; defaults to STORYBLOK_SPACE_ID\n  --json           Emit machine-readable JSON\n  -h, --help       Show command help`,
      );
      return;
    }
    const options = parseComponentUpdateOptions(args);
    const definition = await loadComponentDefinition(options.file);
    const spaceId = resolveSpaceId({
      environment: context.environment,
      option: options.spaceId,
    });
    const gateway = context.createGateway(
      getStoryblokToken(context.environment),
    );
    const component = await context.output.activity(
      `Updating component ${options.reference}`,
      "Component updated",
      () => updateComponent(gateway, spaceId, options.reference, definition),
    );
    if (context.output.mode === "json") context.output.data(component);
    else
      context.output.note(
        "Component updated",
        formatComponentDetails(component),
      );
  },
};
