import { syncStoryPath } from "../../actions/stories/sync-path.ts";
import type { Command } from "../../cli/command.ts";
import { getStoryblokToken } from "../../config/environment.ts";
import { resolveSpaceId } from "../../config/space-id.ts";
import { CliError } from "../../errors.ts";

export const storySyncPathCommand: Command = {
  name: "sync-path",
  description: "Copy a block or field by JSON Pointer path",
  usage:
    "unblok story sync-path --source <story> --target <story> --path <json-pointer> (--plan | --yes) [--space-id <id>] [--json]",
  async run(args, context) {
    if (args.includes("--help") || args.includes("-h")) {
      context.output.text(
        `Usage: ${this.usage}\n\nCopy the selected block or field at the same position in both stories. Block UIDs are preserved. Use --plan to preview or --yes to update the target draft.`,
      );
      return;
    }
    const values: Record<string, string> = {};
    let plan = false,
      yes = false;
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
      if (
        !["--source", "--target", "--path", "--space-id"].includes(key) ||
        values[key] !== undefined
      )
        throw new CliError(`Unknown or repeated option '${arg}'.`, 2);
      const value = equal < 0 ? args[++i] : arg.slice(equal + 1);
      if (!value || value.startsWith("--") || value !== value.trim())
        throw new CliError(`Option '${key}' requires a value.`, 2);
      values[key] = value;
    }
    if (
      !values["--source"] ||
      !values["--target"] ||
      !values["--path"] ||
      plan === yes
    )
      throw new CliError(
        "Provide --source, --target, --path and exactly one of --plan or --yes.",
        2,
      );
    const spaceId = resolveSpaceId({
      environment: context.environment,
      option: values["--space-id"],
    });
    const gateway = context.createGateway(
      getStoryblokToken(context.environment),
    );
    const report = await context.output.activity(
      "Checking story path",
      "Story path checked",
      () =>
        syncStoryPath(gateway, {
          spaceId,
          source: values["--source"]!,
          target: values["--target"]!,
          path: values["--path"]!,
          apply: yes,
        }),
    );
    if (context.output.mode === "json") context.output.data(report);
    else if (report.status === "unchanged")
      context.output.info("Selected values already match.");
    else
      context.output.text(
        `${report.status === "planned" ? "Planned" : "Updated"}: ${report.source.fullSlug} → ${report.target.fullSlug}\nPath: ${report.path}\nBefore: ${JSON.stringify(report.before, null, 2)}\nAfter: ${JSON.stringify(report.after, null, 2)}`,
      );
  },
};
