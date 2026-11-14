import { syncBlockFields } from "../../actions/stories/sync-block-fields.ts";
import type { Command } from "../../cli/command.ts";
import { getStoryblokToken } from "../../config/environment.ts";
import { resolveSpaceId } from "../../config/space-id.ts";
import { CliError } from "../../errors.ts";

export const storySyncBlockCommand: Command = {
  name: "sync-block",
  description: "Copy selected fields between existing story blocks",
  usage:
    "unblok story sync-block --source <story> --target <story> --component <name> --field <name>... [--source-uid <uid>] [--target-uid <uid>] (--plan | --yes) [--space-id <id>] [--json]",
  async run(args, context) {
    if (args.includes("--help") || args.includes("-h")) {
      context.output.text(
        `Usage: ${this.usage}\n\nCopy complete selected field values from one existing block into another. Use --plan to preview or --yes to save a draft. Repeat --field. Use block UIDs when a component appears more than once. Other target fields are preserved.`,
      );
      return;
    }
    const values: Record<string, string> = {};
    const fields: string[] = [];
    let plan = false,
      yes = false;
    for (let i = 0; i < args.length; i++) {
      const arg = args[i]!;
      if (arg === "--plan") {
        plan = true;
        continue;
      }
      if (arg === "--yes") {
        yes = true;
        continue;
      }
      const equal = arg.indexOf("="),
        key = equal < 0 ? arg : arg.slice(0, equal);
      if (
        ![
          "--source",
          "--target",
          "--component",
          "--field",
          "--source-uid",
          "--target-uid",
          "--space-id",
        ].includes(key)
      )
        throw new CliError(`Unknown argument '${arg}'.`, 2);
      const value = equal < 0 ? args[++i] : arg.slice(equal + 1);
      if (!value || value.startsWith("--") || value !== value.trim())
        throw new CliError(`Option '${key}' requires a value.`, 2);
      if (key === "--field") {
        if (fields.includes(value))
          throw new CliError(
            `Field '${value}' was provided more than once.`,
            2,
          );
        fields.push(value);
      } else {
        if (values[key] !== undefined)
          throw new CliError(`Option '${key}' can only be provided once.`, 2);
        values[key] = value;
      }
    }
    if (
      !values["--source"] ||
      !values["--target"] ||
      !values["--component"] ||
      !fields.length
    )
      throw new CliError(
        "Provide --source, --target, --component, and at least one --field.",
        2,
      );
    if (plan === yes)
      throw new CliError(
        "Provide either --plan to preview or --yes to save.",
        2,
      );
    const spaceId = resolveSpaceId({
      environment: context.environment,
      option: values["--space-id"],
    });
    const gateway = context.createGateway(
      getStoryblokToken(context.environment),
    );
    const result = await context.output.activity(
      "Checking block fields",
      "Block fields checked",
      () =>
        syncBlockFields(gateway, {
          spaceId,
          source: values["--source"]!,
          target: values["--target"]!,
          component: values["--component"]!,
          fields,
          ...(values["--source-uid"]
            ? { sourceUid: values["--source-uid"] }
            : {}),
          ...(values["--target-uid"]
            ? { targetUid: values["--target-uid"] }
            : {}),
          apply: yes,
        }),
    );
    if (context.output.mode === "json") context.output.data(result);
    else if (!result.changes.length)
      context.output.info("Selected fields already match.");
    else
      context.output.text(
        [
          `${result.status === "planned" ? "Planned" : "Updated"}: ${result.source.fullSlug} → ${result.target.fullSlug} (${result.component})`,
          ...result.changes.map(
            (change) =>
              `${change.field}\n  before: ${JSON.stringify(change.before)}\n  after:  ${JSON.stringify(change.after)}`,
          ),
        ].join("\n\n"),
      );
  },
};
