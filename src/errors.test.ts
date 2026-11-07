import { describe, expect, test } from "bun:test";
import { ClientError } from "@storyblok/management-api-client";
import { formatError } from "./errors.ts";

describe("formatError", () => {
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
