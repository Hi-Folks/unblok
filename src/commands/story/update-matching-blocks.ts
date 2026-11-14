import { updateMatchingBlocks } from "../../actions/stories/update-matching-blocks.ts";
import type { Command } from "../../cli/command.ts";
import { getStoryblokToken } from "../../config/environment.ts";
import { resolveSpaceId } from "../../config/space-id.ts";
import { CliError } from "../../errors.ts";

export const storyUpdateMatchingCommand: Command = {
  name: "update-matching-blocks",
  description: "Update matching blocks in a story",
  usage:
    "unblok story update-matching-blocks --ref <story> --component <name> --where <field=value> --set <field=value>... (--plan | --yes) [--space-id <id>] [--json]",
  async run(args, context) {
    if (args.includes("--help") || args.includes("-h")) {
      context.output.text(
        `Usage: ${this.usage}\n\nSelect all blocks with an exactly matching string field and set complete string field values. Repeat --set for multiple fields. --plan previews; --yes saves the draft. Use YAML or the library for non-string values.`,
      );
      return;
    }
    const values: Record<string, string> = {};
    const updates: Record<string, string> = Object.create(null);
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
      const split = arg.indexOf("="),
        key = split < 0 ? arg : arg.slice(0, split);
      if (
        !["--ref", "--component", "--where", "--set", "--space-id"].includes(
          key,
        )
      )
        throw new CliError(`Unknown argument '${arg}'.`, 2);
      const value = split < 0 ? args[++i] : arg.slice(split + 1);
      if (value === undefined || value.startsWith("--"))
        throw new CliError(`Option '${key}' requires a value.`, 2);
      if (key === "--set") {
        const index = value.indexOf("="),
          field = value.slice(0, index);
        if (
          index <= 0 ||
          !field.trim() ||
          field !== field.trim() ||
          Object.hasOwn(updates, field)
        )
          throw new CliError("Use unique --set field=value entries.", 2);
        Object.defineProperty(updates, field, {
          value: value.slice(index + 1),
          enumerable: true,
          configurable: true,
        });
      } else {
        if (values[key] !== undefined || !value || value !== value.trim())
          throw new CliError(`Option '${key}' requires one value.`, 2);
        values[key] = value;
      }
    }
    const ref = values["--ref"],
      component = values["--component"],
      where = values["--where"];
    const index = where?.indexOf("=") ?? -1;
    if (
      !ref ||
      !component ||
      !where ||
      index <= 0 ||
      !where.slice(0, index).trim() ||
      where.slice(0, index) !== where.slice(0, index).trim() ||
      !Object.keys(updates).length
    )
      throw new CliError(
        "Provide --ref, --component, --where field=value, and at least one --set field=value.",
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
      "Checking matching blocks",
      "Matching blocks checked",
      () =>
        updateMatchingBlocks(gateway, {
          spaceId,
          story: ref,
          component,
          where: {
            field: where.slice(0, index),
            equals: where.slice(index + 1),
          },
          fields: updates,
          apply: yes,
        }),
    );
    if (context.output.mode === "json") context.output.data(result);
    else if (!result.matched) context.output.info("No matching blocks found.");
    else
      context.output.text(
        [
          `${result.status}: ${result.matched} matching block(s) in ${result.story.fullSlug}`,
          ...result.blocks.map((block) =>
            [
              `${block.path || "/"} (${block.uid})`,
              ...(block.changes.length
                ? block.changes.map(
                    (change) =>
                      `  ${change.field}: ${JSON.stringify(change.before)} → ${JSON.stringify(change.after)}`,
                  )
                : ["  unchanged"]),
            ].join("\n"),
          ),
        ].join("\n\n"),
      );
  },
};
