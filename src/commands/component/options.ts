import { CliError } from "../../errors.ts";

interface ParsedComponentOptions {
  file?: string;
  positionals: string[];
  search?: string;
  spaceId?: string;
}

function parseOptions(args: string[]): ParsedComponentOptions {
  const positionals: string[] = [];
  let file: string | undefined;
  let search: string | undefined;
  let spaceId: string | undefined;

  for (let index = 0; index < args.length; index += 1) {
    const argument = args[index];
    const option = argument?.split("=", 1)[0];
    if (
      option === "--file" ||
      option === "--search" ||
      option === "--space-id"
    ) {
      const inlineValue = argument?.split("=", 2)[1];
      const value = inlineValue ?? args[index + 1];
      if (!value || value.startsWith("--")) {
        throw new CliError(`Option '${option}' requires a value.`, 2);
      }
      if (option === "--file") file = value;
      if (option === "--search") search = value;
      if (option === "--space-id") spaceId = value;
      if (inlineValue === undefined) index += 1;
    } else if (argument?.startsWith("--")) {
      throw new CliError(`Unknown option '${argument}'.`, 2);
    } else if (argument) {
      positionals.push(argument);
    }
  }

  return { file, positionals, search, spaceId };
}

export function parseComponentListOptions(args: string[]) {
  const options = parseOptions(args);
  if (options.positionals[0]) {
    throw new CliError(`Unexpected argument '${options.positionals[0]}'.`, 2);
  }
  if (options.file) {
    throw new CliError("Only '--search' and '--space-id' are valid here.", 2);
  }
  return { search: options.search, spaceId: options.spaceId };
}

export function parseComponentGetOptions(args: string[]) {
  const options = parseOptions(args);
  const [reference, extra] = options.positionals;
  if (!reference) throw new CliError("A component ID or name is required.", 2);
  if (extra) throw new CliError(`Unexpected argument '${extra}'.`, 2);
  if (options.file || options.search) {
    throw new CliError("Only '--space-id' is valid here.", 2);
  }
  return { reference, spaceId: options.spaceId };
}

export function parseComponentCreateOptions(args: string[]) {
  const options = parseOptions(args);
  if (options.positionals[0]) {
    throw new CliError(`Unexpected argument '${options.positionals[0]}'.`, 2);
  }
  if (!options.file)
    throw new CliError("Option '--file <path>' is required.", 2);
  if (options.search) {
    throw new CliError("Option is not valid for component create.", 2);
  }
  return { file: options.file, spaceId: options.spaceId };
}

export function parseComponentUpdateOptions(args: string[]) {
  const options = parseOptions(args);
  const [reference, extra] = options.positionals;
  if (!reference) throw new CliError("A component ID or name is required.", 2);
  if (extra) throw new CliError(`Unexpected argument '${extra}'.`, 2);
  if (!options.file)
    throw new CliError("Option '--file <path>' is required.", 2);
  if (options.search)
    throw new CliError("Option '--search' is not valid here.", 2);
  return {
    file: options.file,
    reference,
    spaceId: options.spaceId,
  };
}
