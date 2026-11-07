import {
  assignStoryTags,
  planStoryTags,
  type StoryTagOperation,
} from "../../actions/stories/story-tags.ts";
import type { Command } from "../../cli/command.ts";
import { dispatch } from "../../cli/dispatch.ts";
import { getStoryblokToken } from "../../config/environment.ts";
import { resolveSpaceId } from "../../config/space-id.ts";
import { CliError } from "../../errors.ts";
import { formatStatus } from "../../reporting.ts";

export function parseStoryTagsOptions(args: string[], mode: "plan" | "assign") {
  const slugs: string[] = [];
  const tags: string[] = [];
  let spaceId: string | undefined;
  let yes = false;
  for (let i = 0; i < args.length; i++) {
    const arg = args[i];
    if (arg === "--yes") {
      yes = true;
      continue;
    }
    const key = arg?.split("=", 1)[0];
    if (
      key !== "--slug" &&
      key !== "--tag" &&
      key !== "-t" &&
      key !== "--space-id"
    )
      throw new CliError(`Unknown argument '${arg}'.`, 2);
    const equal = arg?.indexOf("=") ?? -1;
    const value = equal < 0 ? args[++i] : arg?.slice(equal + 1);
    if (!value?.trim() || value.startsWith("--"))
      throw new CliError(`Option '${key}' requires a value.`, 2);
    if (key === "--slug") {
      const slug = value.trim();
      if (slug.includes("*") || slug.includes(","))
        throw new CliError(
          "Story slugs must be exact full slugs without wildcards or commas.",
          2,
        );
      slugs.push(slug);
    } else if (key === "--tag" || key === "-t") tags.push(value.trim());
    else spaceId = value;
  }
  if (!slugs.length || !tags.length)
    throw new CliError("At least one '--slug' and '--tag' are required.", 2);
  if (mode === "assign" && !yes)
    throw new CliError(
      "Refusing to assign tags without '--yes'. Run 'story tags plan' first.",
      2,
    );
  if (mode === "plan" && yes)
    throw new CliError("Option '--yes' is only valid for assignment.", 2);
  return { slugs: [...new Set(slugs)], tags: [...new Set(tags)], spaceId };
}

function formatOperation(operation: StoryTagOperation): string {
  return `${operation.status.padEnd(9)} ${operation.slug}${operation.addTags.length ? ` · add: ${operation.addTags.join(", ")}` : ""}${operation.error ? ` · ${operation.error}` : ""}`;
}

function command(mode: "plan" | "assign"): Command {
  return {
    name: mode,
    description:
      mode === "plan" ? "Preview story tag additions" : "Add tags to stories",
    usage: `unblok story tags ${mode} --slug <full-slug> --tag <name> [options]`,
    async run(args, context) {
      if (args.includes("--help") || args.includes("-h")) {
        context.output.text(
          `Usage: ${this.usage}\n\nOptions:\n  --slug <full-slug>  Exact story full slug; repeatable\n  --tag <name>, -t    Tag name; repeatable\n  --space-id <id>     Target space; defaults to STORYBLOK_SPACE_ID\n  --yes               Confirm assignment (required for assign)\n  --json              Emit machine-readable JSON\n  -h, --help          Show command help`,
        );
        return;
      }
      const options = parseStoryTagsOptions(args, mode);
      const spaceId = resolveSpaceId({
        environment: context.environment,
        option: options.spaceId,
      });
      const gateway = context.createGateway(
        getStoryblokToken(context.environment),
      );
      if (mode === "plan") {
        const plan = await context.output.activity(
          "Loading story tags",
          "Tag plan ready",
          () => planStoryTags(gateway, spaceId, options.slugs, options.tags),
        );
        if (context.output.mode === "json") context.output.data(plan);
        else
          context.output.note(
            "Story tag plan",
            `${plan.operations.map(formatOperation).join("\n")}\n\nNo changes were made.`,
          );
      } else {
        const report = await context.output.activity(
          "Adding story tags",
          "Tag assignment finished",
          () => assignStoryTags(gateway, spaceId, options.slugs, options.tags),
        );
        if (context.output.mode === "json") context.output.data(report);
        else {
          const title =
            report.operations.length === 0
              ? "No stories matched"
              : report.summary.failed === 0
                ? "Tags: complete"
                : report.summary.failed === report.operations.length
                  ? "Tags: failed"
                  : "Tags: partial";
          const details = report.operations.map((operation) =>
            formatStatus(
              operation.status,
              `${operation.slug} (ID ${operation.storyId})`,
              operation.error ??
                (operation.status === "unchanged"
                  ? "Story already has the requested tags."
                  : operation.addTags.length
                    ? `Added: ${operation.addTags.join(", ")}`
                    : undefined),
              context.output.style,
            ),
          );
          context.output.summary(
            title,
            [
              `Space  ${spaceId}`,
              "",
              ...(details.length
                ? details
                : ["No stories matched the selection."]),
              "",
              `${report.summary.updated} updated · ${report.summary.unchanged} unchanged · ${report.summary.failed} failed`,
            ].join("\n"),
          );
        }
        if (report.summary.failed)
          throw new CliError(
            `${report.summary.failed} story tag assignment(s) failed.`,
          );
      }
    },
  };
}

export const storyTagsCommand: Command = {
  name: "tags",
  description: "Plan and assign story tags",
  async run(args, context) {
    await dispatch(
      "unblok story tags",
      [command("plan"), command("assign")],
      args,
      context,
    );
  },
};
