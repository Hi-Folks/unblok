import { CliError } from "../errors.ts";

export type Environment = Record<string, string | undefined>;

export function getStoryblokToken(environment: Environment): string {
  const token = environment.STORYBLOK_TOKEN?.trim();

  if (!token) {
    throw new CliError(
      "STORYBLOK_TOKEN is required. Add it to .env or export it in your shell.",
    );
  }

  return token;
}

export function getStoryblokRequestsPerSecond(
  environment: Environment,
): number {
  const value = environment.STORYBLOK_REQUESTS_PER_SECOND?.trim();
  if (!value) return 6;
  if (!/^\d+$/.test(value) || Number(value) < 1 || Number(value) > 100) {
    throw new CliError(
      "STORYBLOK_REQUESTS_PER_SECOND must be an integer between 1 and 100.",
    );
  }
  return Number(value);
}
