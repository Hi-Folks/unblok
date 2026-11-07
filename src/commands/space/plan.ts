import {
  planSpaceSetup,
  type SpaceSetupPlan,
} from "../../actions/setup/plan-space-setup.ts";
import { listLanguages } from "../../actions/languages/language.ts";
import { listComponents } from "../../actions/components/component.ts";
import type { Command } from "../../cli/command.ts";
import { getStoryblokToken } from "../../config/environment.ts";
import { resolveSpaceId } from "../../config/space-id.ts";
import { loadSpaceSetup } from "../../setup/load-setup.ts";
import { parseSpacePlanOptions } from "./plan-options.ts";

function formatPlan(plan: SpaceSetupPlan): string {
  if (plan.operations.length === 0) {
    return "No resource operations declared.";
  }

  return plan.operations
    .map(
      (operation) =>
        `${operation.status.padEnd(9)} ${operation.action.padEnd(7)} ${operation.resource.padEnd(12)} ${operation.key}`,
    )
    .join("\n");
}

export const planSpaceCommand: Command = {
  name: "plan",
  description: "Validate and preview a repeatable space setup",
  usage: "space-man space plan --config <path>",
  async run(args, context) {
    if (args.includes("--help") || args.includes("-h")) {
      context.output.text(
        `Usage: ${this.usage}\n\n${this.description}. The command never changes Storyblok.\n\nOptions:\n  --config <path>  YAML or JSON setup file\n  --space-id <id>  Compare supported resources with a target space\n  --json           Emit a versioned machine-readable plan\n  -h, --help       Show command help`,
      );
      return;
    }

    const options = parseSpacePlanOptions(args);
    const setup = await loadSpaceSetup(options.config);
    let current = {};

    if (options.spaceId) {
      const spaceId = resolveSpaceId({
        environment: context.environment,
        option: options.spaceId,
      });
      const gateway = context.createGateway(
        getStoryblokToken(context.environment),
      );
      const [components, languages] = await context.output.activity(
        `Comparing setup with space ${spaceId}`,
        "Remote state loaded",
        () =>
          Promise.all([
            listComponents(gateway, spaceId),
            listLanguages(gateway, spaceId),
          ]),
      );
      current = { components, languages, spaceId };
    }

    const plan = planSpaceSetup(setup, current);

    if (context.output.mode === "json") {
      context.output.data(plan);
      return;
    }

    context.output.note(
      `Setup plan: ${plan.config.name}`,
      `${formatPlan(plan)}\n\n${plan.summary.planned} operation(s): ${plan.summary.changes} change(s), ${plan.summary.unchanged} unchanged, ${plan.summary.pending} pending comparison; no changes were made.`,
    );
  },
};
