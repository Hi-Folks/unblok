import type { Command } from "../../cli/command.ts";
import { dispatch } from "../../cli/dispatch.ts";
import { loadBlueprint } from "../../setup/blueprint-loader.ts";
import { getStoryblokToken } from "../../config/environment.ts";
import { resolveSpaceId } from "../../config/space-id.ts";
import { CliError, formatError } from "../../errors.ts";
import { planBlueprint } from "../../setup/blueprint.ts";
import { compileExperiments } from "../../setup/blueprint-experiments.ts";
import { compileReleases } from "../../setup/blueprint-releases.ts";
import { compilePipelineBranches } from "../../setup/blueprint-pipelines.ts";
import { resolveBlueprint } from "../../setup/blueprint-validation.ts";
import {
  applySupportedBlueprint,
  compileSupportedBlueprint,
  type BlueprintProgress,
} from "../../setup/blueprint-apply.ts";
import {
  compileBlueprintTarget,
  createBlueprintTarget,
  waitForBlueprintTarget,
} from "../../setup/blueprint-target.ts";
import { prepareAssets } from "../../setup/blueprint-assets.ts";
import {
  finishBlueprintReport,
  formatBlueprintReport,
} from "../../setup/blueprint-report.ts";

function formatProgress(progress: BlueprintProgress): string {
  const labels: Record<BlueprintProgress["stage"], string> = {
    space: "Configuring space",
    "ai-translation": "Enabling AI Translations",
    apps: "Installing apps",
    components: "Configuring components",
    assets: "Managing assets",
    stories: "Configuring stories",
    "translate-content": "Translating content",
    "workflow-settings": "Configuring workflows",
    workflow: "Assigning workflow stages",
    tags: "Assigning tags",
    experiments: "Configuring experiments",
    releases: "Configuring releases",
    pipelines: "Configuring pipeline stages",
  };
  return labels[progress.stage];
}

function formatProgressDetail(progress: BlueprintProgress): string | undefined {
  if (!progress.current && !progress.item) return undefined;
  const count =
    progress.current && progress.total
      ? `${progress.current}/${progress.total}`
      : progress.current
        ? `${progress.current} processed`
        : "";
  return `${progress.failed ? "Failed: " : ""}${[count, progress.item].filter(Boolean).join(" · ")}`;
}

function parseArgs(args: string[]): {
  config: string;
  inputs: Record<string, string>;
} {
  let config: string | undefined;
  const inputs: Record<string, string> = Object.create(null);
  for (let i = 0; i < args.length; i++) {
    const argument = args[i]!;
    const separator = argument.indexOf("=");
    const option = separator < 0 ? argument : argument.slice(0, separator);
    if (option !== "--config" && option !== "--input")
      throw new CliError(`Unknown argument '${argument}'.`, 2);
    const value = separator < 0 ? args[++i] : argument.slice(separator + 1);
    if (!value || value.startsWith("--"))
      throw new CliError(`Option '${option}' requires a value.`, 2);
    if (option === "--config") {
      if (config) throw new CliError("Duplicate --config.", 2);
      config = value;
    } else {
      const split = value.indexOf("=");
      const name = value.slice(0, split);
      if (
        split <= 0 ||
        !/^[a-zA-Z_][a-zA-Z0-9_]*$/.test(name) ||
        !value.slice(split + 1).trim()
      )
        throw new CliError("Use --input name=value.", 2);
      if (Object.hasOwn(inputs, name))
        throw new CliError(`Duplicate input '${name}'.`, 2);
      inputs[name] = value.slice(split + 1);
    }
  }
  if (!config)
    throw new CliError("Provide a setup file with '--config <path>'.", 2);
  return { config, inputs };
}

const plan: Command = {
  name: "plan",
  description: "Inspect a version 1 setup blueprint",
  usage: "unblok space setup plan --config <path>",
  async run(args, context) {
    if (args.includes("--help") || args.includes("-h")) {
      context.output.text(
        `Usage: ${this.usage}\n\nValidate and resolve a version 1 blueprint locally. No Storyblok state is read or changed.\n\nOptions:\n  --config <path>       YAML or JSON blueprint\n  --input <name=value>  Override an input (repeatable)\n  --json                Emit machine-readable output\n  -h, --help            Show command help`,
      );
      return;
    }
    const options = parseArgs(args);
    const blueprint = resolveBlueprint(
      await loadBlueprint(options.config),
      options.inputs,
    );
    if (blueprint.experiments !== undefined)
      compileExperiments(blueprint.experiments);
    if (blueprint.releases !== undefined) compileReleases(blueprint.releases);
    if (blueprint.pipelines !== undefined)
      compilePipelineBranches(blueprint.pipelines);
    const result = {
      ...planBlueprint(blueprint),
      resolvedBlueprint: blueprint,
    };
    if (context.output.mode === "json") context.output.data(result);
    else
      context.output.note(
        `Blueprint: ${result.name}`,
        `${result.operations.map((item) => `${item.support.padEnd(15)} ${item.path} · ${item.operation}${item.count === undefined ? "" : ` (${item.count})`}`).join("\n")}\n\n${result.summary.available} available · ${result.summary.notImplemented} not implemented\n${result.note}\n\nResolved blueprint:\n${JSON.stringify(blueprint, null, 2)}`,
      );
  },
};

