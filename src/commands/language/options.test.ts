import { describe, expect, test } from "bun:test";
import {
  parseLanguageAddOptions,
  parseLanguageListOptions,
} from "./options.ts";

describe("language options", () => {
  test("parses add options", () => {
    expect(
      parseLanguageAddOptions([
        "it",
        "Italian",
        "--space-id=42",
        "--ai-translation-code",
        "it",
      ]),
    ).toEqual({
      aiTranslationCode: "it",
      code: "it",
      name: "Italian",
      spaceId: "42",
    });
  });

  test("parses list space selection", () => {
    expect(parseLanguageListOptions(["--space-id", "42"])).toEqual({
      spaceId: "42",
    });
  });

  test("requires code and name for add", () => {
    expect(() => parseLanguageAddOptions(["it"])).toThrow(
      "code and name are required",
    );
  });
});
