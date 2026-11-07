import { describe, expect, test } from "bun:test";
import { resolveBlueprint } from "./blueprint-validation.ts";

describe("blueprint validation and input resolution", () => {
  const blueprint = {
    version: 1,
    inputs: { name: { default: "Demo" }, host: { default: "example.com" } },
    space: {
      name: "${{ inputs.name }}",
      readiness: { timeout_seconds: 120, poll_interval_seconds: 2 },
    },
    preview: {
      default: "https://${{ inputs.host }}/?token=${{ space.preview_token }}",
    },
  };

  test("resolves defaults and overrides but leaves runtime references", () => {
    const result = resolveBlueprint(blueprint, { name: "My space" });
    expect((result.space as Record<string, unknown>).name).toBe("My space");
    expect((result.preview as Record<string, unknown>).default).toBe(
      "https://example.com/?token=${{ space.preview_token }}",
    );
    expect(blueprint.space.name).toBe("${{ inputs.name }}");
  });

  test("reports invalid nested values and unknown options with paths", () => {
    expect(() =>
      resolveBlueprint({
        version: 1,
        space: { readiness: { timeout_seconds: "120" } },
      }),
    ).toThrow("setup.space.readiness.timeout_seconds");
    expect(() =>
      resolveBlueprint({
        version: 1,
        preview: { environments: [{ name: "Local", typo: true }] },
      }),
    ).toThrow("setup.preview.environments[0].url");
    expect(() =>
      resolveBlueprint({ version: 1, space: { readiness: { extra: 1 } } }),
    ).toThrow("setup.space.readiness.extra");
    expect(() =>
      resolveBlueprint({
        version: 1,
        apps: { install: [{ id: 1, extra: true }] },
      }),
    ).toThrow("setup.apps.install[0].extra");
  });

  test("rejects missing and unknown inputs and unsupported expressions", () => {
    expect(() =>
      resolveBlueprint({ version: 1, inputs: { name: {} } }),
    ).toThrow("inputs.name");
    expect(() => resolveBlueprint(blueprint, { other: "x" })).toThrow(
      "inputs.other",
    );
    expect(() =>
      resolveBlueprint({
        version: 1,
        space: { name: "${{ inputs.unknown }}" },
      }),
    ).toThrow("unknown input");
    expect(() =>
      resolveBlueprint({
        version: 1,
        space: { name: "${{ process.env.TOKEN }}" },
      }),
    ).toThrow("unsupported expression");
    expect(() =>
      resolveBlueprint({ version: 1, space: { name: "${{ inputs.name" } }),
    ).toThrow("invalid expression");
  });
});
