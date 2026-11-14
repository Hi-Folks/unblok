import { createMissingVariants } from "../../actions/apps/create-missing-variants.ts";
import type { Command } from "../../cli/command.ts";
import { getStoryblokToken } from "../../config/environment.ts";
import { resolveSpaceId } from "../../config/space-id.ts";
import { CliError } from "../../errors.ts";
import { formatColumns } from "../../cli/columns.ts";

export const createMissingCommand: Command = {
  name: "create-missing",
  description: "Plan or create missing linked Dimensions variants",
  usage:
    "unblok dimensions create-missing --starts-with <path> [--folder <root>...] (--plan | --yes) [--space-id <id>] [--json]",
  async run(args, context) {
    if (args.includes("--help") || args.includes("-h")) {
      context.output.text(
        `Usage: ${this.usage}\n\nUse --plan to inspect missing variants without writing. Use --yes to create them; existing links are preserved. Omit --folder to select all other configured Dimensions roots. Apply stops after the first failure; inspect the destination before retrying an unconfirmed write.`,
      );
      return;
    }
    let startsWith: string | undefined,
      spaceIdOption: string | undefined,
      plan = false,
      yes = false;
    const folders: string[] = [];
    for (let i = 0; i < args.length; i++) {
      const arg = args[i]!;
      if (arg === "--plan") {
        if (plan) throw new CliError("Repeated --plan.", 2);
        plan = true;
        continue;
      }
      if (arg === "--yes") {
        if (yes) throw new CliError("Repeated --yes.", 2);
        yes = true;
        continue;
      }
      const equal = arg.indexOf("=");
      const key = equal < 0 ? arg : arg.slice(0, equal);
      if (!["--starts-with", "--folder", "--space-id"].includes(key))
        throw new CliError(`Unknown argument '${arg}'.`, 2);
      const value = equal < 0 ? args[++i] : arg.slice(equal + 1);
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
    if (!startsWith || plan === yes)
      throw new CliError(
        "Provide --starts-with and exactly one of --plan or --yes.",
        2,
      );
    const spaceId = resolveSpaceId({
      environment: context.environment,
      option: spaceIdOption,
    });
    const gateway = context.createGateway(
      getStoryblokToken(context.environment),
    );
    const report = await context.output.activity(
      plan ? "Planning variants" : "Creating missing variants",
      "Variants checked",
      () =>
        createMissingVariants(gateway, {
          spaceId,
          startsWith: startsWith!,
          ...(folders.length ? { folders } : {}),
          apply: yes,
        }),
    );
    if (context.output.mode === "json") context.output.data(report);
    else if (!report.operations.length)
      context.output.info("No stories matched the source path.");
    else
      context.output.text(
        formatColumns(
          ["SOURCE STORY", "FOLDER", "STATUS", "DETAIL"],
          report.operations.map((item) => [
            item.source,
            item.folder,
            item.status,
            item.error?.message ?? item.story?.fullSlug ?? "—",
          ]),
          context.output.width?.(),
          { wrapColumn: 0 },
        ),
      );
    if (report.operations.some((item) => item.status === "failed"))
      throw new CliError(
        "Variant creation stopped after a failure; inspect the report before retrying.",
      );
  },
};
