import { describe, expect, test } from "bun:test";
import { parseStoryTagsOptions } from "./tags.ts";

describe("story tag options", () => {
  test("parses and deduplicates repeated slugs and tags", () => {
    expect(
      parseStoryTagsOptions(
        [
          "--slug=home",
          "--slug",
          "home",
          "-t",
          "Page",
          "--tag",
          "Marketing",
          "--yes",
        ],
        "assign",
      ),
    ).toEqual({
      slugs: ["home"],
      tags: ["Page", "Marketing"],
      spaceId: undefined,
    });
  });
  test("requires confirmation and exact slugs", () => {
    expect(() =>
      parseStoryTagsOptions(["--slug", "home", "--tag", "Page"], "assign"),
    ).toThrow("--yes");
    expect(() =>
      parseStoryTagsOptions(["--slug", "news/*", "--tag", "Page"], "plan"),
    ).toThrow("exact full slugs");
  });
});
