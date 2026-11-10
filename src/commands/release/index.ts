import {
  createRelease,
  getRelease,
  listReleases,
} from "../../actions/releases/releases.ts";
import type { Command } from "../../cli/command.ts";
import { publishReleaseCommand } from "./publish.ts";
import { resourceGetCommand } from "../resource-get.ts";
import { dispatch } from "../../cli/dispatch.ts";
import { getStoryblokToken } from "../../config/environment.ts";
import { resolveSpaceId } from "../../config/space-id.ts";
import { CliError } from "../../errors.ts";

function command(mode: "list" | "create"): Command {
  return {
    name: mode,
    description:
      mode === "list"
        ? "List Storyblok releases"
        : "Create a Storyblok release",
    usage:
      mode === "list"
        ? "unblok release list [--space-id <id>]"
        : "unblok release create --name <name> [--release-at <date-time> | --in-days <n>] [--space-id <id>] --yes",
    async run(args, context) {
      if (args.includes("--help") || args.includes("-h")) {
        context.output.text(
          `Usage: ${this.usage}\n\n${mode === "create" ? "Create a release if its exact name is not already present. An existing release is kept; its schedule is not changed. Use either --release-at or --in-days. --yes is required." : "List releases in the target space."} The Releases app must be installed and enabled.\n\nOptions:\n  --space-id <id>    Target space; defaults to STORYBLOK_SPACE_ID\n${mode === "create" ? "  --name <name>      Name of the new release\n  --release-at <at>  Optional schedule in YYYY-MM-DD HH:mm format\n  --in-days <n>      Schedule n whole days from creation, in UTC\n  --yes              Confirm creation\n" : ""}  --json             Emit machine-readable JSON\n  -h, --help         Show command help\n\nExample:\n  ${mode === "create" ? "unblok release create --name 'Campaign' --in-days 7 --space-id YOUR_SPACE_ID --yes" : "unblok release list --space-id YOUR_SPACE_ID --json"}`,
        );
        return;
      }
      let spaceIdOption: string | undefined;
      let name: string | undefined;
      let releaseAt: string | undefined;
      let releaseInDays: number | undefined;
      let yes = false;
      for (let i = 0; i < args.length; i++) {
        const arg = args[i]!;
        if (arg === "--yes" && mode === "create") {
          yes = true;
          continue;
        }
        const equal = arg.indexOf("=");
        const key = equal < 0 ? arg : arg.slice(0, equal);
        if (
          key !== "--space-id" &&
          !(
            mode === "create" &&
            (key === "--name" || key === "--release-at" || key === "--in-days")
          )
        )
          throw new CliError(`Unknown argument '${arg}'.`, 2);
        const value = equal < 0 ? args[++i] : arg.slice(equal + 1);
        if (!value?.trim() || value.startsWith("--"))
          throw new CliError(`Option '${key}' requires a value.`, 2);
        if (key === "--name") {
          if (name !== undefined)
            throw new CliError("Provide one release name.", 2);
          name = value.trim();
        } else if (key === "--in-days") {
          if (releaseInDays !== undefined || !/^\d+$/.test(value))
            throw new CliError(
              "Provide one positive integer for '--in-days'.",
              2,
            );
          releaseInDays = Number(value);
        } else if (key === "--release-at") {
          if (releaseAt !== undefined)
            throw new CliError("Provide one release schedule.", 2);
          releaseAt = value;
        } else {
          if (spaceIdOption !== undefined)
            throw new CliError("Provide one space ID.", 2);
          spaceIdOption = value;
        }
      }
      if (mode === "create" && !name)
        throw new CliError("Option '--name <name>' is required.", 2);
      if (mode === "create" && !yes)
        throw new CliError("Refusing to create a release without '--yes'.", 2);
      const spaceId = resolveSpaceId({
        environment: context.environment,
        option: spaceIdOption,
      });
      const gateway = context.createGateway(
        getStoryblokToken(context.environment),
      );
      if (mode === "list") {
        const releases = await context.output.activity(
          "Loading releases",
          "Releases loaded",
          () => listReleases(gateway, { spaceId }),
        );
        if (context.output.mode === "json") context.output.data(releases);
        else if (!releases.length) context.output.info("No releases found.");
        else
          context.output.text(
            releases
              .map((release) => `${release.name}  (${release.id})`)
              .join("\n"),
          );
      } else {
        const result = await context.output.activity(
          "Checking release",
          "Release checked",
          () =>
            createRelease(gateway, {
              spaceId,
              name: name!,
              releaseAt,
              releaseInDays,
            }),
        );
        if (context.output.mode === "json") context.output.data(result);
        else
          context.output.info(
            result.status === "created"
              ? `Created release ${result.release.name} (ID ${result.release.id}).`
              : `Release ${result.release.name} (ID ${result.release.id}) already exists; skipped.`,
          );
      }
    },
  };
}
export const releaseCommand: Command = {
  name: "release",
  description: "Manage Storyblok content releases",
  usage: "unblok release <command>",
  async run(args, context) {
    await dispatch(
      "unblok release",
      [
        command("list"),
        resourceGetCommand({
          resource: "release",
          description: "Get a Storyblok release",
          lookup: getRelease,
          render: (release) => ({
            title: release.name,
            details: `ID: ${release.id}\nScheduled: ${release.release_at ?? "Not scheduled"}\nReleased: ${release.released === undefined ? "Unknown" : release.released ? "Yes" : "No"}`,
          }),
        }),
        command("create"),
        publishReleaseCommand,
      ],
      args,
      context,
    );
  },
};
