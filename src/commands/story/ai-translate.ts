import { translateStoryWithAi } from "../../actions/stories/ai-translate.ts";
import type { Command } from "../../cli/command.ts";
import { getStoryblokToken } from "../../config/environment.ts";
import { resolveSpaceId } from "../../config/space-id.ts";
import { CliError } from "../../errors.ts";

export const storyAiTranslateCommand: Command = {
  name: "ai-translate",
  description: "Translate and save a story with Storyblok AI",
  usage:
    "unblok story ai-translate --id <id> (--language <lang[:code]>... | --all-languages) [--review-stage <name-or-id>] [--workflow <name-or-id>] [--overwrite] [--space-id <id>] --yes",
  async run(args, context) {
    if (args.includes("--help") || args.includes("-h")) {
      context.output.text(
        `Usage: ${this.usage}\n\nQueue translations and optionally assign each language to a review stage immediately. Queued translations may still be running.\n\n  --id <id>              Story ID\n  --language <lang[:code]>  AI language and optional space language code (repeatable)\n  --all-languages        Use all additional languages configured in the space\n  --review-stage <name-or-id>  Assign each accepted language to this existing stage\n  --workflow <name-or-id>  Disambiguate the review workflow\n  --overwrite            Ask Storyblok to overwrite existing translations\n  --space-id <id>        Target space\n  --yes                  Confirm translation and saving\n  --json                 Machine-readable report`,
      );
      return;
    }
    let id: number | undefined;
    let spaceIdOption: string | undefined;
    let overwrite = false;
    let allLanguages = false;
    let yes = false;
    let reviewStage: string | undefined;
    let workflow: string | undefined;
    const languages: Array<{ lang: string; code: string }> = [];
    for (let i = 0; i < args.length; i++) {
      const arg = args[i]!;
      if (arg === "--yes") {
        yes = true;
        continue;
      }
      if (arg === "--overwrite") {
        overwrite = true;
        continue;
      }
      if (arg === "--all-languages") {
        allLanguages = true;
        continue;
      }
      const equal = arg.indexOf("=");
      const key = equal < 0 ? arg : arg.slice(0, equal);
      if (
        ![
          "--id",
          "--space-id",
          "--language",
          "--review-stage",
          "--workflow",
        ].includes(key)
      )
        throw new CliError(`Unknown argument '${arg}'.`, 2);
      const value = equal < 0 ? args[++i] : arg.slice(equal + 1);
      if (!value || value.startsWith("--"))
        throw new CliError(`Option '${key}' requires a value.`, 2);
      if (key === "--review-stage") {
        if (reviewStage !== undefined)
          throw new CliError("Provide one review stage.", 2);
        reviewStage = value;
      } else if (key === "--workflow") {
        if (workflow !== undefined)
          throw new CliError("Provide one workflow.", 2);
        workflow = value;
      } else if (key === "--language") {
        const parts = value.split(":");
        if (parts.length > 2 || !parts[0] || (parts.length === 2 && !parts[1]))
          throw new CliError("Use --language <lang[:code]>.", 2);
        languages.push({ lang: parts[0], code: parts[1] ?? parts[0] });
      } else if (key === "--id") {
        if (
          id !== undefined ||
          !/^\d+$/.test(value) ||
          !Number.isSafeInteger(Number(value)) ||
          Number(value) <= 0
        )
          throw new CliError("Provide one positive story ID.", 2);
        id = Number(value);
      } else {
        if (spaceIdOption !== undefined)
          throw new CliError("Provide one space ID.", 2);
        spaceIdOption = value;
      }
    }
    if (
      !id ||
      (!allLanguages && !languages.length) ||
      (allLanguages && languages.length > 0) ||
      !yes ||
      (workflow !== undefined && reviewStage === undefined)
    )
      throw new CliError(
        "Provide --id, either --all-languages or at least one --language, and --yes.",
        2,
      );
    const spaceId = resolveSpaceId({
      environment: context.environment,
      option: spaceIdOption,
    });
    const gateway = context.createGateway(
      getStoryblokToken(context.environment),
    );
    const report = await context.output.activity(
      "Translating story",
      "Translation finished",
      () =>
        translateStoryWithAi(gateway, {
          spaceId,
          storyId: id!,
          ...(allLanguages ? { allLanguages: true } : { languages }),
          overwrite,
          ...(reviewStage
            ? {
                review: {
                  stage: reviewStage,
                  ...(workflow ? { workflow } : {}),
                },
              }
            : {}),
        }),
    );
    if (context.output.mode === "json") context.output.data(report);
    else
      context.output.summary(
        "AI translation",
        report.results
          .map(
            (result) =>
              `${result.language.code}: ${result.status}${result.backgroundTaskId ? ` (background task ${result.backgroundTaskId})` : ""}${result.error ? ` — ${result.error.message}` : ""}${result.review ? `; review ${result.review.status}${result.review.error ? ` — ${result.review.error.message}` : ""}` : ""}`,
          )
          .join("\n"),
      );
    if (report.failed)
      throw new CliError(
        "One or more translations failed or were not started; review the report.",
      );
  },
};
