import { getComponent } from "../../actions/components/component.ts";
import type { Command } from "../../cli/command.ts";
import { getStoryblokToken } from "../../config/environment.ts";
import { resolveSpaceId } from "../../config/space-id.ts";
import { parseComponentGetOptions } from "./options.ts";
import { formatComponentDetails } from "./presentation.ts";

export const getComponentCommand: Command = {
  name: "get",
  description: "Get a component by ID or exact name",
  usage: "space-man component get <id-or-name> [--space-id <id>]",
  async run(args, context) {
    if (args.includes("--help") || args.includes("-h")) {
      context.output.text(
        `Usage: ${this.usage}\n\n${this.description}.\n\nOptions:\n  --space-id <id>  Target space; defaults to STORYBLOK_SPACE_ID\n  --json           Emit machine-readable JSON\n  -h, --help       Show command help`,
      );
      return;
    }
    const options = parseComponentGetOptions(args);
    const spaceId = resolveSpaceId({
      environment: context.environment,
      option: options.spaceId,
    });
    const gateway = context.createGateway(
      getStoryblokToken(context.environment),
    );
    const component = await context.output.activity(
      `Loading component ${options.reference}`,
      "Component loaded",
      () => getComponent(gateway, spaceId, options.reference),
    );
    if (context.output.mode === "json") context.output.data(component);
    else context.output.note(component.name, formatComponentDetails(component));
  },
};
