import { getDimensionsCoverage } from "../../actions/apps/dimensions-coverage.ts";
import type { Command } from "../../cli/command.ts";
import { formatColumns } from "../../cli/columns.ts";
import { getStoryblokToken } from "../../config/environment.ts";
import { resolveSpaceId } from "../../config/space-id.ts";
import { CliError } from "../../errors.ts";

export const dimensionsCoverageCommand: Command = {
  name: "coverage",
  description: "Report linked story variants across Dimensions folders",
  usage:
    "unblok dimensions coverage --starts-with <source-folder-path> [--folder <root-folder>...] [--space-id <id>] [--json]",
  async run(args, context) {
    if (args.includes("--help") || args.includes("-h")) {
      context.output.text(
        `Usage: ${this.usage}\n\nReport linked variants for stories beneath a configured Dimensions folder. Repeat --folder to select destinations; otherwise all other configured folders are checked. Missing means no linked alternate was returned, not that a similarly named story is absent. Read-only; --json provides the structured report.`,
      );
      return;
    }
    let startsWith: string | undefined, spaceIdOption: string | undefined;
    const folders: string[] = [];
    for (let i = 0; i < args.length; i++) {
      const arg = args[i]!;
      const split = arg.indexOf("=");
      const key = split < 0 ? arg : arg.slice(0, split);
      if (!["--starts-with", "--folder", "--space-id"].includes(key))
        throw new CliError(`Unknown argument '${arg}'.`, 2);
      const value = split < 0 ? args[++i] : arg.slice(split + 1);
      if (!value || value.startsWith("--") || value !== value.trim())
        throw new CliError(`Option '${key}' requires a value.`, 2);
      if (key === "--folder") {
        if (folders.includes(value))
          throw new CliError(
            `Folder '${value}' was provided more than once.`,
            2,
          );
        folders.push(value);
      } else if (key === "--starts-with") {
        if (startsWith !== undefined)
          throw new CliError("Provide one source path.", 2);
        startsWith = value;
      } else {
        if (spaceIdOption !== undefined)
          throw new CliError("Provide one space ID.", 2);
        spaceIdOption = value;
      }
    }
    if (!startsWith)
      throw new CliError(
        "Provide '--starts-with' with a source folder path.",
        2,
      );
    const spaceId = resolveSpaceId({
      environment: context.environment,
      option: spaceIdOption,
    });
    const gateway = context.createGateway(
      getStoryblokToken(context.environment),
    );
    const statusLabel = (status: "linked" | "missing") =>
      context.output.style?.(
        status === "linked" ? "green" : "yellow",
        status,
      ) ?? status;
    const progress =
      context.output.mode === "human" && context.output.canPrompt
        ? context.output.task("Checking Dimensions coverage")
        : undefined;
    let report: Awaited<ReturnType<typeof getDimensionsCoverage>>;
    try {
      report = await getDimensionsCoverage(
        gateway,
        { spaceId, startsWith, ...(folders.length ? { folders } : {}) },
        context.output.mode === "human"
          ? {
              onProgress: ({ current, total, story }) => {
                const detail = `${current}/${total} · ${story.fullSlug} · ${story.variants.map((variant) => `${variant.folder}: ${statusLabel(variant.status)}`).join(" · ")}`;
                if (progress) progress.message(detail);
                else context.output.text(detail);
              },
            }
          : undefined,
      );
      progress?.success("Coverage report ready");
    } catch (error) {
      progress?.error("Coverage check failed");
      throw error;
    }
    if (context.output.mode === "json") context.output.data(report);
    else if (!report.stories.length)
      context.output.info(`No stories found under '${report.startsWith}'.`);
    else
      context.output.text(
        formatColumns(
          ["SOURCE STORY", ...report.folders],
          report.stories.map((story) => [
            story.fullSlug,
            ...story.variants.map((variant) => statusLabel(variant.status)),
          ]),
          context.output.width?.(),
          { wrapColumn: 0 },
        ),
      );
  },
};
