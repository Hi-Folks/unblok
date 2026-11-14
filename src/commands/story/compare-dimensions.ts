import { compareStoryDimensions } from "../../actions/stories/compare-dimensions.ts";
import { isValidStoryCreationSlug } from "../../actions/stories/create-story.ts";
import type { Command } from "../../cli/command.ts";
import { getStoryblokToken } from "../../config/environment.ts";
import { resolveSpaceId } from "../../config/space-id.ts";
import { CliError } from "../../errors.ts";
import { formatDimensionsComparison } from "./dimensions-presentation.ts";

export const storyCompareDimensionsCommand: Command = {
  name: "compare-dimensions",
  description: "Compare a story with linked folder variants",
  usage:
    "unblok story compare-dimensions --ref <id-or-full-slug> [--folder <root-folder>...] [--space-id <id>] [--json]",
  async run(args, context) {
    if (args.includes("--help") || args.includes("-h")) {
      context.output.text(
        `Usage: ${this.usage}\n\nCompare draft content with linked alternate stories. By default, inspect every configured Dimensions folder except the source folder. Repeat --folder to select folders explicitly. Missing means no linked alternate was returned, not that no similarly named story exists. Arrays are compared by position.\n\nExamples:\n  unblok story compare-dimensions --ref global/home --space-id YOUR_SPACE_ID\n  unblok story compare-dimensions --ref global/home --folder italy --folder germany --space-id YOUR_SPACE_ID --json`,
      );
      return;
    }
    let reference: string | undefined, spaceIdOption: string | undefined;
    const folders: string[] = [];
    for (let i = 0; i < args.length; i++) {
      const arg = args[i]!;
      const separator = arg.indexOf("=");
      const key = separator < 0 ? arg : arg.slice(0, separator);
      if (!["--ref", "--folder", "--space-id"].includes(key))
        throw new CliError(`Unknown argument '${arg}'.`, 2);
      const value = separator < 0 ? args[++i] : arg.slice(separator + 1);
      if (!value || value.startsWith("--") || value !== value.trim())
        throw new CliError(`Option '${key}' requires a value.`, 2);
      if (key === "--folder") {
        if (folders.includes(value))
          throw new CliError(
            `Folder '${value}' was provided more than once.`,
            2,
          );
        folders.push(value);
      } else if (key === "--ref") {
        if (reference !== undefined)
          throw new CliError("Provide one story reference.", 2);
        reference = value;
      } else {
        if (spaceIdOption !== undefined)
          throw new CliError("Provide one space ID.", 2);
        spaceIdOption = value;
      }
    }
    if (
      !reference ||
      !isValidStoryCreationSlug(reference) ||
      folders.some(
        (path) => !isValidStoryCreationSlug(path) || path.includes("/"),
      ) ||
      (/^\d+$/.test(reference) &&
        (!Number.isSafeInteger(Number(reference)) || Number(reference) <= 0))
    )
      throw new CliError("Provide '--ref' and valid root folder paths.", 2);
    const spaceId = resolveSpaceId({
      environment: context.environment,
      option: spaceIdOption,
    });
    const gateway = context.createGateway(
      getStoryblokToken(context.environment),
    );
    const result = await context.output.activity(
      "Comparing folder variants",
      "Comparison ready",
      () =>
        compareStoryDimensions(gateway, {
          spaceId,
          story: reference!,
          ...(folders.length ? { folders } : {}),
        }),
    );
    if (context.output.mode === "json") context.output.data(result);
    else
      context.output.text(
        formatDimensionsComparison(result, context.output.width?.()),
      );
  },
};
