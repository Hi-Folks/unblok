import { describe, expect, test } from "bun:test";
import { ClientError } from "@storyblok/management-api-client";
import type { Environment } from "../config/environment.ts";
import type { Output } from "../output.ts";
import type { StoryblokGateway } from "../storyblok/gateway.ts";
import type { ListSpacesOptions } from "../storyblok/gateway.ts";
import { runCli } from "./main.ts";
import { version } from "../../package.json";

function createHarness(gateway?: Partial<StoryblokGateway>) {
  const stdout: unknown[] = [];
  const stderr: string[] = [];
  const output: Output = {
    mode: "json",
    activity: async (_message, _successMessage, operation) => operation(),
    data: (value) => stdout.push(value),
    confirm: async () => false,
    input: async () => null,
    error: (message) => stderr.push(message),
    info: (message) => stdout.push(message),
    note: (_title, message) => stdout.push(message),
    summary: (_title, message) => stdout.push(message),
    task: () => ({
      error: (message) => stderr.push(message),
      message: () => {},
      success: () => {},
    }),
    text: (message) => stdout.push(message),
  };
  const fallback: StoryblokGateway = {
    listAssetFolders: async () => [],
    createAssetFolder: async (_spaceId, name, parentId) => ({
      id: 1,
      name,
      parent_id: parentId,
    }),
    listAssets: async () => [],
    uploadAsset: async () => {},
    readAsset: async () => new Uint8Array(),
    createStory: async () => ({}) as never,
    updateTranslatedSlugs: async () => {},
    acceptSpaceDisclaimer: async () => {},
    deleteSpace: async () => {},
    createWorkflowStage: async (_spaceId, stage) => stage as never,
    findStoryBySlug: async () => undefined,
    getStory: async () => ({}) as never,
    publishStory: async () => ({}),
    activateExperiment: async () => ({}),
    updateStoryContent: async () => ({}) as never,
    listExperiments: async () => ({}),
    getExperiment: async () => ({}),
    createExperiment: async () => ({}),
    linkExperimentStory: async () => ({}),
    createExperimentMapping: async () => ({}),
    getExperimentResults: async () => ({}),
    pushExperimentResults: async () => ({}),
    updateStoryTags: async () => {},
    listAvailableApps: async () => [],
    listInstalledApps: async () => [],
    installApp: async (_spaceId, appId) => ({
      app_id: appId,
      name: "App",
      slug: "app",
    }),
    updateSpaceSettings: async () => {},
    assignWorkflowStage: async (_spaceId, input) => ({
      id: input.storyId,
      workflow_stage_id: input.stageId,
    }),
    createComponent: async (_spaceId, component) =>
      ({ id: 10, ...component }) as never,
    duplicateSpace: async (options) =>
      ({
        id: 99,
        name: options.name,
      }) as never,
    getCurrentUserId: async () => 7,
    getWorkflowStage: async (_spaceId, stageId) =>
      ({
        id: stageId,
        name: "Reviewing",
        workflow_id: 5,
      }) as never,
    getComponent: async (_spaceId, componentId) =>
      ({ id: componentId, name: "page", schema: {} }) as never,
    getSpace: async (spaceId) => ({ id: spaceId, name: "Demo" }) as never,
    listLanguages: async () => [],
    listComponents: async () => [],
    listSpaces: async () => [{ id: 42, name: "Demo" }] as never,
    listStories: async () => [],
    listWorkflows: async () =>
      [
        { id: 5, name: "Default", content_types: [], is_default: true },
      ] as never,
    listWorkflowStages: async () =>
      [{ id: 8, name: "Reviewing", workflow_id: 5 }] as never,
    updateLanguages: async (_spaceId, languages) => languages,
    updateComponent: async (_spaceId, componentId, component) =>
      ({ id: componentId, ...component }) as never,
  };

  return {
    options: {
      createGateway: () => ({ ...fallback, ...gateway }),
      environment: { STORYBLOK_TOKEN: "test-token" } as Environment,
      output,
    },
    stderr,
    stdout,
  };
}

