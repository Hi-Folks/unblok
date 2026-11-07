import { describe, expect, test } from "bun:test";
import { planBlueprint } from "./blueprint.ts";

describe("version 1 setup blueprint inventory", () => {
  test("identifies supported building blocks and unimplemented operations", () => {
    const result = planBlueprint({
      version: 1,
      template: { name: "Demo" },
      space: { duplicate_from: "42", readiness: { timeout_seconds: 120 } },
      ai: { inherit_org_configuration: false },
      apps: { install: ["import", { id: 123 }] },
      components: {
        fields: [
          {
            component: "page",
            field: "SEO",
            tab: "SEO",
            type: "custom",
            field_type: "sb-ai-seo",
          },
          {
            component: "page",
            field: "text",
            type: "richtext",
            customize_toolbar: false,
          },
        ],
      },
      assets: { upload_directory: [{ source: "./assets" }] },
      workflow: { assign_unstaged: true, stage_id: null },
      tags: [{ stories: { slugs: ["home"] }, tags: ["Landing"] }],
    });
    expect(result.name).toBe("Demo");
    expect(result.operations).toContainEqual({
      path: "apps.install[id]",
      operation: "install apps by ID",
      support: "available",
      count: 1,
    });
    expect(result.operations).toContainEqual({
      path: "ai.inherit_org_configuration",
      operation: "configure AI inheritance",
      support: "available",
    });
    expect(result.operations).toContainEqual({
      path: "components.fields[1]",
      operation: "reconcile component field",
      support: "available",
    });
    expect(
      result.operations.some(
        (item) =>
          item.path === "assets.upload_directory" &&
          item.support === "available",
      ),
    ).toBe(true);
    expect(result.note).toContain("workflows");
  });
  test("rejects unknown sections and options instead of ignoring them", () => {
    expect(() => planBlueprint({ version: 1, unknown: {} })).toThrow(
      "Unsupported setup section",
    );
    expect(() =>
      planBlueprint({ version: 1, space: { unsupported: true } }),
    ).toThrow("Unsupported setup option");
  });
});
