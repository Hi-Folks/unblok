import { ClientError } from "@storyblok/management-api-client";

export const tokenGuidance = `Create a Management API personal access token:
1. In Storyblok, open My account → Account settings → Personal access tokens.
2. Select Generate New Token and grant access to the spaces and permissions you need.
3. Create or update .env in your current working directory:
   STORYBLOK_TOKEN=your-personal-access-token
   Alternatively, export STORYBLOK_TOKEN in your shell. An exported value takes precedence over .env.
Keep your token private and do not commit .env.
See https://www.storyblok.com/docs/concepts/access-tokens#management-api-access-tokens`;

export class CliError extends Error {
  constructor(
    message: string,
    readonly exitCode = 1,
    readonly code?: "INVALID_INPUT" | "NOT_FOUND" | "AMBIGUOUS" | "CONFLICT",
  ) {
    super(message);
    this.name = "CliError";
  }
}

export function formatError(error: unknown): string {
  const apiError =
    error instanceof ClientError
      ? error
      : error instanceof Error && error.cause instanceof ClientError
        ? error.cause
        : undefined;
  if (apiError?.response.status === 401) {
    return `Storyblok API error (401): Authentication failed. Your token may be invalid or expired.\n\n${tokenGuidance}`;
  }
  if (error instanceof ClientError) {
    const status = error.response.status;
    const data = error.response.data;
    const detail = data?.errors ?? data?.error ?? data?.message ?? data;
    const prefix =
      status > 0 ? `Storyblok API error (${status})` : "Storyblok API error";

    const formatted = formatApiDetail(detail);
    return `${prefix}: ${formatted || error.message}`;
  }

  if (error instanceof Error) {
    return error.message;
  }

  return "An unexpected error occurred.";
}

function formatApiDetail(detail: unknown, depth = 0): string {
  if (depth > 3) return "";
  if (typeof detail === "string") return detail.trim();
  if (Array.isArray(detail))
    return detail
      .map((item) => formatApiDetail(item, depth + 1))
      .filter(Boolean)
      .join(", ");
  if (detail && typeof detail === "object") {
    return Object.entries(detail)
      .filter(([key]) => !/token|secret|password|authorization/i.test(key))
      .map(([key, value]) => {
        const message = formatApiDetail(value, depth + 1);
        return message ? `${key}: ${message}` : "";
      })
      .filter(Boolean)
      .join("; ");
  }
  return "";
}
