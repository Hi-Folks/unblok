import type { Command } from "../../cli/command.ts";
import {
  listStories,
  type ListStoriesInput,
} from "../../actions/stories/library-list.ts";
import { getStoryblokToken } from "../../config/environment.ts";
import { resolveSpaceId } from "../../config/space-id.ts";
import { CliError } from "../../errors.ts";

export const storyListCommand: Command = {
  name: "list",
  description: "List and filter stories",
  usage: "unblok story list [options]",
  async run(args, context) {
    if (args.includes("--help") || args.includes("-h")) {
      context.output.text(
        `Usage: ${this.usage}\n\nList non-folder stories. Results are paginated automatically and do not include full content; use 'story get' for content. Filters can be combined.\n\n  --search <text>       Search name, slug or full slug\n  --text-search <text>  Search story content and names\n  --starts-with <path>  Filter by full-slug prefix\n  --component <name>    Filter by contained nestable block\n  --tag <tag>           Filter by assigned tag\n  --published           Only published stories\n  --unpublished         Only unpublished stories\n  --space-id <id>       Target space; defaults to STORYBLOK_SPACE_ID\n  --json                Emit machine-readable JSON\n  -h, --help            Show command help\n\nExample:\n  unblok story list --starts-with articles/ --tag campaign --space-id YOUR_SPACE_ID --json`,
      );
      return;
    }
    const values = new Map<string, string>();
    let published: boolean | undefined;
    for (let i = 0; i < args.length; i++) {
      const arg = args[i]!;
      if (arg === "--published" || arg === "--unpublished") {
        if (published !== undefined)
          throw new CliError(
            "Provide only one of '--published' or '--unpublished'.",
            2,
          );
        published = arg === "--published";
        continue;
      }
      const separator = arg.indexOf("=");
      const key = separator < 0 ? arg : arg.slice(0, separator);
      if (
        ![
          "--space-id",
          "--search",
          "--text-search",
          "--starts-with",
          "--component",
          "--tag",
        ].includes(key)
      )
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
    const spaceId = resolveSpaceId({
      environment: context.environment,
      option: values.get("--space-id"),
    });
    const options: ListStoriesInput = {
      spaceId,
      ...(published === undefined ? {} : { published }),
    };
    const fields = [
      ["--search", "search"],
      ["--text-search", "textSearch"],
      ["--starts-with", "startsWith"],
      ["--component", "component"],
      ["--tag", "tag"],
    ] as const;
    for (const [option, field] of fields) {
      const value = values.get(option);
      if (value !== undefined) options[field] = value;
    }
    const gateway = context.createGateway(
      getStoryblokToken(context.environment),
    );
    const stories = await context.output.activity(
      "Loading stories",
      "Stories loaded",
      () => listStories(gateway, options),
    );
    if (context.output.mode === "json") context.output.data(stories);
    else if (!stories.length) context.output.info("No matching stories found.");
    else
      context.output.text(
        stories
          .map((story) => `${story.id}  ${story.full_slug}  ${story.name}`)
          .join("\n"),
      );
  },
};