describe("runCli", () => {
  test("explains token setup on stderr without making a request", async () => {
    const harness = createHarness();
    harness.options.environment = {};
    expect(await runCli(["space", "list", "--json"], harness.options)).toBe(1);
    expect(harness.stdout).toEqual([]);
    expect(harness.stderr[0]).toContain("STORYBLOK_TOKEN is required");
    expect(harness.stderr[0]).toContain("current working directory");
    expect(harness.stderr[0]).toContain("Personal access tokens");
  });

  test("explains rejected tokens on stderr without exposing the token", async () => {
    const harness = createHarness({
      listSpaces: async () => {
        throw new ClientError("test-token", {
          status: 401,
          statusText: "Unauthorized",
          data: { message: "test-token" },
        });
      },
    });
    expect(await runCli(["space", "list", "--json"], harness.options)).toBe(1);
    expect(harness.stdout).toEqual([]);
    expect(harness.stderr[0]).toContain("invalid or expired");
    expect(harness.stderr[0]).not.toContain("test-token");
  });
  test("requires a disclaimer ID and confirmation before enabling Experiments", async () => {
    let requests = 0;
    const harness = createHarness({
      listInstalledApps: async () => {
        requests++;
        return [];
      },
    });
    expect(
      await runCli(
        [
          "app",
          "experiments",
          "enable",
          "--disclaimer-id",
          "173657768407244",
          "--space-id",
          "42",
          "--json",
        ],
        harness.options,
      ),
    ).toBe(2);
    expect(requests).toBe(0);
    expect(harness.stderr[0]).toContain("--yes");
  });
  test("requires confirmation before pushing experiment results", async () => {
    let writes = 0;
    const harness = createHarness({
      pushExperimentResults: async () => {
        writes++;
        return {};
      },
    });
    expect(
      await runCli(
        [
          "experiment",
          "results",
          "push",
          "--id",
          "4",
          "--file",
          "examples/features/experiment-demo-results.yaml",
          "--space-id",
          "42",
          "--json",
        ],
        harness.options,
      ),
    ).toBe(2);
    expect(writes).toBe(0);
    expect(harness.stderr[0]).toContain("--yes");
  });

  test("reports result API failures without success output", async () => {
    const harness = createHarness({
      pushExperimentResults: async () => {
        throw new Error("Results unavailable");
      },
    });
    expect(
      await runCli(
        [
          "experiment",
          "results",
          "push",
          "--id",
          "4",
          "--file",
          "examples/features/experiment-demo-results.yaml",
          "--space-id",
          "42",
          "--yes",
          "--json",
        ],
        harness.options,
      ),
    ).toBe(1);
    expect(harness.stdout).toEqual([]);
    expect(harness.stderr[0]).toContain("Results unavailable");
  });
  test("reports the package version without authentication", async () => {
    const harness = createHarness();
    harness.options.environment = {};
    expect(await runCli(["--version"], harness.options)).toBe(0);
    expect(harness.stdout[0]).toEqual({ version });
    harness.options.output = { ...harness.options.output, mode: "human" };
    expect(await runCli(["--version"], harness.options)).toBe(0);
    expect(harness.stdout.at(-1)).toBe(`unblok ${version}`);
  });
  test("deletes only after showing space details and receiving confirmation", async () => {
    const events: string[] = [];
    const harness = createHarness({
      getSpace: async (id) => {
        events.push(`get:${id}`);
        return {
          id,
          name: "Demo",
          plan: "starter",
          role: "admin",
          stories_count: 2,
          assets_count: 1,
          created_at: "2026-01-01",
        } as never;
      },
      deleteSpace: async (id) => {
        events.push(`delete:${id}`);
      },
    });
    Object.assign(harness.options.output, {
      mode: "human",
      note: (title: string, details: string) => {
        events.push(`preview:${title}:${details}`);
      },
      confirm: async () => {
        events.push("confirm");
        return true;
      },
    });
    expect(await runCli(["space", "delete", "42"], harness.options)).toBe(0);
    expect(events[0]).toBe("get:42");
    expect(events[1]).toContain("preview:Space to delete: Demo:ID");
    expect(events.slice(2)).toEqual(["confirm", "delete:42"]);
  });

  test("prompts for a missing ID and never deletes when declined", async () => {
    const deleted: number[] = [];
    const harness = createHarness({
      getSpace: async (id) =>
        ({
          id,
          name: "Demo",
          plan: "starter",
          role: "admin",
          stories_count: 0,
          assets_count: 0,
          created_at: "2026-01-01",
        }) as never,
      deleteSpace: async (id) => {
        deleted.push(id);
      },
    });
    Object.assign(harness.options.output, {
      mode: "human",
      input: async () => "42",
      confirm: async () => false,
    });
    expect(await runCli(["space", "delete"], harness.options)).toBe(0);
    expect(deleted).toEqual([]);
    expect(harness.stdout).toContain(
      "Deletion cancelled; the space was not deleted.",
    );
  });

  test("cancels an ID prompt without fetching or deleting a space", async () => {
    let calls = 0;
    const harness = createHarness({
      getSpace: async () => {
        calls++;
        return {} as never;
      },
      deleteSpace: async () => {
        calls++;
      },
    });
    Object.assign(harness.options.output, {
      mode: "human",
      input: async () => null,
    });
    expect(await runCli(["space", "delete"], harness.options)).toBe(0);
    expect(calls).toBe(0);
  });

  test("does not delete if the returned space ID differs", async () => {
    let deleted = false;
    const harness = createHarness({
      getSpace: async () => ({ id: 99, name: "Other" }) as never,
      deleteSpace: async () => {
        deleted = true;
      },
    });
    Object.assign(harness.options.output, {
      mode: "human",
      confirm: async () => true,
    });
    expect(await runCli(["space", "delete", "42"], harness.options)).toBe(1);
    expect(deleted).toBe(false);
  });

  test("rejects JSON deletion without contacting the API", async () => {
    let calls = 0;
    const harness = createHarness({
      getSpace: async () => {
        calls++;
        return {} as never;
      },
    });
    expect(
      await runCli(["space", "delete", "42", "--json"], harness.options),
    ).toBe(2);
    expect(calls).toBe(0);
  });
  test("requires confirmation before ensuring default workflow stages", async () => {
    const harness = createHarness();
    expect(
      await runCli(
        ["workflow", "ensure-default", "--space-id", "42"],
        harness.options,
      ),
    ).toBe(2);
    expect(harness.stderr[0]).toContain("--yes");
  });
  test("prints root help without requiring a token", async () => {
    const harness = createHarness();
    harness.options.environment = {};

    expect(await runCli([], harness.options)).toBe(0);
    expect(harness.stdout[0]).toContain("unblok <command>");
  });

  test("lists spaces", async () => {
    const harness = createHarness();

    expect(await runCli(["space", "list"], harness.options)).toBe(0);
    expect(harness.stdout[0]).toEqual([{ id: 42, name: "Demo" }]);
  });

  test("accepts the global JSON option after a command", async () => {
    const harness = createHarness();

    expect(await runCli(["space", "list", "--json"], harness.options)).toBe(0);
    expect(harness.stdout[0]).toEqual([{ id: 42, name: "Demo" }]);
  });

  test("passes the search filter to the API", async () => {
    let receivedOptions: ListSpacesOptions | undefined;
    const harness = createHarness({
      listSpaces: async (options) => {
        receivedOptions = options;
        return [];
      },
    });

    expect(
      await runCli(["space", "list", "--search", "demo"], harness.options),
    ).toBe(0);
    expect(receivedOptions).toEqual({ search: "demo" });
  });

  test("checks collaborators only for spaces owned by the current user", async () => {
    const inspectedSpaceIds: number[] = [];
    const harness = createHarness({
      getCurrentUserId: async () => 7,
      getSpace: async (spaceId) => {
        inspectedSpaceIds.push(spaceId);
        return {
          id: spaceId,
          collaborators: spaceId === 1 ? [] : [{ id: 10 }],
        } as never;
      },
      listSpaces: async () =>
        [
          { id: 1, owner_id: 7 },
          { id: 2, owner_id: 99 },
          { id: 3, owner_id: 7 },
        ] as never,
    });

    expect(
      await runCli(["space", "list", "--solo-only"], harness.options),
    ).toBe(0);
    expect(inspectedSpaceIds).toEqual([1, 3]);
    expect(harness.stdout[0]).toEqual([{ id: 1, owner_id: 7 }]);
  });

  test("gets a space by numeric ID", async () => {
    const harness = createHarness();

    expect(await runCli(["space", "get", "42"], harness.options)).toBe(0);
    expect(harness.stdout[0]).toEqual({ id: 42, name: "Demo" });
  });

  test("presents a read-only space without a success message", async () => {
    const harness = createHarness({
      getSpace: async (id) =>
        ({
          id,
          name: "Demo",
          plan: "Team",
          role: "admin",
          stories_count: 2,
          assets_count: 1,
          created_at: "2026-01-01",
        }) as never,
    });
    Object.defineProperty(harness.options.output, "mode", { value: "human" });
    harness.options.output.summary = (title, message) =>
      harness.stdout.push(`${title}\n${message}`);
    expect(await runCli(["space", "get", "42"], harness.options)).toBe(0);
    expect(harness.stdout).toHaveLength(1);
    expect(harness.stdout[0]).toContain("Demo");
    expect(harness.stdout[0]).toContain("Stories");
    expect(harness.stdout[0]).not.toContain("Space loaded");
  });

  test("gets a space using the configured default ID", async () => {
    const harness = createHarness();
    harness.options.environment = {
      STORYBLOK_SPACE_ID: "88",
      STORYBLOK_TOKEN: "test-token",
    };

    expect(await runCli(["space", "get"], harness.options)).toBe(0);
    expect(harness.stdout[0]).toEqual({ id: 88, name: "Demo" });
  });

  test("plans a setup locally without authentication", async () => {
    const harness = createHarness();
    harness.options.environment = {};

    expect(
      await runCli(
        ["space", "plan", "--config", "examples/features/demo-space.yaml"],
        harness.options,
      ),
    ).toBe(0);
    expect(harness.stdout[0]).toMatchObject({
      apiVersion: "space-man/plan-v1",
      summary: { planned: 6 },
    });
  });

  test("plans a blueprint with input overrides without authentication", async () => {
    const harness = createHarness();
    harness.options.environment = {};
    expect(
      await runCli(
        [
          "space",
          "setup",
          "plan",
          "--config",
          "src/setup/fixtures/input-blueprint.yaml",
          "--input",
          "space_name=Customer Demo",
        ],
        harness.options,
      ),
    ).toBe(0);
    expect(harness.stdout[0]).toMatchObject({
      resolvedBlueprint: {
        space: { name: "Customer Demo" },
        preview: {
          default: "https://example.com/?token=${{ space.preview_token }}",
        },
      },
    });
    expect(
      await runCli(
        [
          "space",
          "setup",
          "plan",
          "--config",
          "src/setup/fixtures/input-blueprint.yaml",
          "--input",
          "unknown=value",
        ],
        harness.options,
      ),
    ).toBe(2);
  });

  test("plans an extended blueprint with shared input overrides", async () => {
    const harness = createHarness();
    harness.options.environment = {};
    expect(
      await runCli(
        [
          "space",
          "setup",
          "plan",
          "--config",
          "examples/customer-demo/setup.yaml",
          "--input",
          "space_name=My Demo",
          "--input",
          "asset_url=https://example.com/banner.png",
          "--input",
          "review_stage=Ready to Publish",
        ],
        harness.options,
      ),
    ).toBe(0);
    expect(harness.stdout[0]).toMatchObject({
      resolvedBlueprint: {
        space: { name: "My Demo", duplicate_from: "286863409930127" },
        assets: { upload_url: [{ url: "https://example.com/banner.png" }] },
        workflow: { assign: [{ stage: "Ready to Publish" }] },
      },
    });
  });

  test("enables AI Translations only with a disclaimer ID and --yes", async () => {
    const calls: string[] = [];
    const harness = createHarness({
      getSpace: async (id) => ({ id, disclaimer_ids: [] }) as never,
      acceptSpaceDisclaimer: async (_id, disclaimer) => {
        calls.push(`disclaimer:${disclaimer}`);
      },
      listInstalledApps: async () => [],
      installApp: async (_id, appId) => {
        calls.push(`app:${appId}`);
        return { app_id: Number(appId), name: "AI", slug: "ai-translation" };
      },
    });
    expect(
      await runCli(
        [
          "app",
          "ai-translation",
          "enable",
          "--space-id",
          "42",
          "--disclaimer-id",
          "35",
        ],
        harness.options,
      ),
    ).toBe(2);
    expect(calls).toEqual([]);
    expect(
      await runCli(
        [
          "app",
          "ai-translation",
          "enable",
          "--space-id",
          "42",
          "--disclaimer-id",
          "35",
          "--yes",
        ],
        harness.options,
      ),
    ).toBe(0);
    expect(calls).toEqual(["disclaimer:35", "app:29942"]);
  });

  test("returns a report when asset preparation fails before contacting Storyblok", async () => {
    const harness = createHarness();
    let gateways = 0;
    const create = harness.options.createGateway;
    harness.options.createGateway = () => {
      gateways++;
      return create();
    };
    const original = globalThis.fetch;
    globalThis.fetch = (async () =>
      new Response("missing", { status: 404 })) as unknown as typeof fetch;
    try {
      const code = await runCli(
        [
          "space",
          "setup",
          "apply",
          "--config",
          "examples/features/setup-remote-asset.yaml",
          "--space-id",
          "42",
          "--yes",
        ],
        harness.options,
      );
      expect(code).toBe(2);
      expect(gateways).toBe(0);
      expect(harness.stdout[0]).toMatchObject({
        target: { spaceId: 42 },
        failed: true,
        summary: { failed: 1, notRun: 1 },
        operations: [
          {
            operation: "prepare-assets",
            status: "failed",
            reason: expect.stringContaining("HTTP 404"),
          },
          { operation: "apply-setup", status: "not_run" },
        ],
      });
    } finally {
      globalThis.fetch = original;
    }
  });

  test("creates a blueprint space after validation and supports resuming with an ID", async () => {
    let duplicates = 0;
    let checks = 0;
    const harness = createHarness({
      duplicateSpace: async (options) => {
        duplicates++;
        expect(options).toMatchObject({
          sourceSpaceId: 42,
          name: "Customer Demo",
          inOrg: true,
        });
        return { id: 99, name: options.name } as never;
      },
      getSpace: async (id) => {
        checks++;
        return { id, duplication_status: "done" } as never;
      },
    });
    const config = "src/setup/fixtures/duplicate-blueprint.yaml";
    expect(
      await runCli(
        [
          "space",
          "setup",
          "apply",
          "--config",
          config,
          "--input",
          "space_name=Customer Demo",
          "--yes",
          "--continue-after-duplicate",
        ],
        harness.options,
      ),
    ).toBe(0);
    expect(duplicates).toBe(1);
    expect(checks).toBe(1);
    expect(harness.stdout[0]).toMatchObject({
      target: { spaceId: 99 },
      failed: false,
    });
    expect(
      await runCli(
        [
          "space",
          "setup",
          "apply",
          "--config",
          config,
          "--space-id",
          "99",
          "--yes",
        ],
        harness.options,
      ),
    ).toBe(0);
    expect(duplicates).toBe(1);
  });

  test("shows setup progress for human output but keeps JSON free of progress", async () => {
    const events: string[] = [];
    const harness = createHarness({
      getSpace: async (id) =>
        ({
          id,
          ai_text_generator_disabled: true,
          inherit_org_ai_configuration: true,
        }) as never,
      updateSpaceSettings: async () => {
        events.push("updated");
      },
    });
    harness.options.output = {
      ...harness.options.output,
      mode: "human",
      task: () => ({
        message: (message) => events.push(message),
        success: () => events.push("complete"),
        error: () => events.push("failed"),
      }),
    };
    const args = [
      "space",
      "setup",
      "apply",
      "--config",
      "examples/customer-demo/steps/09-space-ai.yaml",
      "--space-id",
      "42",
      "--yes",
    ];
    expect(await runCli(args, harness.options)).toBe(0);
    expect(events).toEqual(["Configuring space", "updated", "complete"]);
    events.length = 0;
    harness.options.output = {
      ...harness.options.output,
      mode: "json",
      task: () => {
        throw new Error("JSON must not start progress");
      },
    };
    expect(await runCli(args, harness.options)).toBe(0);
    expect(events).toEqual(["updated"]);
    expect(harness.stdout.at(-1)).toMatchObject({
      failed: false,
      target: { spaceId: 42 },
    });
  });

  test("stops after the post-duplication confirmation is declined", async () => {
    let checks = 0;
    const harness = createHarness({
      getSpace: async () => {
        checks++;
        throw new Error("unexpected");
      },
    });
    Object.defineProperty(harness.options.output, "mode", { value: "human" });
    expect(
      await runCli(
        [
          "space",
          "setup",
          "apply",
          "--config",
          "src/setup/fixtures/duplicate-blueprint.yaml",
          "--yes",
        ],
        harness.options,
      ),
    ).toBe(0);
    expect(checks).toBe(0);
    expect(
      harness.stdout.some(
        (item) => typeof item === "string" && item.includes("99"),
      ),
    ).toBe(true);
  });

  test("rejects noninteractive creation without explicit continuation", async () => {
    let duplicates = 0;
    const harness = createHarness({
      duplicateSpace: async () => {
        duplicates++;
        throw new Error("unexpected");
      },
    });
    expect(
      await runCli(
        [
          "space",
          "setup",
          "apply",
          "--config",
          "src/setup/fixtures/duplicate-blueprint.yaml",
          "--yes",
        ],
        harness.options,
      ),
    ).toBe(2);
    expect(duplicates).toBe(0);
  });

  test("reports a created space ID if duplication readiness fails", async () => {
    const harness = createHarness({
      getSpace: async () => {
        throw new Error("API unavailable");
      },
    });
    const code = await runCli(
      [
        "space",
        "setup",
        "apply",
        "--config",
        "src/setup/fixtures/duplicate-blueprint.yaml",
        "--yes",
        "--continue-after-duplicate",
      ],
      harness.options,
    );
    expect(code).toBe(1);
    expect(harness.stdout[0]).toMatchObject({
      target: { spaceId: 99 },
      failed: true,
      summary: { failed: 1, notRun: 1 },
      operations: [
        { operation: "wait-for-duplication", status: "failed" },
        { operation: "apply-setup", status: "not_run" },
      ],
    });
  });

  test("compares setup languages with a target space", async () => {
    const harness = createHarness({
      listLanguages: async () => [
        { code: "it", name: "Italian", aiTranslationCode: undefined },
      ],
    });

    expect(
      await runCli(
        [
          "space",
          "plan",
          "--config",
          "examples/features/demo-space.yaml",
          "--space-id",
          "42",
        ],
        harness.options,
      ),
    ).toBe(0);
    expect(harness.stdout[0]).toMatchObject({
      summary: { changes: 2, pending: 3, planned: 6, unchanged: 1 },
      target: { spaceId: 42 },
    });
  });

  test("lists languages for the configured space", async () => {
    const harness = createHarness({
      listLanguages: async (spaceId) => [
        { code: "it", name: `Italian ${spaceId}` },
      ],
    });
    harness.options.environment = {
      STORYBLOK_SPACE_ID: "42",
      STORYBLOK_TOKEN: "test-token",
    };

    expect(await runCli(["language", "list"], harness.options)).toBe(0);
    expect(harness.stdout[0]).toEqual([{ code: "it", name: "Italian 42" }]);
  });

  test("adds a language without exposing command options in the result", async () => {
    let receivedLanguages: unknown[] = [];
    const harness = createHarness({
      listLanguages: async () => [],
      updateLanguages: async (_spaceId, languages) => {
        receivedLanguages = languages;
        return languages;
      },
    });

    expect(
      await runCli(
        ["language", "add", "it", "Italian", "--space-id", "42"],
        harness.options,
      ),
    ).toBe(0);
    expect(receivedLanguages).toEqual([{ code: "it", name: "Italian" }]);
    expect(harness.stdout[0]).toEqual({
      language: { code: "it", name: "Italian" },
      status: "create",
    });
  });

  test("lists and gets components by exact name", async () => {
    const components = [
      { id: 10, name: "page-old", schema: {} },
      { id: 11, name: "page", schema: { title: { type: "text" } } },
    ] as never;
    const harness = createHarness({
      listComponents: async () => components,
    });

    expect(
      await runCli(["component", "list", "--space-id", "42"], harness.options),
    ).toBe(0);
    expect(harness.stdout[0]).toEqual(components);

    expect(
      await runCli(
        ["component", "get", "page", "--space-id", "42"],
        harness.options,
      ),
    ).toBe(0);
    expect(harness.stdout[1]).toEqual(components[1]);
  });

  test("creates a component from a definition file", async () => {
    let received: unknown;
    const harness = createHarness({
      createComponent: async (_spaceId, component) => {
        received = component;
        return {
          id: 10,
          ...component,
          schema: component.schema ?? {},
        } as never;
      },
    });

    expect(
      await runCli(
        [
          "component",
          "create",
          "--file",
          "examples/features/page.component.yaml",
          "--space-id",
          "42",
        ],
        harness.options,
      ),
    ).toBe(0);
    expect(received).toMatchObject({
      display_name: "Page",
      is_root: true,
      name: "page",
    });
  });

  test("applies supported setup resources with explicit confirmation", async () => {
    const harness = createHarness();

    expect(
      await runCli(
        [
          "space",
          "apply",
          "--config",
          "examples/features/demo-space.yaml",
          "--space-id",
          "42",
          "--yes",
        ],
        harness.options,
      ),
    ).toBe(0);
    expect(harness.stdout[0]).toMatchObject({
      apiVersion: "space-man/apply-v1",
      summary: {
        created: 3,
        failed: 0,
        unsupported: 3,
      },
      target: { spaceId: 42 },
    });
  });

  test("shows unsupported legacy setup resources as warnings", async () => {
    const harness = createHarness();
    Object.defineProperty(harness.options.output, "mode", { value: "human" });
    const summaries: Array<{ title: string; message: string }> = [];
    harness.options.output.summary = (title, message) =>
      summaries.push({ title, message });
    expect(
      await runCli(
        [
          "space",
          "apply",
          "--config",
          "examples/features/demo-space.yaml",
          "--space-id",
          "42",
          "--yes",
        ],
        harness.options,
      ),
    ).toBe(0);
    expect(summaries[0]?.title).toBe("Setup: warnings");
    expect(summaries[0]?.message).toContain("Space  42");
    expect(summaries[0]?.message).toContain(
      "This resource is not supported by this setup format.",
    );
    expect(summaries[0]?.message).toContain("3 unsupported");
  });

  test("shows partial failure in a legacy setup without hiding successes", async () => {
    const harness = createHarness({
      createComponent: async () => {
        throw new Error("Component limit reached");
      },
    });
    Object.defineProperty(harness.options.output, "mode", { value: "human" });
    const summaries: Array<{ title: string; message: string }> = [];
    harness.options.output.summary = (title, message) =>
      summaries.push({ title, message });
    expect(
      await runCli(
        [
          "space",
          "apply",
          "--config",
          "examples/features/demo-space.yaml",
          "--space-id",
          "42",
          "--yes",
        ],
        harness.options,
      ),
    ).toBe(1);
    expect(summaries[0]?.title).toBe("Setup: partial");
    expect(summaries[0]?.message).toContain("Component limit reached");
    expect(summaries[0]?.message).toContain("created");
  });

  test("shows tag assignment successes, unchanged stories and failures", async () => {
    const stories = [
      { id: 1, full_slug: "one", is_folder: false, tag_list: [] },
      { id: 2, full_slug: "two", is_folder: false, tag_list: ["Demo"] },
      { id: 3, full_slug: "three", is_folder: false, tag_list: [] },
    ];
    const harness = createHarness({
      findStoryBySlug: async (_id, slug) =>
        stories.find((item) => item.full_slug === slug) as never,
      getStory: async (_id, storyId) =>
        stories.find((item) => item.id === storyId) as never,
      updateStoryTags: async (_id, storyId) => {
        if (storyId === 3) throw new Error("Permission denied");
      },
    });
    Object.defineProperty(harness.options.output, "mode", { value: "human" });
    const summaries: Array<{ title: string; message: string }> = [];
    harness.options.output.summary = (title, message) =>
      summaries.push({ title, message });
    expect(
      await runCli(
        [
          "story",
          "tags",
          "assign",
          "--slug",
          "one",
          "--slug",
          "two",
          "--slug",
          "three",
          "--tag",
          "Demo",
          "--space-id",
          "42",
          "--yes",
        ],
        harness.options,
      ),
    ).toBe(1);
    expect(summaries[0]?.title).toBe("Tags: partial");
    expect(summaries[0]?.message).toContain("Added: Demo");
    expect(summaries[0]?.message).toContain(
      "Story already has the requested tags.",
    );
    expect(summaries[0]?.message).toContain("Permission denied");
    expect(summaries[0]?.message).toContain(
      "1 updated · 1 unchanged · 1 failed",
    );
  });

  test("preserves machine-readable tag assignment output", async () => {
    const story = {
      id: 1,
      full_slug: "home",
      is_folder: false,
      tag_list: ["Demo"],
    };
    const harness = createHarness({
      findStoryBySlug: async () => story as never,
      getStory: async () => story as never,
    });
    const code = await runCli(
      [
        "story",
        "tags",
        "assign",
        "--slug",
        "home",
        "--tag",
        "Demo",
        "--space-id",
        "42",
        "--yes",
        "--json",
      ],
      harness.options,
    );
    expect(code).toBe(0);
    expect(harness.stdout).toHaveLength(1);
    expect(harness.stdout[0]).toMatchObject({
      apiVersion: "unblok/story-tags-assign-v1",
      target: { spaceId: 42 },
      summary: { updated: 0, unchanged: 1, failed: 0 },
      operations: [{ slug: "home", status: "unchanged" }],
    });
  });

  test("refuses to apply without confirmation", async () => {
    const harness = createHarness();

    expect(
      await runCli(
        ["space", "apply", "--config", "examples/features/demo-space.yaml"],
        harness.options,
      ),
    ).toBe(2);
    expect(harness.stderr[0]).toContain("without '--yes'");
  });

  test.each([
    {
      scenario: "success",
      total: 2,
      failures: [] as number[],
      title: "Workflow: complete",
      exit: 0,
    },
    {
      scenario: "partial failure",
      total: 2,
      failures: [2] as number[],
      title: "Workflow: partial",
      exit: 1,
    },
    {
      scenario: "complete failure",
      total: 2,
      failures: [1, 2] as number[],
      title: "Workflow: failed",
      exit: 1,
    },
    {
      scenario: "empty selection",
      total: 0,
      failures: [] as number[],
      title: "No stories matched",
      exit: 0,
    },
  ])(
    "shows a workflow summary for $scenario",
    async ({ total, failures, title, exit }) => {
      const harness = createHarness({
        listStories: async () =>
          Array.from({ length: total }, (_, index) => ({
            id: index + 1,
            name: `Story ${index + 1}`,
            full_slug: `story-${index + 1}`,
            stage: null,
            is_folder: false,
          })) as never,
        assignWorkflowStage: async (_id, input) => {
          if (failures.includes(input.storyId))
            throw new Error("Permission denied");
          return { id: input.storyId, workflow_stage_id: input.stageId };
        },
      });
      Object.defineProperty(harness.options.output, "mode", { value: "human" });
      const summaries: Array<{ title: string; message: string }> = [];
      harness.options.output.summary = (heading, message) =>
        summaries.push({ title: heading, message });
      const code = await runCli(
        [
          "story",
          "workflow",
          "assign",
          "--space-id",
          "42",
          "--stage",
          "8",
          "--search",
          "story",
          "--yes",
        ],
        harness.options,
      );
      expect(code).toBe(exit);
      expect(summaries).toHaveLength(1);
      expect(summaries[0]?.title).toBe(title);
      expect(summaries[0]?.message).toContain("Space  42");
      expect(summaries[0]?.message).toContain(`${failures.length} failed`);
      if (failures.length)
        expect(summaries[0]?.message).toContain("Permission denied");
      if (!total)
        expect(summaries[0]?.message).toContain(
          "No stories matched the selection.",
        );
    },
  );

  test("keeps workflow partial-failure JSON structured and returns a failure exit code", async () => {
    const harness = createHarness({
      listStories: async () =>
        [
          { id: 1, name: "One", full_slug: "one", stage: null },
          { id: 2, name: "Two", full_slug: "two", stage: null },
        ] as never,
      assignWorkflowStage: async (_id, input) => {
        if (input.storyId === 2) throw new Error("Permission denied");
        return { id: input.storyId, workflow_stage_id: input.stageId };
      },
    });
    const code = await runCli(
      [
        "story",
        "workflow",
        "assign",
        "--space-id",
        "42",
        "--stage",
        "8",
        "--search",
        "story",
        "--yes",
        "--json",
      ],
      harness.options,
    );
    expect(code).toBe(1);
    expect(harness.stdout).toHaveLength(1);
    expect(harness.stdout[0]).toMatchObject({
      apiVersion: "space-man/workflow-assign-v1",
      summary: { assigned: 1, unchanged: 0, failed: 1 },
      operations: [
        { storyId: 1, status: "assigned" },
        { storyId: 2, status: "failed", error: "Permission denied" },
      ],
    });
  });

  test("duplicates a space with organization options", async () => {
    let receivedOptions:
      Parameters<StoryblokGateway["duplicateSpace"]>[0] | undefined;
    const harness = createHarness({
      duplicateSpace: async (options) => {
        receivedOptions = options;
        return { id: 99, name: options.name } as never;
      },
    });

    expect(
      await runCli(
        [
          "space",
          "duplicate",
          "42",
          "Customer Demo",
          "--in-org",
          "--space-type",
          "sandbox",
          "--demo",
          "--json",
        ],
        harness.options,
      ),
    ).toBe(0);
    expect(receivedOptions).toEqual({
      assignPartner: undefined,
      demo: true,
      inOrg: true,
      name: "Customer Demo",
      sourceSpaceId: 42,
      spaceType: "sandbox",
    });
    expect(harness.stdout[0]).toEqual({ id: 99, name: "Customer Demo" });
  });

  test("reports invalid IDs with a usage exit code", async () => {
    const harness = createHarness();

    expect(await runCli(["space", "get", "abc"], harness.options)).toBe(2);
    expect(harness.stderr[0]).toContain("A positive space ID is required");
  });

  test("reports unknown commands", async () => {
    const harness = createHarness();

    expect(await runCli(["unknown"], harness.options)).toBe(2);
    expect(harness.stderr[0]).toContain("Unknown command 'unknown'");
  });
});
