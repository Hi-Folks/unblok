import { CliError } from "../../errors.ts";
import type { DuplicateSpaceOptions } from "../../storyblok/gateway.ts";

export interface ParsedDuplicateSpaceOptions extends DuplicateSpaceOptions {
  onlyId: boolean;
}

const BOOLEAN_OPTIONS = new Set([
  "assign-partner",
  "demo",
  "in-org",
  "only-id",
]);
const VALUE_OPTIONS = new Set(["name", "space-type"]);

function positiveInteger(value: string | undefined, label: string): number {
  if (!value || !/^\d+$/.test(value) || Number(value) < 1) {
    throw new CliError(`${label} must be a positive integer.`, 2);
  }
  return Number(value);
}

export function parseDuplicateSpaceOptions(
  args: string[],
): ParsedDuplicateSpaceOptions {
  const values = new Map<string, string | true>();
  const positionals: string[] = [];

  for (let index = 0; index < args.length; index += 1) {
    const argument = args[index];
    if (!argument?.startsWith("--")) {
      positionals.push(argument ?? "");
      continue;
    }

    const [name, inlineValue] = argument.slice(2).split("=", 2);

    if (BOOLEAN_OPTIONS.has(name ?? "")) {
      if (inlineValue !== undefined) {
        throw new CliError(`Option '--${name}' does not accept a value.`, 2);
      }
      values.set(name!, true);
      continue;
    }

    if (!VALUE_OPTIONS.has(name ?? "")) {
      throw new CliError(`Unknown option '${argument}'.`, 2);
    }

    const value = inlineValue ?? args[index + 1];
    if (!value || value.startsWith("--")) {
      throw new CliError(`Option '--${name}' requires a value.`, 2);
    }
    values.set(name!, value);
    if (inlineValue === undefined) {
      index += 1;
    }
  }

  if (positionals.length > 2) {
    throw new CliError(`Unexpected argument '${positionals[2]}'.`, 2);
  }

  const sourceSpaceId = positiveInteger(positionals[0], "Source space ID");
  const optionName = values.get("name");
  const positionalName = positionals[1];

  if (positionalName && optionName) {
    throw new CliError(
      "Provide the new space name either positionally or with '--name', not both.",
      2,
    );
  }

  const name = (
    typeof optionName === "string" ? optionName : positionalName
  )?.trim();
  if (!name) {
    throw new CliError("A name for the duplicated space is required.", 2);
  }

  const spaceType = values.get("space-type");

  return {
    assignPartner: values.has("assign-partner") || undefined,
    demo: values.has("demo") || undefined,
    inOrg: values.has("in-org") || undefined,
    name,
    onlyId: values.has("only-id"),
    sourceSpaceId,
    spaceType: typeof spaceType === "string" ? spaceType.trim() : undefined,
  };
}
