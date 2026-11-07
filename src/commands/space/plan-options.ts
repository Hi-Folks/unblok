import { CliError } from "../../errors.ts";

export interface SpacePlanOptions {
  config: string;
  spaceId?: string;
}

export function parseSpacePlanOptions(args: string[]): SpacePlanOptions {
  let config: string | undefined;
  let spaceId: string | undefined;

  for (let index = 0; index < args.length; index += 1) {
    const argument = args[index];
    if (argument === "--config" || argument?.startsWith("--config=")) {
      const inlineValue = argument.split("=", 2)[1];
      const value = inlineValue ?? args[index + 1];
      if (!value || value.startsWith("--")) {
        throw new CliError("Option '--config' requires a file path.", 2);
      }
      if (config !== undefined) {
        throw new CliError("Option '--config' may only be used once.", 2);
      }
      config = value;
      if (inlineValue === undefined) {
        index += 1;
      }
    } else if (
      argument === "--space-id" ||
      argument?.startsWith("--space-id=")
    ) {
      const inlineValue = argument.split("=", 2)[1];
      const value = inlineValue ?? args[index + 1];
      if (!value || value.startsWith("--")) {
        throw new CliError("Option '--space-id' requires a value.", 2);
      }
      spaceId = value;
      if (inlineValue === undefined) {
        index += 1;
      }
    } else if (argument?.startsWith("--")) {
      throw new CliError(`Unknown option '${argument}'.`, 2);
    } else {
      throw new CliError(`Unexpected argument '${argument}'.`, 2);
    }
  }

  if (!config) {
    throw new CliError("Option '--config <path>' is required.", 2);
  }

  return { config, spaceId };
}
