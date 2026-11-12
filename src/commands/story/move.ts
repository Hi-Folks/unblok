import { moveStory } from "../../actions/stories/move-story.ts";
import { isValidStoryCreationSlug } from "../../actions/stories/create-story.ts";
import type { Command } from "../../cli/command.ts";
import { getStoryblokToken } from "../../config/environment.ts";
import { resolveSpaceId } from "../../config/space-id.ts";
import { CliError } from "../../errors.ts";

export const storyMoveCommand: Command = {
  name: "move",
  description: "Move a story into an existing content folder",
  usage:
    "unblok story move --slug <full-slug> --folder <path> [--space-id <id>] --yes",
  async run(args, context) {
    if (args.includes("--help") || args.includes("-h")) {
      context.output.text(
        `Usage: ${this.usage}\n\nMove a story by exact full slug into an existing folder path. The story's full slug changes. --yes is required. Use --json for structured output.`,
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
      if (!["--slug", "--folder", "--space-id"].includes(key))
        throw new CliError(`Unknown argument '${arg}'.`, 2);
      const value = equal < 0 ? args[++i] : arg.slice(equal + 1);
      if (!value?.trim() || value.startsWith("--") || values[key] !== undefined)
        throw new CliError(`Option '${key}' requires one value.`, 2);
      values[key] = value;
    }
    const slug = values["--slug"],
      folder = values["--folder"];
    if (
      !slug ||
      !folder ||
      slug !== slug.trim() ||
      folder !== folder.trim() ||
      !isValidStoryCreationSlug(slug) ||
      !isValidStoryCreationSlug(folder)
    )
      throw new CliError(
        "Provide exact paths with '--slug' and '--folder'.",
        2,
      );
    if (!yes)
      throw new CliError("Refusing to move a story without '--yes'.", 2);
    const spaceId = resolveSpaceId({
      environment: context.environment,
      option: values["--space-id"],
    });
    const gateway = context.createGateway(
      getStoryblokToken(context.environment),
    );
    const result = await context.output.activity(
      "Moving story",
      "Story checked",
      () => moveStory(gateway, { spaceId, slug, folder }),
    );
    if (context.output.mode === "json") context.output.data(result);
    else
      context.output.info(
        result.status === "moved"
          ? `Moved ${result.from} to ${result.to}.`
          : `${result.to} is already in the folder.`,
      );
  },
};
