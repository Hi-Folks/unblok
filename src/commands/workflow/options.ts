import { CliError } from "../../errors.ts";

export function parseWorkflowOptions(args: string[]): {
  reference?: string;
  search?: string;
  spaceId?: string;
  workflow?: string;
} {
  const positionals: string[] = [];
  let search: string | undefined;
  let spaceId: string | undefined;
  let workflow: string | undefined;

  for (let index = 0; index < args.length; index += 1) {
    const argument = args[index];
    const option = argument?.split("=", 1)[0];
    if (
      option === "--search" ||
      option === "--space-id" ||
      option === "--workflow"
    ) {
      const inline = argument?.split("=", 2)[1];
      const value = inline ?? args[index + 1];
      if (!value || value.startsWith("--")) {
        throw new CliError(`Option '${option}' requires a value.`, 2);
      }
      if (option === "--search") search = value;
      if (option === "--space-id") spaceId = value;
      if (option === "--workflow") workflow = value;
      if (inline === undefined) index += 1;
    } else if (argument?.startsWith("--")) {
      throw new CliError(`Unknown option '${argument}'.`, 2);
    } else if (argument) {
      positionals.push(argument);
    }
  }
  if (positionals.length > 1) {
    throw new CliError(`Unexpected argument '${positionals[1]}'.`, 2);
  }
  return { reference: positionals[0], search, spaceId, workflow };
}
