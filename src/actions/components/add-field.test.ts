import { describe, expect, test } from "bun:test";
import { addComponentField } from "./add-field.ts";

describe("addComponentField", () => {
  const input = {
    component: "page",
    field: "SEO",
    type: "custom",
    fieldType: "sb-ai-seo",
    tab: "SEO",
  };
  test("preserves schema and creates a tab and plugin field", async () => {
    let payload: unknown;
    const component = {
      id: 1,
      name: "page",
      schema: { title: { id: "field-id", type: "text", pos: 3 } },
    };
    const gateway = {
      getComponent: async () => component as never,
      listComponents: async () => [component] as never,
      updateComponent: async (_space: number, _id: number, value: unknown) => {
        payload = value;
        return component as never;
      },
    };
    expect((await addComponentField(gateway, 42, input)).status).toBe(
      "created",
    );
    const schema = (
      payload as { schema: Record<string, Record<string, unknown>> }
    ).schema;
    expect(schema.title).toEqual(component.schema.title);
    expect(schema.SEO).toEqual({
      type: "custom",
      field_type: "sb-ai-seo",
      options: [],
      pos: 5,
    });
    expect(
      Object.entries(schema).find(([key]) => key.startsWith("tab-"))?.[1],
    ).toEqual({ type: "tab", display_name: "SEO", keys: ["SEO"], pos: 4 });
  });
  test("reuses an existing tab, skips a match and rejects a conflict", async () => {
    const schema: Record<string, Record<string, unknown>> = {
      tab: { type: "tab", display_name: "SEO", keys: [], pos: 0 },
    };
    let writes = 0;
    const component = { id: 1, name: "page", schema };
    const gateway = {
      getComponent: async () => component as never,
      listComponents: async () => [component] as never,
      updateComponent: async (
        _space: number,
        _id: number,
        value: { schema?: unknown },
      ) => {
        writes++;
        Object.assign(schema, value.schema);
        return component as never;
      },
    };
    await addComponentField(gateway, 42, input);
    expect(schema.tab?.keys).toEqual(["SEO"]);
    expect((await addComponentField(gateway, 42, input)).status).toBe(
      "unchanged",
    );
    expect(writes).toBe(1);
    await expect(
      addComponentField(gateway, 42, { ...input, fieldType: "another" }),
    ).rejects.toThrow("different definition");
  });
});
