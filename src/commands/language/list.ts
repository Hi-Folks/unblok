import { listLanguages } from "../../actions/languages/language.ts";
import type { Command } from "../../cli/command.ts";
import { getStoryblokToken } from "../../config/environment.ts";
import { resolveSpaceId } from "../../config/space-id.ts";
import { parseLanguageListOptions } from "./options.ts";
import { formatLanguageList } from "./presentation.ts";

export const listLanguagesCommand: Command = {
  name: "list",
  description: "List configured languages",
  usage: "space-man language list [--space-id <id>]",
  async run(args, context) {
    if (args.includes("--help") || args.includes("-h")) {
      context.output.text(
        `Usage: ${this.usage}\n\n${this.description}.\n\nOptions:\n  --space-id <id>  Target space; defaults to STORYBLOK_SPACE_ID\n  --json           Emit machine-readable JSON\n  -h, --help       Show command help`,
      );
      return;
    }

    const options = parseLanguageListOptions(args);
    const spaceId = resolveSpaceId({
      environment: context.environment,
      option: options.spaceId,
    });
    const gateway = context.createGateway(
      getStoryblokToken(context.environment),
    );
    const languages = await context.output.activity(
      `Loading languages from space ${spaceId}`,
      "Languages loaded",
      () => listLanguages(gateway, spaceId),
    );

    if (context.output.mode === "json") {
      context.output.data(languages);
    } else if (languages.length === 0) {
      context.output.info("No additional languages configured.");
    } else {
      context.output.text(
        formatLanguageList(languages, context.output.width?.()),
      );
    }
  },
};
