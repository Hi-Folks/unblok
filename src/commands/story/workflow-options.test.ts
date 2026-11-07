import { describe, expect, test } from "bun:test";
import { parseStoryWorkflowOptions } from "./workflow-options.ts";

describe("workflow assignment options", () => {
  test("accepts unstaged selection and rejects releases", () => {
    expect(
      parseStoryWorkflowOptions(["--stage", "8", "--without-stage"], "plan")
        .withoutStage,
    ).toBe(true);
    expect(() =>
      parseStoryWorkflowOptions(
        ["--stage", "8", "--without-stage", "--release-id", "2"],
        "plan",
      ),
    ).toThrow("cannot be combined");
  });
  test("deduplicates IDs and requires explicit confirmation", () => {
    expect(
      parseStoryWorkflowOptions(
        ["--stage", "8", "--story", "1", "--story", "1", "--yes"],
        "assign",
      ).storyIds,
    ).toEqual([1]);
    expect(() =>
      parseStoryWorkflowOptions(["--stage", "8", "--story", "1"], "assign"),
    ).toThrow("without '--yes'");
  });

  test("rejects mixing explicit IDs and filters", () => {
    expect(() =>
      parseStoryWorkflowOptions(
        ["--stage", "8", "--story", "1", "--search", "news"],
        "plan",
      ),
    ).toThrow("Do not combine");
  });
});
