import { listComponents } from "../../actions/components/component.ts";
import type { Command } from "../../cli/command.ts";
import { getStoryblokToken } from "../../config/environment.ts";
import { resolveSpaceId } from "../../config/space-id.ts";
import { parseComponentListOptions } from "./options.ts";
import { formatComponentList } from "./presentation.ts";

export const listComponentsCommand: Command = {
  name: "list",
  description: "List components in a space",
  usage: "space-man component list [options]",
  async run(args, context) {
    if (args.includes("--help") || args.includes("-h")) {
      context.output.text(
        `Usage: ${this.usage}\n\n${this.description}.\n\nOptions:\n  --search <text>  Filter components by name\n  --space-id <id>  Target space; defaults to STORYBLOK_SPACE_ID\n  --json           Emit machine-readable JSON\n  -h, --help       Show command help`,
      );
      return;
    }
    const options = parseComponentListOptions(args);
    const spaceId = resolveSpaceId({
      environment: context.environment,
      option: options.spaceId,
    });
    const gateway = context.createGateway(
      getStoryblokToken(context.environment),
    );
    const components = await context.output.activity(
      `Loading components from space ${spaceId}`,
      "Components loaded",
      () => listComponents(gateway, spaceId, options.search),
    );
    if (context.output.mode === "json") context.output.data(components);
    else if (components.length === 0)
      context.output.info("No components found.");
    else
      context.output.text(
        formatComponentList(components, context.output.width?.()),
      );
  },
};
