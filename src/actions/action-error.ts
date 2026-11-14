import { ClientError } from "@storyblok/management-api-client";
import { CliError } from "../errors.ts";

export type UnblokErrorCode =
  | "INVALID_INPUT"
  | "NOT_FOUND"
  | "AMBIGUOUS"
  | "CONFLICT"
  | "UNAUTHORIZED"
  | "PERMISSION_DENIED"
  | "RATE_LIMITED"
  | "API_ERROR"
  | "UNKNOWN";
export interface UnblokErrorInfo {
  code: UnblokErrorCode;
  message: string;
  status?: number;
}

export class UnblokError extends Error {
  readonly code: UnblokErrorCode;
  readonly status?: number;
  readonly operation?: string;
  constructor(
    info: UnblokErrorInfo,
    options?: { cause?: unknown; operation?: string },
  ) {
    super(info.message, options);
    this.name = "UnblokError";
    this.code = info.code;
    this.status = info.status;
    this.operation = options?.operation;
  }
}

// API responses can contain story content or credentials. Only expose known
// validation messages for a small set of non-sensitive field names.
function safeValidationDetails(data: unknown): string {
  if (!data || typeof data !== "object" || Array.isArray(data)) return "";
  const body = data as Record<string, unknown>;
  const candidate =
    body.errors &&
    typeof body.errors === "object" &&
    !Array.isArray(body.errors)
      ? (body.errors as Record<string, unknown>)
      : body;
  const fields = new Set([
    "name",
    "slug",
    "path",
    "group_id",
    "parent_id",
    "target_dimension",
    "is_startpage",
  ]);
  const messages = new Set([
    "has already been taken",
    "is already taken",
    "can't be blank",
    "cannot be blank",
    "is invalid",
    "must be unique",
    "is required",
  ]);
  return Object.entries(candidate)
    .flatMap(([field, value]) => {
      if (!fields.has(field)) return [];
      const values = Array.isArray(value) ? value : [value];
      return values
        .filter(
          (message): message is string =>
            typeof message === "string" && messages.has(message),
        )
        .map((message) => `${field}: ${message}`);
    })
    .join("; ");
}

/** Classify known errors without inferring a code from human-readable text. */
export function toUnblokError(error: unknown): UnblokError {
  if (error instanceof UnblokError) return error;
  if (error instanceof ClientError) {
    const status = error.response.status;
    const validation =
      status === 422 ? safeValidationDetails(error.response.data) : "";
    const code: UnblokErrorCode =
      status === 401
        ? "UNAUTHORIZED"
        : status === 403
          ? "PERMISSION_DENIED"
          : status === 404
            ? "NOT_FOUND"
            : status === 429
              ? "RATE_LIMITED"
              : "API_ERROR";
    return new UnblokError(
      {
        code,
        message:
          status > 0
            ? `Storyblok API request failed (HTTP ${status}).${validation ? ` ${validation}.` : ""}`
            : "Storyblok API request failed.",
        ...(status > 0 ? { status } : {}),
      },
      { cause: error },
    );
  }
  if (error instanceof CliError && error.code)
    return new UnblokError(
      { code: error.code, message: error.message },
      { cause: error },
    );
  return new UnblokError(
    { code: "UNKNOWN", message: "An unexpected error occurred." },
    { cause: error },
  );
}

export function errorInfo(error: unknown): UnblokErrorInfo {
  const classified = toUnblokError(error);
  return {
    code: classified.code,
    message: classified.message,
    ...(classified.status === undefined ? {} : { status: classified.status }),
  };
}