export const spaceSetupCommand: Command = {
  name: "setup",
  description: "Inspect version 1 setup blueprints",
  async run(args, context) {
    await dispatch("unblok space setup", [plan, apply], args, context);
  },
};

const apply: Command = {
  name: "apply",
  description:
    "Create or select a space and apply supported blueprint operations",
  usage: "unblok space setup apply --config <path> [--space-id <id>] --yes",
  async run(args, context) {
    if (args.includes("--help") || args.includes("-h")) {
      context.output.text(
        `Usage: ${this.usage}\n\nCreate a space from space.duplicate_from, or use --space-id to select an existing space. Supports languages, preview, demo mode, apps, component fields, assets, stories, workflows and tags; unsupported sections are rejected before changes.\n\nOptions:\n  --config <path>             YAML or JSON blueprint\n  --space-id <id>             Apply to an existing space\n  --input <name=value>        Override a declared input (repeatable)\n  --continue-after-duplicate  Skip the post-duplication confirmation (required in noninteractive mode)\n  --yes                       Authorize changes\n  --json                      Emit machine-readable output\n  -h, --help                  Show command help`,
      );
      return;
    }
    let config: string | undefined;
    let spaceIdOption: string | undefined;
    let yes = false;
    let continueAfterDuplicate = false;
    const inputs: Record<string, string> = Object.create(null);
    for (let i = 0; i < args.length; i++) {
      const argument = args[i];
      if (argument === "--yes") {
        yes = true;
        continue;
      }
      if (argument === "--continue-after-duplicate") {
        continueAfterDuplicate = true;
        continue;
      }
      const key = argument?.split("=", 1)[0];
      if (key !== "--config" && key !== "--space-id" && key !== "--input")
        throw new CliError(`Unknown argument '${argument}'.`, 2);
      const separator = argument?.indexOf("=") ?? -1;
      const value = separator >= 0 ? argument?.slice(separator + 1) : args[++i];
      if (!value || value.startsWith("--"))
        throw new CliError(`Option '${key}' requires a value.`, 2);
      if (key === "--config") {
        if (config) throw new CliError("Duplicate --config.", 2);
        config = value;
      } else if (key === "--space-id") {
        if (spaceIdOption) throw new CliError("Duplicate --space-id.", 2);
        spaceIdOption = value;
      } else {
        const split = value.indexOf("=");
        const name = value.slice(0, split);
        if (
          split <= 0 ||
          !/^[a-zA-Z_][a-zA-Z0-9_]*$/.test(name) ||
          !value.slice(split + 1).trim()
        )
          throw new CliError("Use --input name=value.", 2);
        if (Object.hasOwn(inputs, name))
          throw new CliError(`Duplicate input '${name}'.`, 2);
        inputs[name] = value.slice(split + 1);
      }
    }
    if (!config || !yes)
      throw new CliError("Options '--config' and '--yes' are required.", 2);
    const resolved = resolveBlueprint(await loadBlueprint(config), inputs);
    const blueprint = compileSupportedBlueprint(resolved);
    const target = spaceIdOption ? undefined : compileBlueprintTarget(resolved);
    if (
      target &&
      !continueAfterDuplicate &&
      (context.output.mode === "json" || context.output.canPrompt === false)
    )
      throw new CliError(
        "Creating a space requires an interactive confirmation or --continue-after-duplicate.",
        2,
      );
    let spaceId = spaceIdOption
      ? resolveSpaceId({ environment: {}, option: spaceIdOption })
      : 0;
    let assets: Awaited<ReturnType<typeof prepareAssets>>;
    try {
      assets = await prepareAssets(
        blueprint.assets,
        config,
        blueprint.remoteAssets,
      );
    } catch (error) {
      const report = finishBlueprintReport(
        spaceId || undefined,
        [
          {
            operation: "prepare-assets",
            key: "assets",
            status: "failed",
            error: error instanceof Error ? error.message : "Unexpected error",
          },
        ],
        [{ operation: "apply-setup", key: "all setup operations" }],
      );
      if (context.output.mode === "json") context.output.data(report);
      else
        context.output.summary(
          spaceId ? "Setup incomplete" : "Setup did not start",
          formatBlueprintReport(report, context.output.style),
        );
      throw error;
    }
    const gateway = context.createGateway(
      getStoryblokToken(context.environment),
    );
    if (target) {
      let created: Awaited<ReturnType<typeof createBlueprintTarget>>;
      try {
        created = await createBlueprintTarget(gateway, target);
      } catch (error) {
        const report = finishBlueprintReport(
          undefined,
          [
            {
              operation: "duplicate-space",
              key: String(target.duplicate.sourceSpaceId),
              status: "failed",
              error: formatError(error),
            },
          ],
          [{ operation: "apply-setup", key: "all setup operations" }],
        );
        if (context.output.mode === "json") context.output.data(report);
        else
          context.output.summary(
            "Space duplication failed",
            `${formatBlueprintReport(report, context.output.style)}\nCheck the organization before retrying.`,
          );
        throw error;
      }
      spaceId = created.id;
      const url = `https://app.storyblok.com/#/me/spaces/${spaceId}/dashboard`;
      if (context.output.mode === "human")
        context.output.note(
          "Space created",
          `Name: ${created.name}\nID: ${spaceId}\nSource ID: ${target.duplicate.sourceSpaceId}\nStatus: ${created.duplication_status ?? "started"}\nDashboard: ${url}`,
        );
      if (
        !continueAfterDuplicate &&
        !(await context.output.confirm("Continue with the remaining setup?"))
      ) {
        context.output.info(
          `Setup stopped. Space ${spaceId} remains available: ${url}`,
        );
        return;
      }
      try {
        await context.output.activity(
          "Waiting for space duplication",
          "Space is ready",
          () => waitForBlueprintTarget(gateway, spaceId, target),
        );
      } catch (error) {
        const report = finishBlueprintReport(
          spaceId,
          [
            {
              operation: "wait-for-duplication",
              key: String(spaceId),
              status: "failed",
              error: formatError(error),
            },
          ],
          [{ operation: "apply-setup", key: "all setup operations" }],
        );
        if (context.output.mode === "json") context.output.data(report);
        else
          context.output.summary(
            "Setup incomplete",
            formatBlueprintReport(report, context.output.style),
          );
        throw new CliError(
          `Space ${spaceId} was created, but readiness could not be confirmed: ${error instanceof Error ? error.message : "Unexpected error"} Resume with --space-id ${spaceId}.`,
        );
      }
    }
    if (
      !target &&
      resolved.space &&
      typeof resolved.space === "object" &&
      "readiness" in resolved.space &&
      "duplicate_from" in resolved.space
    ) {
      const resumeTarget = compileBlueprintTarget(resolved);
      try {
        await context.output.activity(
          "Checking space duplication",
          "Space is ready",
          () => waitForBlueprintTarget(gateway, spaceId, resumeTarget),
        );
      } catch (error) {
        const report = finishBlueprintReport(
          spaceId,
          [
            {
              operation: "wait-for-duplication",
              key: String(spaceId),
              status: "failed",
              error: formatError(error),
            },
          ],
          [{ operation: "apply-setup", key: "all setup operations" }],
        );
        if (context.output.mode === "json") context.output.data(report);
        else
          context.output.summary(
            "Setup incomplete",
            formatBlueprintReport(report, context.output.style),
          );
        throw new CliError(
          `Readiness of space ${spaceId} could not be confirmed: ${error instanceof Error ? error.message : "Unexpected error"}`,
        );
      }
    }
    let progress: ReturnType<typeof context.output.task> | undefined;
    let activeStage: BlueprintProgress["stage"] | undefined;
    let activeLabel = "";
    let stageFailed = false;
    const successMessage = () =>
      activeStage === "translate-content"
        ? "Translation requests submitted"
        : `${activeLabel} complete`;
    const showProgress = (event: BlueprintProgress) => {
      if (context.output.mode !== "human") return;
      if (event.stage !== activeStage) {
        if (progress) {
          if (stageFailed) progress.error(`${activeLabel} failed`);
          else progress.success(successMessage());
        }
        activeStage = event.stage;
        activeLabel = formatProgress(event);
        stageFailed = false;
        progress = context.output.task(activeLabel);
      }
      stageFailed ||= event.failed === true;
      const detail = formatProgressDetail(event);
      if (detail) progress?.message(detail);
    };
    let report: Awaited<ReturnType<typeof applySupportedBlueprint>>;
    try {
      report = await applySupportedBlueprint(
        gateway,
        spaceId,
        blueprint,
        assets,
        showProgress,
      );
    } catch (error) {
      progress?.error("Setup stopped unexpectedly");
      throw error;
    }
    const lastOperation = report.operations.findLast(
      (item) => item.status !== "not_run",
    );
    if (stageFailed || lastOperation?.status === "failed")
      progress?.error(`${activeLabel} failed`);
    else progress?.success(successMessage());
    if (context.output.mode === "json") context.output.data(report);
    else
      context.output.summary(
        report.failed ? "Setup incomplete" : "Setup complete",
        formatBlueprintReport(report, context.output.style),
      );
    if (report.failed)
      throw new CliError(
        "One or more blueprint operations failed; review the report.",
      );
    if (context.output.mode === "human")
      context.output.info(
        `Space dashboard: https://app.storyblok.com/#/me/spaces/${spaceId}/dashboard`,
      );
  },
};
