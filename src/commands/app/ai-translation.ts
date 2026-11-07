import {
  enableAiTranslation,
  type AiTranslationOperation,
} from "../../actions/apps/ai-translation.ts";
import type { Command } from "../../cli/command.ts";
import { dispatch } from "../../cli/dispatch.ts";
import { getStoryblokToken } from "../../config/environment.ts";
import { resolveSpaceId } from "../../config/space-id.ts";
import { CliError } from "../../errors.ts";

const enable: Command = {
  name: "enable",
  description: "Accept the disclaimer and install AI Translations",
  usage:
    "unblok app ai-translation enable --disclaimer-id <id> [--space-id <id>] --yes",
  async run(args, context) {
    if (args.includes("--help") || args.includes("-h")) {
      context.output.text(
        `Usage: ${this.usage}\n\nAccept the specified Storyblok disclaimer and install AI Translations (app 29942). --yes is required. Use --json for a report.`,
      );
      return;
    }
    let disclaimerId: string | undefined;
    let spaceIdOption: string | undefined;
    let yes = false;
    for (let i = 0; i < args.length; i++) {
      const arg = args[i]!;
      if (arg === "--yes") {
        yes = true;
        continue;
      }
      const separator = arg.indexOf("=");
      const option = separator < 0 ? arg : arg.slice(0, separator);
      if (option !== "--space-id" && option !== "--disclaimer-id")
        throw new CliError(`Unknown argument '${arg}'.`, 2);
      const value = separator < 0 ? args[++i] : arg.slice(separator + 1);
      if (!value || value.startsWith("--"))
        throw new CliError(`Option '${option}' requires a value.`, 2);
      if (option === "--space-id") {
        if (spaceIdOption) throw new CliError("Duplicate --space-id.", 2);
        spaceIdOption = value;
      } else {
        if (disclaimerId) throw new CliError("Duplicate --disclaimer-id.", 2);
        disclaimerId = value;
      }
    }
    if (
      !yes ||
      !disclaimerId ||
      !/^\d+$/.test(disclaimerId) ||
      !Number.isSafeInteger(Number(disclaimerId)) ||
      Number(disclaimerId) <= 0
    )
      throw new CliError(
        "A positive --disclaimer-id and --yes are required.",
        2,
      );
    const spaceId = resolveSpaceId({
      environment: context.environment,
      option: spaceIdOption,
    });
    const operations: AiTranslationOperation[] = [];
    const gateway = context.createGateway(
      getStoryblokToken(context.environment),
    );
    try {
      await enableAiTranslation(
        gateway,
        spaceId,
        Number(disclaimerId),
        operations,
      );
    } catch (error) {
      if (context.output.mode === "json")
        context.output.data({ target: { spaceId }, operations, failed: true });
      else if (operations.length)
        context.output.note(
          "Completed before failure",
          operations
            .map((item) => `${item.status} ${item.operation} ${item.key}`)
            .join("\n"),
        );
      throw error;
    }
    if (context.output.mode === "json")
      context.output.data({ target: { spaceId }, operations, failed: false });
    else
      context.output.note(
        "AI Translations",
        operations
          .map((item) => `${item.status} ${item.operation} ${item.key}`)
          .join("\n"),
      );
  },
};

export const aiTranslationCommand: Command = {
  name: "ai-translation",
  description: "Manage AI Translations",
  async run(args, context) {
    await dispatch("unblok app ai-translation", [enable], args, context);
  },
};
