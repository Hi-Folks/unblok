import type { Command } from "../../cli/command.ts";
import { compareStoryLanguages } from "../../actions/stories/compare-languages.ts";
import { getStoryblokToken } from "../../config/environment.ts";
import { resolveSpaceId } from "../../config/space-id.ts";
import { CliError } from "../../errors.ts";

export const storyCompareLanguagesCommand: Command = {
  name: "compare-languages",
  description: "Compare stored field-level translations",
  usage:
    "unblok story compare-languages --ref <id-or-full-slug> --language <code>... [--space-id <id>] [--json]",
  async run(args, context) {
    if (args.includes("--help") || args.includes("-h")) {
      context.output.text(
        `Usage: ${this.usage}\n\nCompare the default and stored translated values for fields marked translatable in the space's component schemas. Missing values can fall back to the default language. This command does not judge translation quality or compare separate folder-level stories.\n\n  --ref <id-or-full-slug>  Story ID or exact full slug\n  --language <code>        Configured additional language (repeatable)\n  --space-id <id>          Target space; defaults to STORYBLOK_SPACE_ID\n  --json                   Emit a structured comparison\n  -h, --help               Show command help\n\nExample:\n  unblok story compare-languages --ref home --language de --language it --space-id YOUR_SPACE_ID --json`,
      );
      return;
    }
    let reference: string | undefined;
    let spaceIdOption: string | undefined;
    const languages: string[] = [];
    for (let i = 0; i < args.length; i++) {
      const arg = args[i];
      if (!arg) throw new CliError("Invalid argument.", 2);
      const separator = arg.indexOf("=");
      const key = separator < 0 ? arg : arg.slice(0, separator);
      if (!["--ref", "--language", "--space-id"].includes(key))
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
      if (key === "--language") {
        if (languages.includes(value))
          throw new CliError(
            `Language '${value}' was provided more than once.`,
            2,
          );
        languages.push(value);
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
    if (!reference || !languages.length)
      throw new CliError("Provide '--ref' and at least one '--language'.", 2);
    if (
      /[*,]/.test(reference) ||
      (/^\d+$/.test(reference) &&
        (!Number.isSafeInteger(Number(reference)) || Number(reference) <= 0))
    )
      throw new CliError(
        "Provide an exact story slug or positive story ID.",
        2,
      );
    const spaceId = resolveSpaceId({
      environment: context.environment,
      option: spaceIdOption,
    });
    const gateway = context.createGateway(
      getStoryblokToken(context.environment),
    );
    const result = await context.output.activity(
      "Comparing story languages",
      "Comparison ready",
      () =>
        compareStoryLanguages(gateway, {
          spaceId,
          story: reference,
          languages,
        }),
    );
    if (context.output.mode === "json") context.output.data(result);
    else if (!result.fields.length)
      context.output.info(
        "No translatable fields found in this story's component schemas.",
      );
    else
      context.output.text(
        result.fields
          .map((field) =>
            [
              `${field.path} (${field.component}${field.blockUid ? `, ${field.blockUid}` : ""})`,
              `  default: ${field.source.status === "missing" ? "[missing]" : JSON.stringify(field.source.value)}`,
              ...field.translations.map(
                (item) =>
                  `  ${item.language}: ${item.status === "missing" ? "[missing]" : `${JSON.stringify(item.value)}${item.status === "empty" ? " [empty]" : ""}${item.matchesSource ? " [same as default]" : ""}`}`,
              ),
            ].join("\n"),
          )
          .join("\n\n"),
      );
  },
};
