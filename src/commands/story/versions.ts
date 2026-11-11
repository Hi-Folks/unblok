import type { Command } from "../../cli/command.ts";
import {
  listStoryVersions,
  compareStoryVersions,
  compareStoryToPreviousVersion,
} from "../../actions/stories/versions.ts";
import { getStoryblokToken } from "../../config/environment.ts";
import { resolveSpaceId } from "../../config/space-id.ts";
import { CliError } from "../../errors.ts";

function command(mode: "versions" | "compare-versions"): Command {
  const compare = mode === "compare-versions";
  return {
    name: mode,
    description: compare
      ? "Compare the content of two story versions"
      : "List story version history",
    usage: compare
      ? "unblok story compare-versions --ref <id-or-slug> (--previous | --from <version-id> --to <version-id>) [--space-id <id>] [--json]"
      : "unblok story versions --ref <id-or-slug> [--limit <n>] [--space-id <id>] [--json]",
    async run(args, context) {
      if (args.includes("--help") || args.includes("-h")) {
        context.output.text(
          `Usage: ${this.usage}\n\n${compare ? "Compare stored content by JSON Pointer path. --previous compares the current draft with the preceding saved content; arrays are compared by index. Both selected states must have content." : "List up to 25 versions in API order by default; use --limit to request more or fewer. Content is not fetched."} The current Storyblok endpoint covers versions created after August 28, 2024. This command is read-only.\n\n  --ref <id-or-slug>  Story ID or exact full slug\n${compare ? "  --previous          Compare the current draft with the preceding saved content\n  --from <id>         Source version ID\n  --to <id>           Target version ID\n" : "  --limit <n>         Maximum number of versions\n"}  --space-id <id>     Target space; defaults to STORYBLOK_SPACE_ID\n  --json              Emit machine-readable JSON\n  -h, --help          Show command help`,
        );
        return;
      }
      const values = new Map<string, string>();
      let previous = false;
      const allowed = compare
        ? ["--ref", "--from", "--to", "--space-id"]
        : ["--ref", "--limit", "--space-id"];
      for (let i = 0; i < args.length; i++) {
        const arg = args[i];
        if (!arg) throw new CliError("Invalid argument.", 2);
        if (compare && arg === "--previous") {
          if (previous)
            throw new CliError(
              "Option '--previous' can only be provided once.",
              2,
            );
          previous = true;
          continue;
        }
        const separator = arg.indexOf("=");
        const key = separator < 0 ? arg : arg.slice(0, separator);
        if (!allowed.includes(key))
          throw new CliError(`Unknown argument '${arg}'.`, 2);
        const value = separator < 0 ? args[++i] : arg.slice(separator + 1);
        if (
          !value ||
          value.startsWith("--") ||
          !value.trim() ||
          value !== value.trim()
        )
          throw new CliError(
            `Option '${key}' requires a nonempty value without surrounding whitespace.`,
            2,
          );
        if (values.has(key))
          throw new CliError(`Option '${key}' can only be provided once.`, 2);
        values.set(key, value);
      }
      const reference = values.get("--ref");
      if (
        !reference ||
        /[*,]/.test(reference) ||
        (/^\d+$/.test(reference) &&
          (!Number.isSafeInteger(Number(reference)) || Number(reference) <= 0))
      )
        throw new CliError(
          "Provide an exact story slug or positive story ID with '--ref'.",
          2,
        );
      const positive = (key: string): number | undefined => {
        const value = values.get(key);
        if (value === undefined) return undefined;
        if (
          !/^\d+$/.test(value) ||
          !Number.isSafeInteger(Number(value)) ||
          Number(value) <= 0
        )
          throw new CliError(`Option '${key}' requires a positive integer.`, 2);
        return Number(value);
      };
      const limit = positive("--limit"),
        from = positive("--from"),
        to = positive("--to");
      if (
        compare &&
        ((previous && (from !== undefined || to !== undefined)) ||
          (!previous && (from === undefined || to === undefined)))
      )
        throw new CliError(
          "Provide either '--previous' or both '--from' and '--to' version IDs.",
          2,
        );
      const spaceId = resolveSpaceId({
        environment: context.environment,
        option: values.get("--space-id"),
      });
      const gateway = context.createGateway(
        getStoryblokToken(context.environment),
      );
      if (compare) {
        const runComparison:
          | (() => Promise<
              | Awaited<ReturnType<typeof compareStoryToPreviousVersion>>
              | Awaited<ReturnType<typeof compareStoryVersions>>
            >)
          | undefined = previous
          ? () =>
              compareStoryToPreviousVersion(gateway, {
                spaceId,
                story: reference,
              })
          : from !== undefined && to !== undefined
            ? () =>
                compareStoryVersions(gateway, {
                  spaceId,
                  story: reference,
                  from,
                  to,
                })
            : undefined;
        if (!runComparison)
          throw new CliError("Provide '--from' and '--to' version IDs.", 2);
        const report = await context.output.activity(
          "Comparing story versions",
          "Comparison ready",
          runComparison,
        );
        if (context.output.mode === "json") context.output.data(report);
        else if (!report.changes.length)
          context.output.info(
            `${previous ? `Compared version ${report.from} with current draft. ` : ""}No content differences found.`,
          );
        else
          context.output.text(
            `${previous ? `Comparing version ${report.from} with current draft.\n\n` : ""}${report.changes
              .map((change) =>
                `${change.type} ${change.path || "/"}\n${Object.hasOwn(change, "before") ? `  before: ${JSON.stringify(change.before)}\n` : ""}${Object.hasOwn(change, "after") ? `  after: ${JSON.stringify(change.after)}` : ""}`.trimEnd(),
              )
              .join("\n\n")}`,
          );
      } else {
        const report = await context.output.activity(
          "Loading story versions",
          "Versions loaded",
          () =>
            listStoryVersions(gateway, {
              spaceId,
              story: reference,
              ...(limit === undefined ? {} : { limit }),
            }),
        );
        if (context.output.mode === "json") context.output.data(report);
        else if (!report.versions.length)
          context.output.info(
            "No versions found in the current history endpoint.",
          );
        else
          context.output.text(
            report.versions
              .map(
                (version) =>
                  `${version.id}  ${version.createdAt ?? "unknown date"}  ${version.status ?? "unknown status"}  ${version.author?.name ?? "unknown author"}`,
              )
              .join("\n"),
          );
      }
    },
  };
}

export const storyVersionsCommand = command("versions");
export const storyCompareVersionsCommand = command("compare-versions");
