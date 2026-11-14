import { ClientError } from "@storyblok/management-api-client";
import { UnblokError } from "../actions/action-error.ts";

export interface ErrorDiagnostics {
  operation?: string;
  responseType: string;
  fields?: Array<{ name: string; type: string }>;
  otherFieldCount?: number;
}

/** Describe only a known response shape, never API values, paths, or headers. */
export function errorDiagnostics(error: unknown): ErrorDiagnostics | undefined {
  const operation = error instanceof UnblokError ? error.operation : undefined;
  let current: unknown = error;
  const seen = new Set<unknown>();
  while (
    current instanceof Error &&
    !seen.has(current) &&
    !(current instanceof ClientError)
  ) {
    seen.add(current);
    current = current.cause;
  }
  if (!(current instanceof ClientError))
    return operation ? { operation, responseType: "unavailable" } : undefined;
  const value = current.response.data;
  const type = (item: unknown) =>
    item === null ? "null" : Array.isArray(item) ? "array" : typeof item;
  if (!value || typeof value !== "object" || Array.isArray(value))
    return { ...(operation ? { operation } : {}), responseType: type(value) };
  const entries = Object.entries(value);
  const allowed = new Set([
    "error",
    "errors",
    "message",
    "status",
    "name",
    "slug",
    "path",
    "group_id",
    "parent_id",
    "target_dimension",
    "is_startpage",
  ]);
  const fields = entries
    .filter(([key]) => allowed.has(key))
    .map(([name, item]) => ({ name, type: type(item) }));
  const errors = (value as Record<string, unknown>).errors;
  if (errors && typeof errors === "object" && !Array.isArray(errors)) {
    for (const [key, item] of Object.entries(errors))
      if (allowed.has(key))
        fields.push({ name: `errors.${key}`, type: type(item) });
  }
  return {
    ...(operation ? { operation } : {}),
    responseType: "object",
    fields,
    otherFieldCount:
      entries.length - entries.filter(([key]) => allowed.has(key)).length,
  };
}
