import { ensureDefaultWorkflow } from "../../actions/workflows/ensure-default.ts";
import type { Command } from "../../cli/command.ts";
import { getStoryblokToken } from "../../config/environment.ts";
import { resolveSpaceId } from "../../config/space-id.ts";
import { CliError } from "../../errors.ts";

export const ensureDefaultWorkflowCommand: Command = {
  name: "ensure-default",
  description: "Ensure the three standard stages in the default workflow",
  usage: "unblok workflow ensure-default [--space-id <id>] --yes",
  async run(args, context) {
    if (args.includes("--help") || args.includes("-h")) {
      context.output.text(
        `Usage: ${this.usage}\n\nCreate missing standard stages without modifying existing stages.\n\nOptions:\n  --space-id <id>  Target space; defaults to STORYBLOK_SPACE_ID\n  --yes            Confirm stage creation\n  --json           Emit a structured result\n  -h, --help       Show command help`,
      );
      return;
    }
    let spaceIdOption: string | undefined;
    let yes = false;
    for (let i = 0; i < args.length; i++) {
      const arg = args[i];
      if (arg === "--yes") {
        yes = true;
        continue;
      }
      if (arg === "--space-id" || arg?.startsWith("--space-id=")) {
        if (spaceIdOption !== undefined)
          throw new CliError("Option '--space-id' may only be used once.", 2);
        spaceIdOption =
          arg === "--space-id" ? args[++i] : arg.slice("--space-id=".length);
        if (!spaceIdOption || spaceIdOption.startsWith("--"))
          throw new CliError("Option '--space-id' requires a value.", 2);
      } else throw new CliError(`Unknown argument '${arg}'.`, 2);
    }
    if (!yes)
      throw new CliError(
        "Option '--yes' is required to create missing workflow stages.",
        2,
      );
    const spaceId = resolveSpaceId({
      environment: context.environment,
      option: spaceIdOption,
    });
    const gateway = context.createGateway(
      getStoryblokToken(context.environment),
    );
    const result = await context.output.activity(
      "Checking the default workflow",
      "Default workflow checked",
      () => ensureDefaultWorkflow(gateway, spaceId),
    );
    if (context.output.mode === "json") context.output.data(result);
    else
      context.output.note(
        `Default workflow: ${result.workflow.name}`,
        result.stages
          .map(
            (stage) => `${stage.status.padEnd(9)} ${stage.name} (${stage.id})`,
          )
          .join("\n"),
      );
  },
};
