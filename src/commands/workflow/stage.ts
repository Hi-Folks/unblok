import {
  listWorkflowStages,
  resolveWorkflowStage,
} from "../../actions/workflows/workflow.ts";
import type { Command } from "../../cli/command.ts";
import { dispatch } from "../../cli/dispatch.ts";
import { getStoryblokToken } from "../../config/environment.ts";
import { resolveSpaceId } from "../../config/space-id.ts";
import { parseWorkflowOptions } from "./options.ts";
import { formatWorkflowStageList } from "./presentation.ts";

const listCommand: Command = {
  name: "list",
  description: "List workflow stages",
  usage: "space-man workflow stage list [options]",
  async run(args, context) {
    if (args.includes("--help") || args.includes("-h")) {
      context.output.text(
        `Usage: ${this.usage}\n\n${this.description}.\n\nOptions:\n  --workflow <name-or-id>  Filter by exact workflow\n  --search <text>          Filter stage names\n  --space-id <id>          Target space; defaults to STORYBLOK_SPACE_ID\n  --json                   Emit machine-readable JSON\n  -h, --help               Show command help`,
      );
      return;
    }
    const options = parseWorkflowOptions(args);
    if (options.reference)
      throw new Error(`Unexpected argument '${options.reference}'.`);
    const spaceId = resolveSpaceId({
      environment: context.environment,
      option: options.spaceId,
    });
    const gateway = context.createGateway(
      getStoryblokToken(context.environment),
    );
    const stages = await context.output.activity(
      `Loading workflow stages from space ${spaceId}`,
      "Workflow stages loaded",
      () => listWorkflowStages(gateway, spaceId, options),
    );
    if (context.output.mode === "json") context.output.data(stages);
    else if (stages.length === 0)
      context.output.info("No workflow stages found.");
    else
      context.output.text(
        formatWorkflowStageList(stages, context.output.width?.()),
      );
  },
};

const getCommand: Command = {
  name: "get",
  description: "Get a workflow stage by ID or exact name",
  usage: "space-man workflow stage get <id-or-name> [options]",
  async run(args, context) {
    if (args.includes("--help") || args.includes("-h")) {
      context.output.text(
        `Usage: ${this.usage}\n\n${this.description}.\n\nOptions:\n  --workflow <name-or-id>  Resolve an ambiguous stage name\n  --space-id <id>          Target space; defaults to STORYBLOK_SPACE_ID\n  --json                   Emit machine-readable JSON\n  -h, --help               Show command help`,
      );
      return;
    }
    const options = parseWorkflowOptions(args);
    if (!options.reference)
      throw new Error("A workflow stage ID or name is required.");
    if (options.search) throw new Error("Option '--search' is not valid here.");
    const spaceId = resolveSpaceId({
      environment: context.environment,
      option: options.spaceId,
    });
    const gateway = context.createGateway(
      getStoryblokToken(context.environment),
    );
    const stage = await context.output.activity(
      `Loading workflow stage ${options.reference}`,
      "Workflow stage loaded",
      () =>
        resolveWorkflowStage(
          gateway,
          spaceId,
          options.reference as string,
          options.workflow,
        ),
    );
    if (context.output.mode === "json") context.output.data(stage);
    else
      context.output.note(
        stage.name,
        `ID: ${stage.id}\nWorkflow ID: ${stage.workflow_id ?? "—"}\nPosition: ${stage.position}\nColor: ${stage.color}`,
      );
  },
};

export const workflowStageCommand: Command = {
  name: "stage",
  description: "Inspect workflow stages",
  usage: "space-man workflow stage <command>",
  async run(args, context) {
    await dispatch(
      "space-man workflow stage",
      [listCommand, getCommand],
      args,
      context,
    );
  },
};
