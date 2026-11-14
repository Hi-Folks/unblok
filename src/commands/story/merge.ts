import { mergeDimensionStory } from "../../actions/stories/merge-dimensions.ts";
import { isValidStoryCreationSlug } from "../../actions/stories/create-story.ts";
import type { Command } from "../../cli/command.ts";
import { getStoryblokToken } from "../../config/environment.ts";
import { resolveSpaceId } from "../../config/space-id.ts";
import { CliError } from "../../errors.ts";

export const storyMergeCommand: Command = {
  name: "merge",
  description: "Merge a Dimensions story into another",
  usage:
    "unblok story merge --source <id-or-full-slug> --target <id-or-full-slug> [--space-id <id>] --yes [--json]",
  async run(args, context) {
    if (args.includes("--help") || args.includes("-h")) {
      context.output.text(
        `Usage: ${this.usage}\n\nMerge source structure into the target through Storyblok Dimensions. The target is modified; --yes is required. IDs and exact full slugs can be mixed.`,
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
      const equal = arg.indexOf("="),
        key = equal < 0 ? arg : arg.slice(0, equal);
      if (
        !["--source", "--target", "--space-id"].includes(key) ||
        values[key] !== undefined
      )
        throw new CliError(`Unknown or repeated option '${arg}'.`, 2);
      const value = equal < 0 ? args[++i] : arg.slice(equal + 1);
      if (!value || value.startsWith("--") || value !== value.trim())
        throw new CliError(`Option '${key}' requires a value.`, 2);
      values[key] = value;
    }
    const source = values["--source"],
      target = values["--target"];
    if (
      !source ||
      !target ||
      !isValidStoryCreationSlug(source) ||
      !isValidStoryCreationSlug(target)
    )
      throw new CliError(
        "Provide exact story references using '--source' and '--target'.",
        2,
      );
    if (!yes)
      throw new CliError("Refusing to merge stories without '--yes'.", 2);
    const spaceId = resolveSpaceId({
      environment: context.environment,
      option: values["--space-id"],
    });
    const gateway = context.createGateway(
      getStoryblokToken(context.environment),
    );
    const result = await context.output.activity(
      "Submitting Dimensions merge",
      "Merge request accepted",
      () => mergeDimensionStory(gateway, { spaceId, source, target }),
    );
    if (context.output.mode === "json") context.output.data(result);
    else
      context.output.info(
        result.status === "queued"
          ? `Merge from ${result.source.fullSlug} into ${result.target.fullSlug} queued (background task ${result.backgroundTaskId}).`
          : `Merge from ${result.source.fullSlug} into ${result.target.fullSlug} submitted. Inspect the target for the result.`,
      );
  },
};
