import { CliError } from "../../errors.ts";

export interface SpaceListOptions {
  ownedOnly: boolean;
  search?: string;
  soloOnly: boolean;
  updatedBefore?: number;
}

const BOOLEAN_OPTIONS = new Set(["owned-only", "solo-only"]);
const VALUE_OPTIONS = new Set(["search", "updated-before"]);

export function parseSpaceListOptions(args: string[]): SpaceListOptions {
  const values = new Map<string, string | true>();

  for (let index = 0; index < args.length; index += 1) {
    const argument = args[index];

    if (!argument?.startsWith("--")) {
      throw new CliError(`Unexpected argument '${argument}'.`, 2);
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

  const search = values.get("search");
  const updatedBeforeValue = values.get("updated-before");
  let updatedBefore: number | undefined;

  if (typeof updatedBeforeValue === "string") {
    if (!/^\d+$/.test(updatedBeforeValue) || Number(updatedBeforeValue) < 1) {
      throw new CliError(
        "Option '--updated-before' must be a positive integer.",
        2,
      );
    }
    updatedBefore = Number(updatedBeforeValue);
  }

  return {
    ownedOnly: values.has("owned-only") || values.has("solo-only"),
    search: typeof search === "string" ? search : undefined,
    soloOnly: values.has("solo-only"),
    updatedBefore,
  };
}
