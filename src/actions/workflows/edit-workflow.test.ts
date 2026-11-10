import { expect, test } from "bun:test";
import { editWorkflow } from "./edit-workflow.ts";

test("updates only requested workflow fields and skips a repeat", async () => {
  const workflow = {
    id: 5,
    name: "Default",
    content_types: ["article"],
    per_language_stages: false,
  };
  const writes: unknown[] = [];
  const gateway = {
    listWorkflows: async () => [{ ...workflow }],
    updateWorkflow: async (
      _space: number,
      _id: number,
      fields: Record<string, unknown>,
    ) => {
      writes.push(fields);
      Object.assign(workflow, fields);
    },
  };
  const input = { spaceId: 42, workflow: "Default", perLanguageStages: true };
  expect(await editWorkflow(gateway as never, input)).toEqual({
    status: "updated",
    workflowId: 5,
  });
  expect(await editWorkflow(gateway as never, input)).toEqual({
    status: "unchanged",
    workflowId: 5,
  });
  expect(writes).toEqual([{ per_language_stages: true }]);
  expect(workflow.content_types).toEqual(["article"]);
});

test("renames by ID and updates content types; rejects unsafe inputs", async () => {
  const workflow = {
    id: 5,
    name: "Old",
    content_types: ["page"],
    per_language_stages: true,
  };
  const gateway = {
    listWorkflows: async () => [{ ...workflow }],
    updateWorkflow: async (
      _space: number,
      _id: number,
      fields: Record<string, unknown>,
    ) => {
      Object.assign(workflow, fields);
    },
  };
  await expect(
    editWorkflow(gateway as never, {
      spaceId: 42,
      workflow: "Old",
      name: "New",
    }),
  ).rejects.toMatchObject({ code: "INVALID_INPUT" });
  expect(
    await editWorkflow(gateway as never, {
      spaceId: 42,
      workflow: "5",
      name: "New",
      contentTypes: [],
    }),
  ).toEqual({ status: "updated", workflowId: 5 });
  expect(workflow).toEqual({
    id: 5,
    name: "New",
    content_types: [],
    per_language_stages: true,
  });
  expect(
    (
      await editWorkflow(gateway as never, {
        spaceId: 42,
        workflow: "5",
        name: "New",
        contentTypes: [],
      })
    ).status,
  ).toBe("unchanged");
});

test("fails closed if configuration or update cannot be verified", async () => {
  const gateway = {
    listWorkflows: async () => [{ id: 5, name: "Default", content_types: [] }],
    updateWorkflow: async () => {},
  };
  await expect(
    editWorkflow(gateway as never, {
      spaceId: 42,
      workflow: "5",
      perLanguageStages: true,
    }),
  ).rejects.toMatchObject({ code: "CONFLICT" });
  await expect(
    editWorkflow(gateway as never, { spaceId: 42, workflow: "5", name: "New" }),
  ).rejects.toMatchObject({ code: "CONFLICT" });
});
