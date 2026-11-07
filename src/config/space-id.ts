import { CliError } from "../errors.ts";
import type { Environment } from "./environment.ts";

export interface ResolveSpaceIdInput {
  environment: Environment;
  option?: string;
  positional?: string;
}

export function resolveSpaceId(input: ResolveSpaceIdInput): number {
  if (input.option && input.positional) {
    throw new CliError(
      "Provide the space ID either positionally or with '--space-id', not both.",
      2,
    );
  }

  const value = (
    input.option ??
    input.positional ??
    input.environment.STORYBLOK_SPACE_ID
  )?.trim();

  if (!value || !/^\d+$/.test(value) || Number(value) < 1) {
    throw new CliError(
      "A positive space ID is required. Pass '--space-id' or set STORYBLOK_SPACE_ID.",
      2,
    );
  }

  return Number(value);
}
