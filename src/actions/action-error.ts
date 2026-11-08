import { ClientError } from "@storyblok/management-api-client";
import { CliError } from "../errors.ts";

export type UnblokErrorCode =
  | "INVALID_INPUT"
  | "NOT_FOUND"
  | "AMBIGUOUS"
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
  constructor(info: UnblokErrorInfo, options?: { cause?: unknown }) {
    super(info.message, options);
    this.name = "UnblokError";
    this.code = info.code;
    this.status = info.status;
  }
}

/** Classify known errors without inferring a code from human-readable text. */
export function toUnblokError(error: unknown): UnblokError {
  if (error instanceof UnblokError) return error;
  if (error instanceof ClientError) {
    const status = error.response.status;
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
            ? `Storyblok API request failed (HTTP ${status}).`
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
