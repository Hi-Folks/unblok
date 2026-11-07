import { describe, expect, test } from "bun:test";
import { parseSpacePlanOptions } from "./plan-options.ts";

describe("parseSpacePlanOptions", () => {
  test("accepts separated and inline config paths", () => {
    expect(parseSpacePlanOptions(["--config", "demo.yaml"])).toEqual({
      config: "demo.yaml",
      spaceId: undefined,
    });
    expect(
      parseSpacePlanOptions(["--config=demo.yaml", "--space-id=42"]),
    ).toEqual({ config: "demo.yaml", spaceId: "42" });
  });

  test("requires one config path", () => {
    expect(() => parseSpacePlanOptions([])).toThrow("is required");
    expect(() =>
      parseSpacePlanOptions(["--config=a.yaml", "--config=b.yaml"]),
    ).toThrow("only be used once");
  });
});
