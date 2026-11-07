import { describe, expect, test } from "bun:test";
import { parseFieldAddOptions } from "./field-add.ts";

describe("field-add options", () => {
  test("parses the demo script options", () => {
    expect(
      parseFieldAddOptions([
        "--component=article-page",
        "--field=SEO",
        "--type=custom",
        "--field-type=sb-ai-seo",
        "--tab=SEO",
      ]).input,
    ).toMatchObject({
      component: "article-page",
      field: "SEO",
      type: "custom",
      fieldType: "sb-ai-seo",
      tab: "SEO",
    });
  });
  test("requires the custom field plugin slug", () => {
    expect(() =>
      parseFieldAddOptions([
        "--component",
        "page",
        "--field",
        "SEO",
        "--tab",
        "SEO",
      ]),
    ).toThrow("--field-type");
  });
});
