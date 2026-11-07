import { describe, expect, test } from "bun:test";
import {
  compareComponent,
  createComponent,
  getComponent,
  toComponentPayload,
  updateComponent,
} from "./component.ts";

describe("component actions", () => {
  test("compares only declared fields and ignores object key order", () => {
    const current = [
      {
        id: 10,
        name: "page",
        display_name: "Page",
        schema: {
          body: {
            id: "generated-id",
            position: 0,
            required: true,
            type: "bloks",
          },
        },
      },
    ] as never;

    expect(
      compareComponent(
        {
          name: "page",
          schema: { body: { type: "bloks", required: true } },
        },
        current,
      ),
    ).toBe("unchanged");
    expect(
      compareComponent({ name: "page", displayName: "Landing page" }, current),
    ).toBe("update");
    expect(compareComponent({ name: "feature" }, current)).toBe("create");
    expect(
      compareComponent(
        {
          name: "page",
          schema: {
            body: { type: "bloks" },
            title: { type: "text" },
          },
        },
        current,
      ),
    ).toBe("update");
  });

  test("maps camel-case definitions to Storyblok payloads", () => {
    expect(
      toComponentPayload({
        name: "page",
        displayName: "Page",
        isRoot: true,
        schema: { title: { type: "text" } },
      }),
    ).toEqual({
      display_name: "Page",
      is_root: true,
      name: "page",
      schema: { title: { type: "text" } },
    });
  });

  test("resolves exact names through a filtered list", async () => {
    let search: string | undefined;
    const component = await getComponent(
      {
        getComponent: async () => ({}) as never,
        listComponents: async (_spaceId, options) => {
          search = options?.search;
          return [
            { id: 1, name: "page-old" },
            { id: 2, name: "page" },
          ] as never;
        },
      },
      42,
      "page",
    );

    expect(search).toBe("page");
    expect(component.id).toBe(2);
  });

  test("forwards create and update payloads", async () => {
    const calls: unknown[] = [];
    const gateway = {
      createComponent: async (...args: unknown[]) => {
        calls.push(["create", ...args]);
        return { id: 1, name: "page" } as never;
      },
      getComponent: async () => ({ id: 7, name: "page" }) as never,
      listComponents: async () => [] as never,
      updateComponent: async (...args: unknown[]) => {
        calls.push(["update", ...args]);
        return { id: 7, name: "page" } as never;
      },
    };

    await createComponent(gateway, 42, { name: "page" });
    await updateComponent(gateway, 42, "7", { name: "page" });

    expect(calls).toEqual([
      ["create", 42, { name: "page" }],
      ["update", 42, 7, { name: "page" }],
    ]);
  });

  test("rejects renames until content references can be updated", async () => {
    expect(
      updateComponent(
        {
          getComponent: async () => ({ id: 7, name: "page" }) as never,
          listComponents: async () => [] as never,
          updateComponent: async () => ({}) as never,
        },
        42,
        "7",
        { name: "landing-page" },
      ),
    ).rejects.toThrow("not supported safely yet");
  });

  test("preserves generated field properties during schema updates", async () => {
    let payload: unknown;
    await updateComponent(
      {
        getComponent: async () =>
          ({
            id: 7,
            name: "page",
            schema: { title: { id: "generated", position: 0, type: "text" } },
          }) as never,
        listComponents: async () => [] as never,
        updateComponent: async (_spaceId, _componentId, component) => {
          payload = component;
          return { id: 7, ...component } as never;
        },
      },
      42,
      "7",
      { name: "page", schema: { title: { type: "text", required: true } } },
    );

    expect(payload).toEqual({
      name: "page",
      schema: {
        title: {
          id: "generated",
          position: 0,
          required: true,
          type: "text",
        },
      },
    });
  });
});
