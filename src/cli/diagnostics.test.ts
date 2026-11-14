import { expect, test } from "bun:test";
import { ClientError } from "@storyblok/management-api-client";
import { UnblokError } from "../actions/action-error.ts";
import { errorDiagnostics } from "./diagnostics.ts";

test("reports an allowlisted response shape without exposing values or unknown field names", () => {
  const original = new ClientError("private-data", {
    status: 422,
    statusText: "Unprocessable",
    data: {
      errors: { slug: ["private-content"], token: ["secret"] },
      message: "private-data",
      "private-field": "secret",
    },
  });
  const error = new UnblokError(
    { code: "API_ERROR", message: "Failed", status: 422 },
    { cause: original, operation: "duplicate-story-to-dimension" },
  );
  const diagnostic = errorDiagnostics(error);
  expect(diagnostic).toEqual({
    operation: "duplicate-story-to-dimension",
    responseType: "object",
    fields: [
      { name: "errors", type: "object" },
      { name: "message", type: "string" },
      { name: "errors.slug", type: "array" },
    ],
    otherFieldCount: 1,
  });
  expect(JSON.stringify(diagnostic)).not.toContain("secret");
  expect(JSON.stringify(diagnostic)).not.toContain("private");
});
