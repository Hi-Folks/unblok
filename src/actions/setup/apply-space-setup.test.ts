import { describe, expect, test } from "bun:test";
import type { Component } from "@storyblok/management-api-client";
import { parseSpaceSetup } from "../../setup/schema.ts";
import { applySpaceSetup } from "./apply-space-setup.ts";

describe("applySpaceSetup", () => {
  test("reconciles supported resources and reports unsupported ones", async () => {
    let languages = [{ code: "it", name: "Italian" }];
    let components = [
      {
        id: 10,
        name: "page",
        display_name: "Old page",
        schema: { title: { id: "field-id", type: "text" } },
      },
    ] as unknown as Component[];
    const componentUpdates: unknown[] = [];
    const gateway = {
      createComponent: async (
        _spaceId: number,
        component: Record<string, unknown>,
      ) => {
        const created = { id: 11, ...component } as never;
        components.push(created);
        return created;
      },
      getComponent: async (_spaceId: number, componentId: number) =>
        components.find((component) => component.id === componentId) as never,
      listComponents: async () => components as never,
      listLanguages: async () => languages,
      updateComponent: async (
        _spaceId: number,
        componentId: number,
        component: Record<string, unknown>,
      ) => {
        componentUpdates.push(component);
        const updated = { id: componentId, ...component } as never;
        components = components.map((current) =>
          current.id === componentId ? updated : current,
        );
        return updated;
      },
      updateLanguages: async (_spaceId: number, next: typeof languages) => {
        languages = next;
        return next;
      },
    };
    const setup = parseSpaceSetup({
      apiVersion: "space-man/v1",
      kind: "SpaceSetup",
      metadata: { name: "Demo" },
      resources: {
        components: [
          {
            name: "page",
            displayName: "Page",
            schema: { title: { type: "text" } },
          },
          { name: "feature" },
        ],
        datasources: [{ name: "categories" }],
        languages: [
          { code: "it", name: "Italian" },
          { code: "de", name: "German" },
        ],
      },
    });

    const report = await applySpaceSetup(gateway, setup, 42);

    expect(report.summary).toEqual({
      created: 2,
      failed: 0,
      unchanged: 1,
      unsupported: 1,
      updated: 1,
    });
    expect(componentUpdates).toEqual([
      {
        display_name: "Page",
        name: "page",
        schema: { title: { id: "field-id", type: "text" } },
      },
    ]);
  });

  test("continues after an operation failure", async () => {
    const setup = parseSpaceSetup({
      apiVersion: "space-man/v1",
      kind: "SpaceSetup",
      metadata: { name: "Demo" },
      resources: {
        components: [{ name: "broken" }],
        tags: [{ name: "demo" }],
      },
    });
    const report = await applySpaceSetup(
      {
        createComponent: async () => {
          throw new Error("API unavailable");
        },
        getComponent: async () => ({}) as never,
        listComponents: async () => [],
        listLanguages: async () => [],
        updateComponent: async () => ({}) as never,
        updateLanguages: async () => [],
      },
      setup,
      42,
    );

    expect(report.operations).toEqual([
      {
        action: "create",
        error: "API unavailable",
        key: "broken",
        resource: "component",
        status: "failed",
      },
      {
        action: "none",
        key: "demo",
        resource: "tag",
        status: "unsupported",
      },
    ]);
  });
});
