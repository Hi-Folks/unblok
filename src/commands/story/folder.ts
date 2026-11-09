import { ensureStoryFolder } from "../../actions/stories/ensure-folder.ts";
import type { Command } from "../../cli/command.ts";
import { dispatch } from "../../cli/dispatch.ts";
import { getStoryblokToken } from "../../config/environment.ts";
import { resolveSpaceId } from "../../config/space-id.ts";
import { CliError } from "../../errors.ts";

const create: Command = {
  name: "create",
  description: "Create a content folder path",
  usage: "unblok story folder create --path <path> [--space-id <id>] --yes",
  async run(args, context) {
    if (args.includes("--help") || args.includes("-h")) {
      context.output.text(
        `Usage: ${this.usage}\n\nCreate missing content folders along a slash-separated path; existing folders are reused. --yes is required. Use --json for structured output.`,
      );
      return;
    }
    const values: Record<string, string> = {};
    let yes = false;
    for (let i = 0; i < args.length; i++) {
      const arg = args[i]!;
      if (arg === "--yes") {
        yes = true;
        continue;
      }
      const equal = arg.indexOf("=");
      const key = equal < 0 ? arg : arg.slice(0, equal);
      if (key !== "--path" && key !== "--space-id")
        throw new CliError(`Unknown argument '${arg}'.`, 2);
      const value = equal < 0 ? args[++i] : arg.slice(equal + 1);
      if (!value?.trim() || value.startsWith("--"))
        throw new CliError(`Option '${key}' requires a value.`, 2);
      if (values[key] !== undefined)
        throw new CliError(`Option '${key}' can only be provided once.`, 2);
      values[key] = value;
    }
    const path = values["--path"];
    if (!path) throw new CliError("Option '--path <path>' is required.", 2);
    if (!yes)
      throw new CliError("Refusing to create folders without '--yes'.", 2);
    const spaceId = resolveSpaceId({
      environment: context.environment,
      option: values["--space-id"],
    });
    const gateway = context.createGateway(
      getStoryblokToken(context.environment),
    );
    const result = await context.output.activity(
      "Checking content folders",
      "Content folders checked",
      () => ensureStoryFolder(gateway, { spaceId, path }),
    );
    if (context.output.mode === "json") context.output.data(result);
    else
      context.output.info(
        result.status === "created"
          ? `Created folder path ${result.path}.`
          : `Folder path ${result.path} already exists.`,
      );
  },
};
export const storyFolderCommand: Command = {
  name: "folder",
  description: "Manage content folders",
  usage: "unblok story folder <command>",
  async run(args, context) {
    await dispatch("unblok story folder", [create], args, context);
  },
};
