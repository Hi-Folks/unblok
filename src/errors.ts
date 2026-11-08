import { ClientError } from "@storyblok/management-api-client";

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
