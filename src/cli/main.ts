import { spaceCommand } from "../commands/space/index.ts";
import { languageCommand } from "../commands/language/index.ts";
import { componentCommand } from "../commands/component/index.ts";
import { workflowCommand } from "../commands/workflow/index.ts";
import { storyCommand } from "../commands/story/index.ts";
import { experimentCommand } from "../commands/experiment/index.ts";
import { appCommand } from "../commands/app/index.ts";
import {
  getStoryblokRequestsPerSecond,
  getStoryblokRegion,
  type Environment,
} from "../config/environment.ts";
import { CliError, formatError } from "../errors.ts";
import { createOutput, type Output } from "../output.ts";
import {
  createStoryblokGateway,
  type StoryblokGatewayFactory,
} from "../storyblok/gateway.ts";
import { dispatch } from "./dispatch.ts";
import { version as packageVersion } from "../../package.json";

declare const UNBLOK_BUILD_VERSION: string | undefined;
const version =
  typeof UNBLOK_BUILD_VERSION === "undefined"
    ? packageVersion
    : UNBLOK_BUILD_VERSION;

export interface CliOptions {
  createGateway?: StoryblokGatewayFactory;
  environment?: Environment;
  output?: Output;
}

const commands = [
  spaceCommand,
  languageCommand,
  componentCommand,
  workflowCommand,
  storyCommand,
  experimentCommand,
  appCommand,
];

export async function runCli(
  args: string[],
  options: CliOptions = {},
): Promise<number> {
  const json = args.includes("--json");
  const commandArgs = args.filter((argument) => argument !== "--json");
  const output = options.output ?? createOutput({ json });

  try {
    if (commandArgs.length === 1 && commandArgs[0] === "--version") {
      if (output.mode === "json") output.data({ version });
      else output.text(`unblok ${version}`);
      return 0;
    }
    await dispatch("unblok", commands, commandArgs, {
      createGateway:
        options.createGateway ??
        ((token) =>
          createStoryblokGateway(token, {
            requestsPerSecond: getStoryblokRequestsPerSecond(
              options.environment ?? process.env,
            ),
            region: getStoryblokRegion(options.environment ?? process.env),
          })),
      environment: options.environment ?? process.env,
      output,
    });
    return 0;
  } catch (error) {
    output.error(formatError(error));
    return error instanceof CliError ? error.exitCode : 1;
  }
}
