import { describe, expect, test } from "bun:test";
import { parseDuplicateSpaceOptions } from "./duplicate-options.ts";

describe("parseDuplicateSpaceOptions", () => {
  test("parses a positional name and duplication flags", () => {
    expect(
      parseDuplicateSpaceOptions([
        "42",
        "Customer Demo",
        "--in-org",
        "--demo",
        "--assign-partner",
        "--space-type=production",
      ]),
    ).toEqual({
      assignPartner: true,
      demo: true,
      inOrg: true,
      name: "Customer Demo",
      onlyId: false,
      sourceSpaceId: 42,
      spaceType: "production",
    });
  });

  test("accepts the name as an option", () => {
    expect(parseDuplicateSpaceOptions(["42", "--name", "Demo"]).name).toBe(
      "Demo",
    );
  });

  test("requires a positive source ID", () => {
    expect(() => parseDuplicateSpaceOptions(["nope", "Demo"])).toThrow(
      "Source space ID must be a positive integer",
    );
  });

  test("requires a new space name", () => {
    expect(() => parseDuplicateSpaceOptions(["42"])).toThrow(
      "A name for the duplicated space is required",
    );
  });

  test("rejects two name sources", () => {
    expect(() =>
      parseDuplicateSpaceOptions(["42", "Demo", "--name", "Other"]),
    ).toThrow("either positionally or with '--name'");
  });
});
