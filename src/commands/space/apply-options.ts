import { CliError } from "../../errors.ts";

export interface SpaceApplyOptions {
  config: string;
  spaceId?: string;
  yes: boolean;
}

export function parseSpaceApplyOptions(args: string[]): SpaceApplyOptions {
  let config: string | undefined;
  let spaceId: string | undefined;
  let yes = false;

  for (let index = 0; index < args.length; index += 1) {
    const argument = args[index];
    const option = argument?.split("=", 1)[0];
    if (option === "--yes") {
      yes = true;
      continue;
    }
    if (option === "--config" || option === "--space-id") {
      const inlineValue = argument?.split("=", 2)[1];
      const value = inlineValue ?? args[index + 1];
      if (!value || value.startsWith("--")) {
        throw new CliError(`Option '${option}' requires a value.`, 2);
      }
      if (option === "--config") config = value;
      if (option === "--space-id") spaceId = value;
      if (inlineValue === undefined) index += 1;
    } else if (argument?.startsWith("--")) {
      throw new CliError(`Unknown option '${argument}'.`, 2);
    } else {
      throw new CliError(`Unexpected argument '${argument}'.`, 2);
    }
  }

  if (!config) throw new CliError("Option '--config <path>' is required.", 2);
  if (!yes) {
    throw new CliError(
      "Refusing to apply changes without '--yes'. Run 'space plan' first.",
      2,
    );
  }
  return { config, spaceId, yes };
}
