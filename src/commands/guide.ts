import type { Command } from "../cli/command.ts";
import { CliError } from "../errors.ts";
import { dimensionsCoverageCommand } from "./dimensions/coverage.ts";
import { listLanguagesCommand } from "./language/list.ts";
import { spaceSetupCommand } from "./space/setup.ts";
import { isValidStoryCreationSlug } from "../actions/stories/create-story.ts";

const quote = (value: string) =>
  /^[a-zA-Z0-9_./:@-]+$/.test(value)
    ? value
    : `'${value.replaceAll("'", "'\\''")}'`;
const positiveId = (value: string) =>
  /^\d+$/.test(value) &&
  Number.isSafeInteger(Number(value)) &&
  Number(value) > 0
    ? undefined
    : "Enter a positive numeric ID.";

export const guideCommand: Command = {
  name: "guide",
  description: "Explore common workflows interactively",
  usage: "unblok guide",
  async run(args, context) {
    if (args.includes("--help") || args.includes("-h")) {
      context.output.text(
        `Usage: ${this.usage}\n\nChoose a Dimensions, translation, or demo setup workflow. The guide runs read-only checks or local plans and displays commands for requested changes. Requires an interactive terminal; it does not support --json.`,
      );
      return;
    }
    if (args.length) throw new CliError(`Unknown argument '${args[0]}'.`, 2);
    if (
      context.output.mode === "json" ||
      !context.output.canPrompt ||
      !context.output.select
    )
      throw new CliError(
        "The guide requires an interactive terminal. Use 'unblok --help' or 'unblok space setup examples' for non-interactive discovery.",
        2,
      );
    const choice = await context.output.select("What would you like to do?", [
      {
        value: "dimensions",
        label: "Check Dimensions coverage",
        hint: "Find linked and missing country variants",
      },
      {
        value: "translation",
        label: "Prepare an AI translation",
        hint: "Inspect languages and prepare a command",
      },
      {
        value: "demo",
        label: "Plan a demo setup",
        hint: "Validate an existing YAML blueprint",
      },
    ]);
    const cancel = () => context.output.info("Guide cancelled.");
    const showCommand = (purpose: "Running" | "Review", args: string[]) =>
      context.output.text(
        `Command (${purpose}):\n  ${args.map(quote).join(" ")}`,
      );
    if (choice === null) {
      cancel();
      return;
    }
    if (choice === "dimensions") {
      const enteredPath = await context.output.input(
        "Source folder path, e.g. global/articles/",
        (value) =>
          value === value.trim() &&
          isValidStoryCreationSlug(value.replace(/^\//, "").replace(/\/$/, ""))
            ? undefined
            : "Enter a path like global/articles/ without surrounding spaces, empty segments, or wildcards.",
      );
      if (enteredPath === null) {
        cancel();
        return;
      }
      const path = enteredPath.replace(/^\//, "");
      const spaceId = await context.output.input("Space ID", positiveId);
      if (spaceId === null) {
        cancel();
        return;
      }
      showCommand("Running", [
        "unblok",
        "dimensions",
        "coverage",
        "--starts-with",
        path,
        "--space-id",
        spaceId,
      ]);
      await dimensionsCoverageCommand.run(
        ["--starts-with", path, "--space-id", spaceId],
        context,
      );
      context.output.text(
        "Next: use 'unblok dimensions create-missing --help' to plan missing variants.",
      );
    } else if (choice === "translation") {
      const spaceId = await context.output.input("Space ID", positiveId);
      if (spaceId === null) {
        cancel();
        return;
      }
      showCommand("Running", [
        "unblok",
        "language",
        "list",
        "--space-id",
        spaceId,
      ]);
      await listLanguagesCommand.run(["--space-id", spaceId], context);
      const storyId = await context.output.input("Story ID", positiveId);
      if (storyId === null) {
        cancel();
        return;
      }
      const language = await context.output.input(
        "AI language code (or AI code:space code), e.g. de",
        (value) =>
          /^[A-Za-z0-9_-]+(?::[A-Za-z0-9_-]+)?$/.test(value)
            ? undefined
            : "Enter a language code such as de or fr:fr-be.",
      );
      if (language === null) {
        cancel();
        return;
      }
      showCommand("Review", [
        "unblok",
        "story",
        "ai-translate",
        "--id",
        storyId,
        "--language",
        language,
        "--space-id",
        spaceId,
        "--yes",
      ]);
      context.output.text(
        "Run the command above to request a translation. Translation may run in the background. Use 'unblok story ai-translate --help' for review-stage options.",
      );
    } else if (choice === "demo") {
      context.output.text(
        "Explore bundled examples with 'unblok space setup examples'. The plan below validates a YAML file locally.",
      );
      const config = await context.output.input(
        "Path to an existing YAML setup",
        (value) =>
          value.trim() && value === value.trim() && !value.startsWith("--")
            ? undefined
            : "Enter a file path without surrounding spaces.",
      );
      if (config === null) {
        cancel();
        return;
      }
      showCommand("Running", [
        "unblok",
        "space",
        "setup",
        "plan",
        "--config",
        config,
      ]);
      await spaceSetupCommand.run(["plan", "--config", config], context);
      context.output.text(
        `After reviewing the plan, see 'unblok space setup apply --help' for applying it.`,
      );
    } else throw new CliError("Unknown guide selection.", 2);
  },
};
