import { describe, expect, test } from "bun:test";
import { parseSpaceApplyOptions } from "./apply-options.ts";

describe("parseSpaceApplyOptions", () => {
  test("parses a confirmed apply", () => {
    expect(
      parseSpaceApplyOptions([
        "--config",
        "demo.yaml",
        "--space-id=42",
        "--yes",
      ]),
    ).toEqual({ config: "demo.yaml", spaceId: "42", yes: true });
  });

  test("requires explicit confirmation", () => {
    expect(() => parseSpaceApplyOptions(["--config", "demo.yaml"])).toThrow(
      "without '--yes'",
    );
  });
});
