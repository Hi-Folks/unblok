import { describe, expect, test } from "bun:test";
import { parseSpaceSetup } from "../../setup/schema.ts";
import { planSpaceSetup } from "./plan-space-setup.ts";

describe("planSpaceSetup", () => {
  test("returns a stable versioned plan", () => {
    const setup = parseSpaceSetup({
      apiVersion: "space-man/v1",
      kind: "SpaceSetup",
      metadata: { name: "Demo" },
      resources: {
        languages: [{ code: "it", name: "Italian" }],
        components: [{ name: "page" }],
      },
    });

    expect(planSpaceSetup(setup)).toEqual({
      apiVersion: "space-man/plan-v1",
      config: { apiVersion: "space-man/v1", name: "Demo" },
      operations: [
        {
          action: "ensure",
          key: "page",
          resource: "component",
          status: "planned",
        },
        {
          action: "ensure",
          key: "it",
          resource: "language",
          status: "planned",
        },
      ],
      summary: { changes: 0, pending: 2, planned: 2, unchanged: 0 },
    });
  });

  test("classifies languages using current space state", () => {
    const setup = parseSpaceSetup({
      apiVersion: "space-man/v1",
      kind: "SpaceSetup",
      metadata: { name: "Demo" },
      resources: {
        languages: [
          { code: "it", name: "Italian" },
          { code: "de", name: "German" },
        ],
      },
    });

    const plan = planSpaceSetup(setup, {
      languages: [{ code: "it", name: "Italian" }],
      spaceId: 42,
    });

    expect(plan.operations).toEqual([
      {
        action: "none",
        key: "it",
        resource: "language",
        status: "unchanged",
      },
      {
        action: "create",
        key: "de",
        resource: "language",
        status: "change",
      },
    ]);
    expect(plan.summary).toEqual({
      changes: 1,
      pending: 0,
      planned: 2,
      unchanged: 1,
    });
    expect(plan.target).toEqual({ spaceId: 42 });
  });

  test("classifies components using current space state", () => {
    const setup = parseSpaceSetup({
      apiVersion: "space-man/v1",
      kind: "SpaceSetup",
      metadata: { name: "Demo" },
      resources: {
        components: [
          { name: "page", schema: { title: { type: "text" } } },
          { name: "feature" },
        ],
      },
    });

    const plan = planSpaceSetup(setup, {
      components: [
        {
          id: 1,
          name: "page",
          schema: { title: { id: "generated", type: "text" } },
        },
      ] as never,
    });

    expect(plan.operations).toEqual([
      {
        action: "none",
        key: "page",
        resource: "component",
        status: "unchanged",
      },
      {
        action: "create",
        key: "feature",
        resource: "component",
        status: "change",
      },
    ]);
  });
});
