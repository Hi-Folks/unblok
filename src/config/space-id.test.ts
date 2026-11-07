import { describe, expect, test } from "bun:test";
import { resolveSpaceId } from "./space-id.ts";

describe("resolveSpaceId", () => {
  test("prefers an explicit option over the environment", () => {
    expect(
      resolveSpaceId({
        environment: { STORYBLOK_SPACE_ID: "10" },
        option: "42",
      }),
    ).toBe(42);
  });

  test("uses the environment when no explicit ID is provided", () => {
    expect(resolveSpaceId({ environment: { STORYBLOK_SPACE_ID: "42" } })).toBe(
      42,
    );
  });

  test("rejects positional and option values together", () => {
    expect(() =>
      resolveSpaceId({ environment: {}, option: "42", positional: "10" }),
    ).toThrow("either positionally or with '--space-id'");
  });

  test("rejects a missing or invalid ID", () => {
    expect(() => resolveSpaceId({ environment: {} })).toThrow(
      "Pass '--space-id' or set STORYBLOK_SPACE_ID",
    );
  });
});
