import { describe, expect, test } from "bun:test";
import { parseSpaceListOptions } from "./list-options.ts";

describe("parseSpaceListOptions", () => {
  test("supports inline and separated values", () => {
    expect(
      parseSpaceListOptions([
        "--search=demo",
        "--updated-before",
        "90",
        "--owned-only",
      ]),
    ).toEqual({
      ownedOnly: true,
      search: "demo",
      soloOnly: false,
      updatedBefore: 90,
    });
  });

  test("solo-only implies owned-only", () => {
    expect(parseSpaceListOptions(["--solo-only"]).ownedOnly).toBe(true);
  });

  test("rejects invalid day values", () => {
    expect(() => parseSpaceListOptions(["--updated-before=0"])).toThrow(
      "must be a positive integer",
    );
  });

  test("parses a newest-space limit and rejects invalid values", () => {
    expect(parseSpaceListOptions(["--limit", "5"]).limit).toBe(5);
    expect(parseSpaceListOptions(["--limit=12"]).limit).toBe(12);
    for (const value of ["0", "-1", "1.5", "9007199254740992"]) {
      expect(() => parseSpaceListOptions([`--limit=${value}`])).toThrow(
        "positive integer",
      );
    }
  });

  test("rejects unknown options", () => {
    expect(() => parseSpaceListOptions(["--unknown"])).toThrow(
      "Unknown option '--unknown'",
    );
  });
});
