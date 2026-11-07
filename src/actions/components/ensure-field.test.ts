import { describe, expect, test } from "bun:test";
import { ensureComponentField } from "./ensure-field.ts";

describe("ensureComponentField", () => {
  test("creates a custom field and tab, updates richtext, and preserves undeclared properties", async () => {
    let schema: Record<string, Record<string, unknown>> = {
      text: { type: "richtext", customize_toolbar: true, id: "keep", pos: 0, options: ["bold"] },
      old_tab: { type: "tab", display_name: "Content", keys: ["text"], pos: 1 },
    };
    let writes = 0;
    const component = () => ({ id: 1, name: "article-page", schema }) as never;
    const gateway = {
      listComponents: async () => [component()],
      getComponent: async () => component(),
      updateComponent: async (_space: number, _id: number, update: { schema?: unknown }) => { writes++; schema = update.schema as typeof schema; return component(); },
    };
    const seo = { component: "article-page", field: "SEO", type: "custom", field_type: "sb-ai-seo", tab: "SEO" };
    const richtext = { component: "article-page", field: "text", type: "richtext", customize_toolbar: false };
    expect((await ensureComponentField(gateway, 42, seo)).status).toBe("created");
    expect((await ensureComponentField(gateway, 42, richtext)).status).toBe("updated");
    expect(schema.SEO).toMatchObject({ type: "custom", field_type: "sb-ai-seo", options: [] });
    expect(schema.text).toEqual({ type: "richtext", customize_toolbar: false, id: "keep", pos: 0, options: ["bold"] });
    expect(schema.old_tab?.keys).toEqual(["text"]);
    expect(Object.values(schema).find((item) => item.display_name === "SEO")?.keys).toEqual(["SEO"]);
    expect((await ensureComponentField(gateway, 42, seo)).status).toBe("unchanged");
    expect((await ensureComponentField(gateway, 42, richtext)).status).toBe("unchanged");
    expect(writes).toBe(2);
    await expect(ensureComponentField(gateway, 42, { ...richtext, type: "text" })).rejects.toThrow("has type");
    expect(writes).toBe(2);
  });

  test("moves a field to the declared tab and preserves unrelated tab entries", async () => {
    let schema: Record<string, Record<string, unknown>> = { field: { type: "text", id: "x" }, a: { type: "tab", display_name: "Old", keys: ["field", "other"] }, b: { type: "tab", display_name: "New", keys: ["another"] } };
    const component = () => ({ id: 1, name: "page", schema }) as never;
    const gateway = { listComponents: async () => [component()], getComponent: async () => component(), updateComponent: async (_s: number, _id: number, update: { schema?: unknown }) => { schema = update.schema as typeof schema; return component(); } };
    expect((await ensureComponentField(gateway, 1, { component: "page", field: "field", type: "text", tab: "New" })).status).toBe("updated");
    expect(schema.a?.keys).toEqual(["other"]);
    expect(schema.b?.keys).toEqual(["another", "field"]);
  });
});
