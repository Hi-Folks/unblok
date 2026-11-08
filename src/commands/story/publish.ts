import { publishStory } from "../../actions/stories/publish-story.ts";
import type { Command } from "../../cli/command.ts";
import { getStoryblokToken } from "../../config/environment.ts";
import { resolveSpaceId } from "../../config/space-id.ts";
import { CliError } from "../../errors.ts";

export const storyPublishCommand: Command = {
  name: "publish",
  description: "Publish a story's current draft",
  usage: "unblok story publish --slug <full-slug> [--space-id <id>] --yes",
  async run(args, context) {
    if (args.includes("--help") || args.includes("-h")) {
      context.output.text(
        `Usage: ${this.usage}\n\nPublish the current draft, including pending changes. A published story with no pending changes is unchanged.\n\nOptions:\n  --slug <full-slug>  Exact story full slug, without a leading slash\n  --space-id <id>     Target space; defaults to STORYBLOK_SPACE_ID\n  --yes               Confirm publication (required)\n  --json              Emit machine-readable JSON\n  -h, --help          Show command help`,
      );
      return;
    }
    let slug: string | undefined;
    let spaceIdOption: string | undefined;
    let yes = false;
    for (let i = 0; i < args.length; i++) {
      const arg = args[i]!;
      if (arg === "--yes") {
        yes = true;
        continue;
      }
      const equal = arg.indexOf("=");
      const key = equal < 0 ? arg : arg.slice(0, equal);
      if (key !== "--slug" && key !== "--space-id")
        throw new CliError(`Unknown argument '${arg}'.`, 2);
      const value = equal < 0 ? args[++i] : arg.slice(equal + 1);
      if (!value?.trim() || value.startsWith("--"))
        throw new CliError(`Option '${key}' requires a value.`, 2);
      if (key === "--slug") {
        if (slug !== undefined)
          throw new CliError("Provide one story slug.", 2);
        slug = value;
      } else {
        if (spaceIdOption !== undefined)
          throw new CliError("Provide one space ID.", 2);
        spaceIdOption = value;
      }
    }
    if (
      !slug ||
      slug !== slug.trim() ||
      /^\/|\/$/.test(slug) ||
      /[*,]/.test(slug)
    )
      throw new CliError(
        "Provide one exact story full slug with '--slug', without a leading or trailing slash.",
        2,
      );
    if (!yes) throw new CliError("Refusing to publish without '--yes'.", 2);
    const spaceId = resolveSpaceId({
      environment: context.environment,
      option: spaceIdOption,
    });
    const gateway = context.createGateway(
      getStoryblokToken(context.environment),
    );
    const result = await context.output.activity(
      "Checking story publication",
      "Story checked",
      () => publishStory(gateway, { spaceId, story: slug }),
    );
    if (context.output.mode === "json") context.output.data(result);
    else
      context.output.info(
        result.status === "published"
          ? `Published ${slug} (ID ${result.storyId}).`
          : `${slug} (ID ${result.storyId}) is already published with no pending changes.`,
      );
  },
};
