import { describe, expect, test } from "bun:test";
import {
  parseComponentCreateOptions,
  parseComponentGetOptions,
  parseComponentListOptions,
  parseComponentUpdateOptions,
} from "./options.ts";

describe("component options", () => {
  test("parses list and get options", () => {
    expect(
      parseComponentListOptions(["--search", "page", "--space-id=42"]),
    ).toEqual({ search: "page", spaceId: "42" });
    expect(parseComponentGetOptions(["page", "--space-id", "42"])).toEqual({
      reference: "page",
      spaceId: "42",
    });
  });

  test("parses create and update definition files", () => {
    expect(parseComponentCreateOptions(["--file=page.yaml"])).toEqual({
      file: "page.yaml",
      spaceId: undefined,
    });
    expect(
      parseComponentUpdateOptions(["page", "--file", "page.yaml"]),
    ).toEqual({
      file: "page.yaml",
      reference: "page",
      spaceId: undefined,
    });
  });

  test("requires definition files for mutations", () => {
    expect(() => parseComponentCreateOptions([])).toThrow("is required");
    expect(() => parseComponentUpdateOptions(["page"])).toThrow("is required");
  });
});
