import { spaceCommand } from "../commands/space/index.ts";
import { languageCommand } from "../commands/language/index.ts";
import { componentCommand } from "../commands/component/index.ts";
import { workflowCommand } from "../commands/workflow/index.ts";
import { storyCommand } from "../commands/story/index.ts";
import { experimentCommand } from "../commands/experiment/index.ts";
import { appCommand } from "../commands/app/index.ts";
import { assetCommand } from "../commands/asset/index.ts";
import { releaseCommand } from "../commands/release/index.ts";
import { pipelineCommand } from "../commands/pipeline/index.ts";
import { skillCommand } from "../commands/skill/index.ts";
import { dimensionsCommand } from "../commands/dimensions/index.ts";
import { guideCommand } from "../commands/guide.ts";
import {
  getStoryblokRequestsPerSecond,
  getStoryblokRegion,
  type Environment,
} from "../config/environment.ts";
import { BlueprintValidationError, CliError, formatError } from "../errors.ts";
import { createOutput, type Output } from "../output.ts";
import {
  createStoryblokGateway,
  type StoryblokGatewayFactory,
} from "../storyblok/gateway.ts";
import { dispatch } from "./dispatch.ts";
import { version } from "../version.ts";
import { toUnblokError } from "../actions/action-error.ts";
import { errorDiagnostics } from "./diagnostics.ts";

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
  assetCommand,
  releaseCommand,
  pipelineCommand,
  skillCommand,
  dimensionsCommand,
  guideCommand,
];

export async function runCli(
  args: string[],
  options: CliOptions = {},
): Promise<number> {
  const json = args.includes("--json");
  const verbose = args.includes("--verbose");
  const commandArgs = args.filter(
    (argument) => argument !== "--json" && argument !== "--verbose",
  );
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
    const exitCode = error instanceof CliError ? error.exitCode : 1;
    const classified = toUnblokError(error);
    const code =
      classified.code === "UNKNOWN" &&
      error instanceof CliError &&
      exitCode === 2
        ? "INVALID_INPUT"
        : classified.code;
    output.error(formatError(error), {
      code,
      exitCode,
      ...(classified.status === undefined ? {} : { status: classified.status }),
      ...(verbose ? { diagnostics: errorDiagnostics(error) } : {}),
      ...(error instanceof BlueprintValidationError
        ? { issues: error.issues }
        : {}),
    });
    return exitCode;
  }
}
