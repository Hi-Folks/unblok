import {
  applySpaceSetup,
  type ApplyOperation,
  type SpaceSetupApplyReport,
} from "../../actions/setup/apply-space-setup.ts";
import type { Command } from "../../cli/command.ts";
import { getStoryblokToken } from "../../config/environment.ts";
import { resolveSpaceId } from "../../config/space-id.ts";
import { CliError } from "../../errors.ts";
import { loadSpaceSetup } from "../../setup/load-setup.ts";
import { parseSpaceApplyOptions } from "./apply-options.ts";
import { formatStatus } from "../../reporting.ts";

function formatOperation(operation: ApplyOperation): string {
  const base = `${operation.status.padEnd(11)} ${operation.resource.padEnd(12)} ${operation.key}`;
  return operation.error ? `${base} · ${operation.error}` : base;
}

function formatSummary(report: SpaceSetupApplyReport): string {
  const summary = report.summary;
  return [
    `${summary.created} created`,
    `${summary.updated} updated`,
    `${summary.unchanged} unchanged`,
    `${summary.unsupported} unsupported`,
    `${summary.failed} failed`,
  ].join(" · ");
}

export const applySpaceCommand: Command = {
  name: "apply",
  description: "Apply supported resources from a space setup",
  usage: "space-man space apply --config <path> [--space-id <id>] --yes",
  async run(args, context) {
    if (args.includes("--help") || args.includes("-h")) {
      context.output.text(
        `Usage: ${this.usage}\n\n${this.description}. Languages and components are supported; other resources are left untouched.\n\nOptions:\n  --config <path>  YAML or JSON setup file\n  --space-id <id>  Target space; defaults to STORYBLOK_SPACE_ID\n  --yes            Confirm mutation after reviewing 'space plan'\n  --json           Emit a versioned machine-readable report\n  -h, --help       Show command help`,
      );
      return;
    }

    const options = parseSpaceApplyOptions(args);
    const setup = await loadSpaceSetup(options.config);
    const spaceId = resolveSpaceId({
      environment: context.environment,
      option: options.spaceId,
    });
    const gateway = context.createGateway(
      getStoryblokToken(context.environment),
    );
    const progress = context.output.task(`Applying setup to space ${spaceId}`);
    let report: SpaceSetupApplyReport;

    try {
      report = await applySpaceSetup(gateway, setup, spaceId, {
        onOperation(operation) {
          progress.message(formatOperation(operation));
        },
      });
      if (report.summary.failed > 0)
        progress.error("Setup finished with failures");
      else progress.success("Setup finished");
    } catch (error) {
      progress.error("Setup could not be applied");
      throw error;
    }

    if (context.output.mode === "json") {
      context.output.data(report);
    } else {
      const { created, updated, unchanged, unsupported, failed } =
        report.summary;
      const title =
        failed > 0
          ? created + updated + unchanged > 0
            ? "Setup: partial"
            : "Setup: failed"
          : unsupported > 0
            ? "Setup: warnings"
            : "Setup: complete";
      const details = report.operations.map((operation) =>
        formatStatus(
          operation.status,
          `${operation.resource} ${operation.key}`,
          operation.error ??
            (operation.status === "unchanged"
              ? "Already matches the requested state."
              : operation.status === "unsupported"
                ? "This resource is not supported by this setup format."
                : undefined),
          context.output.style,
        ),
      );
      context.output.summary(
        title,
        [
          `Space  ${spaceId}`,
          `Setup  ${report.config.name}`,
          "",
          ...(details.length ? details : ["No resources declared."]),
          "",
          formatSummary(report),
        ].join("\n"),
      );
    }

    if (report.summary.failed > 0) {
      throw new CliError(
        `${report.summary.failed} setup operation(s) failed. Review the apply report.`,
      );
    }
  },
};
