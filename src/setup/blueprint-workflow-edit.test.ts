import { expect, test } from "bun:test";
import {
  applySupportedBlueprint,
  compileSupportedBlueprint,
} from "./blueprint-apply.ts";
import { resolveBlueprint } from "./blueprint-validation.ts";

test("edits workflow settings before story operations and reconciles on retry", async () => {
  const blueprint = compileSupportedBlueprint(
    resolveBlueprint({
      version: 1,
      workflow: { edit: [{ workflow: "Default", per_language_stages: true }] },
    }),
  );
  let enabled = false;
  let writes = 0;
  const gateway = {
    listWorkflows: async () => [
      { id: 5, name: "Default", per_language_stages: enabled },
    ],
    updateWorkflow: async () => {
      writes++;
      enabled = true;
    },
  };
  const first = await applySupportedBlueprint(gateway as never, 42, blueprint);
  const second = await applySupportedBlueprint(gateway as never, 42, blueprint);
  expect(first.operations).toMatchObject([
    { operation: "edit-workflow", status: "updated" },
  ]);
  expect(second.operations).toMatchObject([
    { operation: "edit-workflow", status: "unchanged" },
  ]);
  expect(writes).toBe(1);
});
