import { ensureLanguage } from "../../actions/languages/language.ts";
import type { Command } from "../../cli/command.ts";
import { getStoryblokToken } from "../../config/environment.ts";
import { resolveSpaceId } from "../../config/space-id.ts";
import { parseLanguageAddOptions } from "./options.ts";

export const addLanguageCommand: Command = {
  name: "add",
  description: "Ensure a language is configured",
  usage: "space-man language add <code> <name> [options]",
  async run(args, context) {
    if (args.includes("--help") || args.includes("-h")) {
      context.output.text(
        `Usage: ${this.usage}\n\n${this.description}; existing languages are preserved.\n\nOptions:\n  --ai-translation-code <code>  Storyblok AI translation language\n  --space-id <id>               Target space; defaults to STORYBLOK_SPACE_ID\n  --json                        Emit machine-readable JSON\n  -h, --help                    Show command help`,
      );
      return;
    }

    const options = parseLanguageAddOptions(args);
    const { spaceId: spaceIdOption, ...language } = options;
    const spaceId = resolveSpaceId({
      environment: context.environment,
      option: spaceIdOption,
    });
    const gateway = context.createGateway(
      getStoryblokToken(context.environment),
    );
    const result = await context.output.activity(
      `Ensuring language ${options.code} in space ${spaceId}`,
      "Language configuration checked",
      () => ensureLanguage(gateway, spaceId, language),
    );

    if (context.output.mode === "json") {
      context.output.data(result);
    } else {
      context.output.info(
        result.status === "unchanged"
          ? `Language '${options.code}' is already up to date.`
          : `Language '${options.code}' ${result.status === "create" ? "created" : "updated"}.`,
      );
    }
  },
};
