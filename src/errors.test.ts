import { describe, expect, test } from "bun:test";
import { ClientError } from "@storyblok/management-api-client";
import { formatError } from "./errors.ts";

describe("formatError", () => {
  test("explains how to replace a rejected token without exposing API details", () => {
    const error = new ClientError("sensitive-token", {
      status: 401,
      statusText: "Unauthorized",
      data: { message: "sensitive-token" },
    });
    for (const failure of [error, new Error("wrapped", { cause: error })]) {
      const message = formatError(failure);
      expect(message).toContain("invalid or expired");
      expect(message).toContain("Personal access tokens");
      expect(message).toContain("STORYBLOK_TOKEN=your-personal-access-token");
      expect(message).toContain("#management-api-access-tokens");
      expect(message).not.toContain("sensitive-token");
    }
  });

  test("preserves permission errors instead of treating them as expired tokens", () => {
    const error = new ClientError("Forbidden", {
      status: 403,
      statusText: "Forbidden",
      data: { message: "Insufficient permissions" },
    });
    expect(formatError(error)).toBe(
      "Storyblok API error (403): Insufficient permissions",
    );
  });
  test("includes top-level Storyblok validation fields", () => {
    const error = new ClientError("Unprocessable Content", {
      status: 422,
      statusText: "Unprocessable Content",
      data: { name: ["has already been taken"], password: "hidden" },
    });
    expect(formatError(error)).toBe(
      "Storyblok API error (422): name: has already been taken",
    );
  });
  test("includes structured validation errors without sensitive fields", () => {
    const error = new ClientError("Unprocessable Content", {
      status: 422,
      statusText: "Unprocessable Content",
      data: { errors: { name: ["has already been taken"], token: "secret" } },
    });
    expect(formatError(error)).toBe(
      "Storyblok API error (422): name: has already been taken",
    );
  });
  test("falls back to the HTTP message", () => {
    const error = new ClientError("Unprocessable Content", {
      status: 422,
      statusText: "Unprocessable Content",
      data: {},
    });
    expect(formatError(error)).toBe(
      "Storyblok API error (422): Unprocessable Content",
    );
  });
});
