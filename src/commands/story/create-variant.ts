import type { Command } from "../../cli/command.ts";
import { getStoryblokToken } from "../../config/environment.ts";
import { resolveSpaceId } from "../../config/space-id.ts";
import { CliError } from "../../errors.ts";
import { createDimensionVariant } from "../../actions/stories/create-dimension-variant.ts";
import { isValidStoryCreationSlug } from "../../actions/stories/create-story.ts";

export const storyCreateVariantCommand: Command = {
  name: "create-variant",
  description: "Create a linked Dimensions story variant",
  usage:
    "unblok story create-variant --ref <id-or-full-slug> --folder <root-folder> [--space-id <id>] --yes [--json]",
  async run(args, context) {
    if (args.includes("--help") || args.includes("-h")) {
      context.output.text(
        `Usage: ${this.usage}\n\nDuplicate a story as a linked variant in a configured Dimensions folder. Requires --yes. Existing linked variants are preserved. The source must have a group ID.`,
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
      if (
        !["--ref", "--folder", "--space-id"].includes(key) ||
        values[key] !== undefined
      )
        throw new CliError(`Unknown or repeated option '${arg}'.`, 2);
      const value = equal < 0 ? args[++i] : arg.slice(equal + 1);
      if (!value || value.startsWith("--") || value !== value.trim())
        throw new CliError(`Option '${key}' requires a value.`, 2);
      values[key] = value;
    }
    const story = values["--ref"],
      folder = values["--folder"];
    if (
      !story ||
      !isValidStoryCreationSlug(story) ||
      !folder ||
      !isValidStoryCreationSlug(folder) ||
      folder.includes("/")
    )
      throw new CliError("Provide '--ref' and one root '--folder'.", 2);
    if (!yes)
      throw new CliError("Refusing to create a variant without '--yes'.", 2);
    const spaceId = resolveSpaceId({
      environment: context.environment,
      option: values["--space-id"],
    });
    const gateway = context.createGateway(
      getStoryblokToken(context.environment),
    );
    const result = await context.output.activity(
      "Creating linked variant",
      "Variant checked",
      () => createDimensionVariant(gateway, { spaceId, story, folder }),
    );
    if (context.output.mode === "json") context.output.data(result);
    else
      context.output.info(
        result.status === "created"
          ? `Created ${result.story.fullSlug}.`
          : `${result.story.fullSlug} is already linked.`,
      );
  },
};
