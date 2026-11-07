import { listWorkflows } from "../../actions/workflows/workflow.ts";
import type { Command } from "../../cli/command.ts";
import { getStoryblokToken } from "../../config/environment.ts";
import { resolveSpaceId } from "../../config/space-id.ts";
import { parseWorkflowOptions } from "./options.ts";
import { formatWorkflowList } from "./presentation.ts";

export const listWorkflowsCommand: Command = {
  name: "list",
  description: "List workflows in a space",
  usage: "space-man workflow list [--space-id <id>]",
  async run(args, context) {
    if (args.includes("--help") || args.includes("-h")) {
      context.output.text(
        `Usage: ${this.usage}\n\n${this.description}.\n\nOptions:\n  --space-id <id>  Target space; defaults to STORYBLOK_SPACE_ID\n  --json           Emit machine-readable JSON\n  -h, --help       Show command help`,
      );
      return;
    }
    const options = parseWorkflowOptions(args);
    if (options.reference || options.search || options.workflow) {
      throw new Error("Workflow list only accepts '--space-id'.");
    }
    const spaceId = resolveSpaceId({
      environment: context.environment,
      option: options.spaceId,
    });
    const gateway = context.createGateway(
      getStoryblokToken(context.environment),
    );
    const workflows = await context.output.activity(
      `Loading workflows from space ${spaceId}`,
      "Workflows loaded",
      () => listWorkflows(gateway, spaceId),
    );
    if (context.output.mode === "json") context.output.data(workflows);
    else if (workflows.length === 0) context.output.info("No workflows found.");
    else
      context.output.text(
        formatWorkflowList(workflows, context.output.width?.()),
      );
  },
};
