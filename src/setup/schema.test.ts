import { describe, expect, test } from "bun:test";
import { parseSpaceSetup, SetupValidationError } from "./schema.ts";

describe("parseSpaceSetup", () => {
  test("normalizes resource identities and preserves resource fields", () => {
    const setup = parseSpaceSetup({
      apiVersion: "space-man/v1",
      kind: "SpaceSetup",
      metadata: { name: "Demo" },
      resources: {
        components: [{ name: "  page  ", displayName: "Page" }],
      },
    });

    expect(setup.resources.components).toEqual([
      { name: "page", displayName: "Page" },
    ]);
  });

  test("reports independent validation errors together", () => {
    expect(() =>
      parseSpaceSetup({
        apiVersion: "v0",
        kind: "Unknown",
        metadata: {},
        resources: {
          components: [{ name: "page" }, { name: "page" }],
          unsupported: [],
        },
      }),
    ).toThrow(SetupValidationError);

    try {
      parseSpaceSetup({
        apiVersion: "v0",
        kind: "Unknown",
        metadata: {},
        resources: {
          components: [{ name: "page" }, { name: "page" }],
          unsupported: [],
        },
      });
    } catch (error) {
      expect(error).toBeInstanceOf(SetupValidationError);
      expect((error as SetupValidationError).issues).toHaveLength(5);
    }
  });
});
