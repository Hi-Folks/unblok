import { CliError } from "../../errors.ts";

interface ParsedOptions {
  aiTranslationCode?: string;
  positionals: string[];
  spaceId?: string;
}

function parseOptions(args: string[]): ParsedOptions {
  const positionals: string[] = [];
  let aiTranslationCode: string | undefined;
  let spaceId: string | undefined;

  for (let index = 0; index < args.length; index += 1) {
    const argument = args[index];
    const option = argument?.split("=", 1)[0];
    if (option === "--space-id" || option === "--ai-translation-code") {
      const inlineValue = argument?.split("=", 2)[1];
      const value = inlineValue ?? args[index + 1];
      if (!value || value.startsWith("--")) {
        throw new CliError(`Option '${option}' requires a value.`, 2);
      }

      if (option === "--space-id") {
        spaceId = value;
      } else {
        aiTranslationCode = value;
      }
      if (inlineValue === undefined) {
        index += 1;
      }
    } else if (argument?.startsWith("--")) {
      throw new CliError(`Unknown option '${argument}'.`, 2);
    } else if (argument) {
      positionals.push(argument);
    }
  }

  return { aiTranslationCode, positionals, spaceId };
}

export function parseLanguageListOptions(args: string[]): { spaceId?: string } {
  const options = parseOptions(args);
  if (options.positionals.length > 0) {
    throw new CliError(`Unexpected argument '${options.positionals[0]}'.`, 2);
  }
  if (options.aiTranslationCode) {
    throw new CliError("Option '--ai-translation-code' is not valid here.", 2);
  }
  return { spaceId: options.spaceId };
}

export function parseLanguageAddOptions(args: string[]): {
  aiTranslationCode?: string;
  code: string;
  name: string;
  spaceId?: string;
} {
  const options = parseOptions(args);
  const [code, name, extra] = options.positionals;
  if (!code || !name) {
    throw new CliError("Language code and name are required.", 2);
  }
  if (extra) {
    throw new CliError(`Unexpected argument '${extra}'.`, 2);
  }

  return {
    aiTranslationCode: options.aiTranslationCode,
    code: code.trim(),
    name: name.trim(),
    spaceId: options.spaceId,
  };
}
