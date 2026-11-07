import {
  getPreviewToken,
  removeDemoMode,
  setPreviewUrls,
} from "../../actions/spaces/configure-space.ts";
import type { Command } from "../../cli/command.ts";
import { getStoryblokToken } from "../../config/environment.ts";
import { resolveSpaceId } from "../../config/space-id.ts";
import { CliError } from "../../errors.ts";

function parse(args: string[]) {
  let spaceId: string | undefined;
  let onlyToken = false;
  let url: string | undefined;
  const environments: Array<{ name: string; location: string }> = [];
  for (let index = 0; index < args.length; index++) {
    const arg = args[index];
    if (arg === "--only-token") {
      onlyToken = true;
      continue;
    }
    if (arg === "--space-id" || arg === "--environment" || arg === "-e") {
      const value = args[++index];
      if (!value || value.startsWith("--"))
        throw new CliError(`Option '${arg}' requires a value.`, 2);
      if (arg === "--space-id") spaceId = value;
      else {
        const split = value.indexOf("=");
        if (split < 1 || !value.slice(split + 1))
          throw new CliError("Environment must use Name=URL.", 2);
        environments.push({
          name: value.slice(0, split),
          location: value.slice(split + 1),
        });
      }
    } else if (arg?.startsWith("-"))
      throw new CliError(`Unknown option '${arg}'.`, 2);
    else if (!url) url = arg;
    else throw new CliError(`Unexpected argument '${arg}'.`, 2);
  }
  return { spaceId, onlyToken, url, environments };
}

function validateUrl(value: string): void {
  try {
    const url = new URL(value);
    if (url.protocol === "http:" || url.protocol === "https:") return;
  } catch {}
  throw new CliError("Preview URLs must be valid HTTP or HTTPS URLs.", 2);
}

export const spaceTokenCommand: Command = {
  name: "token",
  description: "Retrieve the first preview access token",
  usage: "unblok space token [--space-id <id>] [--only-token]",
  async run(args, context) {
    if (args.includes("--help") || args.includes("-h")) {
      context.output.text(
        `Usage: ${this.usage}\n\nPrint the preview access token. Treat the output as a secret.`,
      );
      return;
    }
    const options = parse(args);
    if (options.url || options.environments.length)
      throw new CliError("Unexpected arguments for space token.", 2);
    const spaceId = resolveSpaceId({
      environment: context.environment,
      option: options.spaceId,
    });
    const token = await getPreviewToken(
      context.createGateway(getStoryblokToken(context.environment)),
      spaceId,
    );
    if (context.output.mode === "json") context.output.data(token);
    else context.output.text(token);
  },
};

export const spacePreviewSetCommand: Command = {
  name: "preview-set",
  description: "Set the default preview URL and optional environments",
  usage:
    "unblok space preview-set <url> [--environment <name=url>] [--space-id <id>]",
  async run(args, context) {
    if (args.includes("--help") || args.includes("-h")) {
      context.output.text(
        `Usage: ${this.usage}\n\nRepeat --environment (or -e) to replace the additional environments. Omitting it preserves existing environments.`,
      );
      return;
    }
    const options = parse(args);
    if (!options.url || options.onlyToken)
      throw new CliError("A preview URL is required.", 2);
    validateUrl(options.url);
    options.environments.forEach((environment) =>
      validateUrl(environment.location),
    );
    const spaceId = resolveSpaceId({
      environment: context.environment,
      option: options.spaceId,
    });
    await setPreviewUrls(
      context.createGateway(getStoryblokToken(context.environment)),
      spaceId,
      options.url,
      options.environments.length ? options.environments : undefined,
    );
    if (context.output.mode === "json")
      context.output.data({ spaceId, updated: true });
    else context.output.info("Preview settings updated.");
  },
};

export const spaceDemoRemoveCommand: Command = {
  name: "demo-remove",
  description: "Disable demo mode",
  usage: "unblok space demo-remove [--space-id <id>]",
  async run(args, context) {
    if (args.includes("--help") || args.includes("-h")) {
      context.output.text(
        `Usage: ${this.usage}\n\nDisable demo mode for a space.`,
      );
      return;
    }
    const options = parse(args);
    if (options.url || options.onlyToken || options.environments.length)
      throw new CliError("Unexpected arguments for demo-remove.", 2);
    const spaceId = resolveSpaceId({
      environment: context.environment,
      option: options.spaceId,
    });
    const updated = await removeDemoMode(
      context.createGateway(getStoryblokToken(context.environment)),
      spaceId,
    );
    if (context.output.mode === "json")
      context.output.data({ spaceId, updated });
    else
      context.output.info(
        updated ? "Demo mode removed." : "Demo mode is already disabled.",
      );
  },
};
