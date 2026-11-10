import { describe, expect, test, setSystemTime } from "bun:test";
import { ClientError } from "@storyblok/management-api-client";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { PassThrough } from "node:stream";
import type { Environment } from "../config/environment.ts";
import { createOutput, type Output } from "../output.ts";
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
    publishRelease: async (_space, id) => ({
      id,
      name: "Release",
      released: true,
    }),
    getRelease: async (_space, id) => ({ id, name: "Release" }),
    getPipelineBranch: async (_space, id) => ({ id, name: "Branch" }),
    updateWorkflow: async () => {},
    createStoryFolder: async () => ({ id: 1 }),
    findStoryFolderBySlug: async () => undefined,
    listPipelineBranches: async () => [],
    createPipelineBranch: async (_spaceId, branch) => ({ id: 1, ...branch }),
    listReleases: async () => [],
    createRelease: async (_spaceId, name) => ({ id: 1, name }),
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
    aiTranslateStory: async () => ({}) as never,
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
  test("explains incompatible translation options before making requests", async () => {
    const cases = [
      {
        args: [
          "--id",
          "7",
          "--language",
          "de",
          "--workflow",
          "Default",
          "--yes",
        ],
        message: "--workflow' requires '--review-stage",
      },
      {
        args: ["--id", "7", "--language", "de", "--all-languages", "--yes"],
        message: "either '--all-languages' or '--language'",
      },
      { args: ["--id", "7", "--language", "de"], message: "require '--yes'" },
    ];
    for (const item of cases) {
      const harness = createHarness();
      let requests = 0;
      harness.options.createGateway = () => {
        requests++;
        throw new Error("Unexpected request");
      };
      expect(
        await runCli(
          ["story", "ai-translate", ...item.args, "--json"],
          harness.options,
        ),
      ).toBe(2);
      expect(harness.stderr[0]).toContain(item.message);
      expect(requests).toBe(0);
    }
  });

  test("does not present a queued translation as finished in progress output", async () => {
    const harness = createHarness({
      getStory: async () =>
        ({ id: 7, content: { component: "default-page" } }) as never,
      aiTranslateStory: async () => ({ backgroundTaskId: 123 }),
    });
    let completed = "";
    harness.options.output.activity = async (
      _message,
      successMessage,
      operation,
    ) => {
      const result = await operation();
      completed = successMessage;
      return result;
    };
    expect(
      await runCli(
        [
          "story",
          "ai-translate",
          "--id",
          "7",
          "--language",
          "de",
          "--space-id",
          "42",
          "--yes",
          "--json",
        ],
        harness.options,
      ),
    ).toBe(0);
    expect(completed).toBe("Translation requests processed");
    expect(harness.stdout[0]).toMatchObject({
      results: [{ status: "queued", backgroundTaskId: 123 }],
    });
  });

  test("reports blueprint validation issues for plan and apply before contacting Storyblok", async () => {
    const dir = await mkdtemp(join(tmpdir(), "unblok-invalid-blueprint-"));
    try {
      const file = join(dir, "setup.yaml");
      await writeFile(
        file,
        "version: 1\nreleases:\n  create:\n    - name: Campaign\n      release_in_day: 7\n",
      );
      for (const command of ["plan", "apply"]) {
        const harness = createHarness();
        let requests = 0;
        harness.options.createGateway = () => {
          requests++;
          throw new Error("Unexpected request");
        };
        const stdout = new PassThrough();
        const stderr = new PassThrough();
        let output = "";
        let errors = "";
        stdout.on("data", (chunk) => (output += chunk.toString()));
        stderr.on("data", (chunk) => (errors += chunk.toString()));
        harness.options.output = createOutput({ json: true, stdout, stderr });
        const args = ["space", "setup", command, "--config", file, "--json"];
        if (command === "apply") args.push("--space-id", "42", "--yes");
        expect(await runCli(args, harness.options)).toBe(2);
        expect(requests).toBe(0);
        expect(output).toBe("");
        expect(JSON.parse(errors).error).toMatchObject({
          code: "INVALID_INPUT",
          issues: [
            {
              path: "setup.releases.create[0].release_in_day",
              message: "unknown property. Did you mean 'release_in_days'?",
            },
          ],
        });
      }
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  });
  test("writes structured JSON for invalid input and API authentication errors", async () => {
    for (const apiFailure of [false, true]) {
      const harness = createHarness({
        listSpaces: async () => {
          throw new ClientError("secret", {
            status: 401,
            statusText: "Unauthorized",
            data: { message: "secret" },
          });
        },
      });
      const stdout = new PassThrough();
      const stderr = new PassThrough();
      let output = "";
      let errors = "";
      stdout.on("data", (chunk) => (output += chunk.toString()));
      stderr.on("data", (chunk) => (errors += chunk.toString()));
      harness.options.output = createOutput({ json: true, stdout, stderr });
      const args = apiFailure
        ? ["space", "list", "--json"]
        : ["story", "ai-translate", "--json"];
      expect(await runCli(args, harness.options)).toBe(apiFailure ? 1 : 2);
      expect(output).toBe("");
      expect(JSON.parse(errors).error).toMatchObject(
        apiFailure
          ? { code: "UNAUTHORIZED", status: 401, exitCode: 1 }
          : { code: "INVALID_INPUT", exitCode: 2 },
      );
      expect(errors).not.toContain("secret");
    }
  });

  test("preserves the JSON partial report when a translation fails", async () => {
    const harness = createHarness({
      getStory: async () =>
        ({ id: 7, content: { component: "default-page" } }) as never,
      aiTranslateStory: async () => {
        throw new Error("Translation unavailable");
      },
    });
    const stdout = new PassThrough();
    const stderr = new PassThrough();
    let report = "";
    let errors = "";
    stdout.on("data", (chunk) => (report += chunk.toString()));
    stderr.on("data", (chunk) => (errors += chunk.toString()));
    harness.options.output = createOutput({ json: true, stdout, stderr });
    expect(
      await runCli(
        [
          "story",
          "ai-translate",
          "--id",
          "7",
          "--language",
          "de",
          "--space-id",
          "42",
          "--yes",
          "--json",
        ],
        harness.options,
      ),
    ).toBe(1);
    expect(JSON.parse(report)).toMatchObject({
      failed: true,
      results: [{ status: "failed" }],
    });
    expect(JSON.parse(errors).error).toMatchObject({
      code: "UNKNOWN",
      exitCode: 1,
    });
  });

  test("requires confirmation and publishes a release once", async () => {
    let released = false;
    let writes = 0;
    const harness = createHarness({
      listInstalledApps: async () => [
        { app_id: 1, name: "Releases", slug: "releases_only" },
      ],
      listReleases: async () => [{ id: 5, name: "Campaign" }],
      getRelease: async () => ({ id: 5, name: "Campaign", released }),
      publishRelease: async (_space, _id, name) => {
        expect(name).toBe("Campaign");
        writes++;
        released = true;
        return { id: 5, name, released };
      },
    });
    const args = [
      "release",
      "publish",
      "--ref",
      "Campaign",
      "--space-id",
      "42",
      "--json",
    ];
    expect(await runCli(args, harness.options)).toBe(2);
    expect(writes).toBe(0);
    expect(await runCli([...args, "--yes"], harness.options)).toBe(0);
    expect(await runCli([...args, "--yes"], harness.options)).toBe(0);
    expect(harness.stdout).toMatchObject([
      { status: "published", releaseId: 5 },
      { status: "unchanged", releaseId: 5 },
    ]);
    expect(writes).toBe(1);
  });
  test("gets a release and pipeline stage with structured output", async () => {
    const harness = createHarness({
      listInstalledApps: async () => [
        { app_id: 1, name: "Releases", slug: "releases_only" },
        { app_id: 2, name: "Pipelines", slug: "branches" },
      ],
      listReleases: async () => [{ id: 5, name: "Campaign" }],
      getRelease: async (_space, id) => ({
        id,
        name: "Campaign",
        released: false,
      }),
      getPipelineBranch: async (_space, id) => ({
        id,
        name: "Go Live",
        source_id: 1,
      }),
    });
    expect(
      await runCli(
        ["release", "get", "--ref", "Campaign", "--space-id", "42", "--json"],
        harness.options,
      ),
    ).toBe(0);
    expect(
      await runCli(
        ["pipeline", "get", "--ref", "8", "--space-id", "42", "--json"],
        harness.options,
      ),
    ).toBe(0);
    expect(harness.stdout).toEqual([
      { id: 5, name: "Campaign", released: false },
      { id: 8, name: "Go Live", source_id: 1 },
    ]);
    expect(
      await runCli(["release", "get", "--space-id", "42"], harness.options),
    ).toBe(2);
  });
  test("uses event inputs to translate and review the selected story and language", async () => {
    const calls: unknown[] = [];
    const harness = createHarness({
      listWorkflows: async () =>
        [{ id: 5, name: "Default", per_language_stages: true }] as never,
      listWorkflowStages: async () =>
        [{ id: 8, name: "Reviewing", workflow_id: 5 }] as never,
      getStory: async (_space, id) =>
        ({ id, content: { component: "default-page" }, stages: [] }) as never,
      aiTranslateStory: async (_space, id, input) => {
        calls.push({ id, input });
        return { backgroundTaskId: 123 };
      },
      assignWorkflowStage: async (_space, input) => {
        calls.push(input);
        return { id: 1, workflow_stage_id: 8 };
      },
    });
    expect(
      await runCli(
        [
          "space",
          "setup",
          "apply",
          "--config",
          "examples/features/setup-translation-from-event.yaml",
          "--space-id",
          "42",
          "--input",
          "story_id=777",
          "--input",
          "language=de",
          "--yes",
          "--json",
        ],
        harness.options,
      ),
    ).toBe(0);
    expect(calls).toEqual([
      { id: 777, input: { lang: "de", code: "de", overwrite: false } },
      { storyId: 777, stageId: 8, language: "de" },
    ]);
  });
  test("shows asset names and counts while each upload runs", async () => {
    const dir = await mkdtemp(join(tmpdir(), "unblok-asset-progress-"));
    try {
      await writeFile(join(dir, "a.png"), "one");
      await writeFile(join(dir, "b.png"), "two");
      const config = join(dir, "setup.yaml");
      await writeFile(
        config,
        "version: 1\nassets:\n  upload_directory:\n    - source: .\n      target_folder: Demo\n      include: ['*.png']\n",
      );
      const events: string[] = [];
      const harness = createHarness({
        uploadAsset: async (_space, _folder, name) => {
          events.push(`upload ${name}`);
        },
      });
      harness.options.output = {
        ...harness.options.output,
        mode: "human",
        task: (title) => {
          events.push(`start: ${title}`);
          return {
            message: (message) => events.push(message),
            success: (message) => events.push(message),
            error: (message) => events.push(message),
          };
        },
      };
      expect(
        await runCli(
          [
            "space",
            "setup",
            "apply",
            "--config",
            config,
            "--space-id",
            "42",
            "--yes",
          ],
          harness.options,
        ),
      ).toBe(0);
      expect(events).toEqual([
        "start: Managing assets",
        "1/2 · a.png",
        "upload a.png",
        "2/2 · b.png",
        "upload b.png",
        "Managing assets complete",
      ]);
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  });
  test("groups setup progress by operation and distinguishes queued translations", async () => {
    const dir = await mkdtemp(join(tmpdir(), "unblok-progress-"));
    try {
      const config = join(dir, "setup.yaml");
      await writeFile(
        config,
        "version: 1\nworkflow:\n  edit:\n    - workflow: Default\n      per_language_stages: true\nstories:\n  ai_translate:\n    - story_slug: home\n      languages:\n        - lang: it\n          code: it\n",
      );
      let enabled = false;
      const events: string[] = [];
      const harness = createHarness({
        listWorkflows: async () =>
          [{ id: 5, name: "Default", per_language_stages: enabled }] as never,
        updateWorkflow: async () => {
          enabled = true;
        },
        findStoryBySlug: async () => ({ id: 7, full_slug: "home" }) as never,
        getStory: async () =>
          ({ id: 7, content: { component: "default-page" } }) as never,
        aiTranslateStory: async () => ({ backgroundTaskId: 123 }),
      });
      harness.options.output = {
        ...harness.options.output,
        mode: "human",
        task: (title) => {
          events.push(`start: ${title}`);
          return {
            message: (message) => events.push(message),
            success: (message) => events.push(message),
            error: (message) => events.push(message),
          };
        },
      };
      expect(
        await runCli(
          [
            "space",
            "setup",
            "apply",
            "--config",
            config,
            "--space-id",
            "42",
            "--yes",
          ],
          harness.options,
        ),
      ).toBe(0);
      expect(events).toEqual([
        "start: Configuring workflows",
        "Default",
        "Configuring workflows complete",
        "start: Translating content",
        "home/it",
        "Translation requests submitted",
      ]);
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  });
  test("applies AI translation using a story slug in YAML", async () => {
    const dir = await mkdtemp(join(tmpdir(), "unblok-ai-slug-"));
    try {
      const config = join(dir, "setup.yaml");
      await writeFile(
        config,
        "version: 1\nstories:\n  ai_translate:\n    - story_slug: home\n      languages:\n        - lang: it\n          code: it\n",
      );
      let translatedId: number | undefined;
      const harness = createHarness({
        findStoryBySlug: async (_space, slug) =>
          ({ id: 77, full_slug: slug, is_folder: false }) as never,
        getStory: async (_space, id) =>
          ({ id, content: { component: "default-page" } }) as never,
        aiTranslateStory: async (_space, id) => {
          translatedId = id;
          return { backgroundTaskId: 123 };
        },
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
            "42",
            "--yes",
            "--json",
          ],
          harness.options,
        ),
      ).toBe(0);
      expect(translatedId).toBe(77);
      expect(harness.stdout[0]).toMatchObject({
        operations: [
          { operation: "ai-translate-story", key: "home/it", status: "queued" },
        ],
      });
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  });
  test("edits workflow settings and skips unchanged values", async () => {
    let enabled = false;
    const harness = createHarness({
      listWorkflows: async () =>
        [
          {
            id: 5,
            name: "Default",
            content_types: [],
            per_language_stages: enabled,
          },
        ] as never,
      updateWorkflow: async (_space, _id, fields) => {
        expect(fields).toEqual({ per_language_stages: true });
        enabled = true;
      },
    });
    const args = [
      "workflow",
      "edit",
      "--workflow",
      "Default",
      "--per-language-stages",
      "true",
      "--space-id",
      "42",
      "--yes",
      "--json",
    ];
    expect(await runCli(args, harness.options)).toBe(0);
    expect(await runCli(args, harness.options)).toBe(0);
    expect(harness.stdout).toMatchObject([
      { status: "updated", workflowId: 5 },
      { status: "unchanged", workflowId: 5 },
    ]);
  });
  test("assigns queued translation to a language-specific review stage", async () => {
    const assigned: unknown[] = [];
    const harness = createHarness({
      listWorkflows: async () =>
        [{ id: 5, name: "Default", per_language_stages: true }] as never,
      listWorkflowStages: async () =>
        [{ id: 8, name: "Review translation", workflow_id: 5 }] as never,
      getStory: async () =>
        ({
          id: 7,
          content: { component: "default-page" },
          stages: [],
        }) as never,
      aiTranslateStory: async () => ({ backgroundTaskId: 123 }),
      assignWorkflowStage: async (_space, input) => {
        assigned.push(input);
        return { id: 1, workflow_stage_id: 8 };
      },
    });
    expect(
      await runCli(
        [
          "story",
          "ai-translate",
          "--id",
          "7",
          "--language",
          "de",
          "--review-stage",
          "Review translation",
          "--workflow",
          "Default",
          "--space-id",
          "42",
          "--yes",
          "--json",
        ],
        harness.options,
      ),
    ).toBe(0);
    expect(assigned).toEqual([{ storyId: 7, stageId: 8, language: "de" }]);
    expect(harness.stdout[0]).toMatchObject({
      results: [{ status: "queued", review: { status: "assigned" } }],
    });
  });
  test("queues all space languages and reports each task ID", async () => {
    let taskId = 100;
    const harness = createHarness({
      listLanguages: async () => [
        { code: "de", name: "German", aiTranslationCode: "de" },
        { code: "it", name: "Italian", aiTranslationCode: "it" },
      ],
      getStory: async () =>
        ({ id: 7, content: { component: "default-page" } }) as never,
      aiTranslateStory: async () => ({ backgroundTaskId: ++taskId }),
    });
    expect(
      await runCli(
        [
          "story",
          "ai-translate",
          "--id",
          "7",
          "--all-languages",
          "--space-id",
          "42",
          "--yes",
          "--json",
        ],
        harness.options,
      ),
    ).toBe(0);
    expect(harness.stdout[0]).toMatchObject({
      failed: false,
      results: [
        { language: { code: "de" }, status: "queued", backgroundTaskId: 101 },
        { language: { code: "it" }, status: "queued", backgroundTaskId: 102 },
      ],
    });
  });
  test("reports a queued background translation as accepted", async () => {
    const harness = createHarness({
      getStory: async () =>
        ({ id: 7, content: { component: "default-page" } }) as never,
      aiTranslateStory: async () => ({ backgroundTaskId: 123 }),
    });
    expect(
      await runCli(
        [
          "story",
          "ai-translate",
          "--id",
          "7",
          "--language",
          "de",
          "--space-id",
          "42",
          "--yes",
          "--json",
        ],
        harness.options,
      ),
    ).toBe(0);
    expect(harness.stdout[0]).toMatchObject({
      failed: false,
      results: [{ status: "queued", backgroundTaskId: 123 }],
    });
  });
  test("translates all configured space languages", async () => {
    const requested: unknown[] = [];
    const harness = createHarness({
      listLanguages: async () => [
        { code: "pt-br", name: "Portuguese", aiTranslationCode: "pt" },
      ],
      getStory: async () =>
        ({ id: 7, content: { component: "default-page" } }) as never,
      aiTranslateStory: async (_space, _id, input) => {
        requested.push(input);
        return { id: 7, content: { component: "default-page" } } as never;
      },
    });
    expect(
      await runCli(
        [
          "story",
          "ai-translate",
          "--id",
          "7",
          "--all-languages",
          "--space-id",
          "42",
          "--yes",
          "--json",
        ],
        harness.options,
      ),
    ).toBe(0);
    expect(requested).toEqual([
      { lang: "pt", code: "pt-br", overwrite: false },
    ]);
    expect(
      await runCli(
        [
          "story",
          "ai-translate",
          "--id",
          "7",
          "--all-languages",
          "--language",
          "de",
          "--space-id",
          "42",
          "--yes",
        ],
        harness.options,
      ),
    ).toBe(2);
  });
  test("translates and saves a story using the shared action", async () => {
    let saved: unknown;
    const harness = createHarness({
      getStory: async () =>
        ({
          id: 7,
          content: { component: "default-page", title: "Hello" },
        }) as never,
      aiTranslateStory: async (_space, _id, input) => {
        expect(input).toEqual({ lang: "de", code: "de", overwrite: false });
        return {
          id: 7,
          content: {
            component: "default-page",
            title: "Hello",
            title__i18n__de: "Hallo",
          },
        } as never;
      },
      updateStoryContent: async (_space, _id, content) => {
        saved = content;
        return {} as never;
      },
    });
    expect(
      await runCli(
        [
          "story",
          "ai-translate",
          "--id",
          "7",
          "--language",
          "de",
          "--space-id",
          "42",
          "--yes",
          "--json",
        ],
        harness.options,
      ),
    ).toBe(0);
    expect(saved).toMatchObject({ title__i18n__de: "Hallo" });
    expect(harness.stdout[0]).toMatchObject({
      failed: false,
      results: [{ status: "updated" }],
    });
  });
  test("edits a block in a specified release", async () => {
    const dir = await mkdtemp(join(tmpdir(), "unblok-release-edit-"));
    try {
      const file = join(dir, "fields.json");
      await writeFile(file, JSON.stringify({ title: "New" }));
      const reads: Array<number | undefined> = [];
      let writeScope: number | undefined;
      const harness = createHarness({
        getStory: async (_space, _id, releaseId) => {
          reads.push(releaseId);
          return {
            content: { _uid: "hero-uid", component: "hero", title: "Old" },
          } as never;
        },
        updateStoryContent: async (_space, _id, _content, releaseId) => {
          writeScope = releaseId;
          return {} as never;
        },
      });
      expect(
        await runCli(
          [
            "story",
            "block-update",
            "--id",
            "7",
            "--uid",
            "hero-uid",
            "--file",
            file,
            "--release-id",
            "9",
            "--space-id",
            "42",
            "--yes",
            "--json",
          ],
          harness.options,
        ),
      ).toBe(0);
      expect(reads).toEqual([9]);
      expect(writeScope).toBe(9);
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  });
  test("creates a story in a specified release", async () => {
    const dir = await mkdtemp(join(tmpdir(), "unblok-release-story-"));
    try {
      const file = join(dir, "story.json");
      await writeFile(
        file,
        JSON.stringify({
          name: "Page",
          slug: "page",
          content: { component: "page" },
        }),
      );
      let selected: number | undefined;
      const harness = createHarness({
        createStory: async (_space, _story, releaseId) => {
          selected = releaseId;
          return {} as never;
        },
      });
      expect(
        await runCli(
          [
            "story",
            "create",
            "--file",
            file,
            "--release-id",
            "9",
            "--space-id",
            "42",
            "--yes",
            "--json",
          ],
          harness.options,
        ),
      ).toBe(0);
      expect(selected).toBe(9);
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  });

  test("creates a nested folder path with confirmation and JSON output", async () => {
    const created: unknown[] = [];
    const harness = createHarness({
      findStoryFolderBySlug: async () => undefined,
      findStoryBySlug: async () => undefined,
      createStoryFolder: async (_space, input) => {
        created.push(input);
        return { id: created.length };
      },
    });
    const args = [
      "story",
      "folder",
      "create",
      "--path",
      "folder1/subfolder2",
      "--space-id",
      "42",
      "--json",
    ];
    expect(await runCli(args, harness.options)).toBe(2);
    expect(created).toEqual([]);
    expect(await runCli([...args, "--yes"], harness.options)).toBe(0);
    expect(harness.stdout).toEqual([
      {
        status: "created",
        path: "folder1/subfolder2",
        folderId: 2,
        created: ["folder1", "folder1/subfolder2"],
      },
    ]);
    expect(created).toEqual([
      { name: "folder1", slug: "folder1", parentId: 0 },
      { name: "subfolder2", slug: "subfolder2", parentId: 1 },
    ]);
  });
  test("creates a story inside an existing folder using its full slug", async () => {
    const dir = await mkdtemp(join(tmpdir(), "unblok-nested-story-"));
    try {
      const file = join(dir, "story.json");
      await writeFile(
        file,
        JSON.stringify({
          name: "Welcome",
          slug: "articles/news/welcome",
          content: { component: "page" },
        }),
      );
      const harness = createHarness({
        findStoryFolderBySlug: async (_space, slug) => {
          expect(slug).toBe("articles/news");
          return { id: 19 };
        },
        createStory: async (_space, story) => {
          expect(story.slug).toBe("welcome");
          expect(story.parent_id).toBe(19);
          return {} as never;
        },
      });
      expect(
        await runCli(
          [
            "story",
            "create",
            "--file",
            file,
            "--space-id",
            "42",
            "--yes",
            "--json",
          ],
          harness.options,
        ),
      ).toBe(0);
      expect(harness.stdout).toEqual([{ status: "created" }]);
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  });
  test("lists and creates pipeline stages with confirmation", async () => {
    const stages = [{ id: 1, name: "Preview" }];
    let writes = 0;
    const harness = createHarness({
      listInstalledApps: async () => [
        { app_id: 7, name: "Pipelines", slug: "branches" },
      ],
      listPipelineBranches: async () => stages,
      createPipelineBranch: async (_space, input) => {
        writes++;
        return { id: 2, ...input };
      },
    });
    expect(
      await runCli(
        ["pipeline", "list", "--space-id", "42", "--json"],
        harness.options,
      ),
    ).toBe(0);
    expect(
      await runCli(
        [
          "pipeline",
          "create",
          "--name",
          "Go Live",
          "--source",
          "Preview",
          "--space-id",
          "42",
          "--json",
        ],
        harness.options,
      ),
    ).toBe(2);
    expect(writes).toBe(0);
    expect(
      await runCli(
        [
          "pipeline",
          "create",
          "--name",
          "Go Live",
          "--source",
          "Preview",
          "--space-id",
          "42",
          "--yes",
          "--json",
        ],
        harness.options,
      ),
    ).toBe(0);
    expect(harness.stdout).toEqual([
      [{ id: 1, name: "Preview" }],
      { status: "created", branch: { id: 2, name: "Go Live", source_id: 1 } },
    ]);
  });
  test("schedules a release a specified number of days from now", async () => {
    setSystemTime(new Date("2027-01-01T12:34:45Z"));
    try {
      const harness = createHarness({
        listInstalledApps: async () => [
          { app_id: 1, name: "Releases", slug: "releases" },
        ],
        listReleases: async () => [],
        createRelease: async (_space, name, releaseAt) => ({
          id: 4,
          name,
          release_at: releaseAt,
        }),
      });
      expect(
        await runCli(
          [
            "release",
            "create",
            "--name",
            "Campaign",
            "--in-days",
            "7",
            "--space-id",
            "42",
            "--yes",
            "--json",
          ],
          harness.options,
        ),
      ).toBe(0);
      expect(harness.stdout).toEqual([
        {
          status: "created",
          release: { id: 4, name: "Campaign", release_at: "2027-01-08 12:34" },
        },
      ]);
    } finally {
      setSystemTime();
    }
  });
  test("lists and creates releases using the Releases app", async () => {
    let writes = 0;
    const harness = createHarness({
      listInstalledApps: async () => [
        { app_id: 1, name: "Releases", slug: "releases_only" },
      ],
      listReleases: async () => [{ id: 3, name: "Launch" }],
      createRelease: async (_space, name, releaseAt) => {
        expect(releaseAt).toBe("2027-02-20 15:30");
        writes++;
        return { id: 4, name };
      },
    });
    expect(
      await runCli(
        ["release", "list", "--space-id", "42", "--json"],
        harness.options,
      ),
    ).toBe(0);
    expect(
      await runCli(
        [
          "release",
          "create",
          "--name",
          "Campaign",
          "--release-at",
          "2027-02-20 15:30",
          "--space-id",
          "42",
          "--json",
        ],
        harness.options,
      ),
    ).toBe(2);
    expect(writes).toBe(0);
    expect(
      await runCli(
        [
          "release",
          "create",
          "--name",
          "Campaign",
          "--release-at",
          "2027-02-20 15:30",
          "--space-id",
          "42",
          "--yes",
          "--json",
        ],
        harness.options,
      ),
    ).toBe(0);
    expect(harness.stdout).toEqual([
      [{ id: 3, name: "Launch" }],
      { status: "created", release: { id: 4, name: "Campaign" } },
    ]);
    expect(
      await runCli(
        [
          "release",
          "create",
          "--name",
          "Launch",
          "--space-id",
          "42",
          "--yes",
          "--json",
        ],
        harness.options,
      ),
    ).toBe(0);
    expect(harness.stdout.at(-1)).toEqual({
      status: "unchanged",
      release: { id: 3, name: "Launch" },
    });
    expect(writes).toBe(1);
  });
  test("creates a draft story and preserves it on repeat runs", async () => {
    const dir = await mkdtemp(join(tmpdir(), "unblok-story-"));
    try {
      const file = join(dir, "story.json");
      await writeFile(
        file,
        JSON.stringify({
          name: "Welcome",
          slug: "welcome",
          content: { component: "page", body: [{ component: "hero" }] },
        }),
      );
      let exists = false;
      let writes = 0;
      const harness = createHarness({
        findStoryBySlug: async (_space, slug) =>
          exists ? ({ id: 7, full_slug: slug } as never) : undefined,
        createStory: async (space, story) => {
          expect(space).toBe(42);
          expect(story.content.component).toBe("page");
          expect(story.content._uid).toBeTruthy();
          writes++;
          exists = true;
          return { id: 7 } as never;
        },
      });
      const args = [
        "story",
        "create",
        "--file",
        file,
        "--space-id",
        "42",
        "--yes",
        "--json",
      ];
      expect(await runCli(args, harness.options)).toBe(0);
      expect(await runCli(args, harness.options)).toBe(0);
      expect(harness.stdout).toEqual([
        { status: "created" },
        { status: "unchanged" },
      ]);
      expect(harness.stderr).toEqual([]);
      expect(writes).toBe(1);
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  });

  test("rejects story creation without confirmation or with invalid definitions before requests", async () => {
    const dir = await mkdtemp(join(tmpdir(), "unblok-story-"));
    try {
      const file = join(dir, "story.json");
      let requests = 0;
      const harness = createHarness({
        findStoryBySlug: async () => {
          requests++;
          return undefined;
        },
      });
      const args = [
        "story",
        "create",
        "--file",
        file,
        "--space-id",
        "42",
        "--json",
      ];
      expect(await runCli(args, harness.options)).toBe(2);
      await writeFile(file, "{invalid");
      expect(await runCli([...args, "--yes"], harness.options)).toBe(2);
      await writeFile(
        file,
        JSON.stringify({
          name: "Page",
          slug: "page",
          content: { component: "page" },
          publish: true,
        }),
      );
      expect(await runCli([...args, "--yes"], harness.options)).toBe(2);
      await writeFile(
        file,
        JSON.stringify({
          name: "Page",
          slug: "folder//page",
          content: { component: "page" },
        }),
      );
      expect(await runCli([...args, "--yes"], harness.options)).toBe(1);
      expect(requests).toBe(0);
      expect(harness.stdout).toEqual([]);
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  });

  test("reports API failures during story creation", async () => {
    const dir = await mkdtemp(join(tmpdir(), "unblok-story-"));
    try {
      const file = join(dir, "story.json");
      await writeFile(
        file,
        JSON.stringify({
          name: "Page",
          slug: "page",
          content: { component: "page" },
        }),
      );
      const harness = createHarness({
        createStory: async () => {
          throw new ClientError("Forbidden", {
            status: 403,
            statusText: "Forbidden",
            data: {},
          });
        },
      });
      expect(
        await runCli(
          [
            "story",
            "create",
            "--file",
            file,
            "--space-id",
            "42",
            "--yes",
            "--json",
          ],
          harness.options,
        ),
      ).toBe(1);
      expect(harness.stdout).toEqual([]);
      expect(harness.stderr[0]).toContain("403");
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  });

  test("publishes a story's draft and skips a repeat run in JSON mode", async () => {
    let pending = true;
    let writes = 0;
    const harness = createHarness({
      findStoryBySlug: async (_space, slug) =>
        ({ id: 7, full_slug: slug }) as never,
      getStory: async () =>
        ({
          id: 7,
          full_slug: "pages/home",
          is_folder: false,
          published: true,
          unpublished_changes: pending,
        }) as never,
      publishStory: async (space, id) => {
        expect([space, id]).toEqual([42, 7]);
        writes++;
        pending = false;
      },
    });
    const args = [
      "story",
      "publish",
      "--slug",
      "pages/home",
      "--space-id",
      "42",
      "--yes",
      "--json",
    ];
    expect(await runCli(args, harness.options)).toBe(0);
    expect(await runCli(args, harness.options)).toBe(0);
    expect(harness.stdout).toEqual([
      { status: "published", storyId: 7 },
      { status: "unchanged", storyId: 7 },
    ]);
    expect(harness.stderr).toEqual([]);
    expect(writes).toBe(1);
  });

  test("requires confirmation and reports publication failures", async () => {
    let lookups = 0;
    const harness = createHarness({
      findStoryBySlug: async () => {
        lookups++;
        return undefined;
      },
    });
    expect(
      await runCli(
        ["story", "publish", "--slug", "home", "--space-id", "42", "--json"],
        harness.options,
      ),
    ).toBe(2);
    expect(lookups).toBe(0);
    expect(
      await runCli(
        [
          "story",
          "publish",
          "--slug",
          "home",
          "--space-id",
          "42",
          "--yes",
          "--json",
        ],
        harness.options,
      ),
    ).toBe(1);
    expect(harness.stderr.at(-1)).toContain("was not found");
    expect(harness.stdout).toEqual([]);
  });

  test("uploads an asset through the CLI and emits a JSON result", async () => {
    const dir = await mkdtemp(join(tmpdir(), "unblok-upload-"));
    try {
      const file = join(dir, "demo.png");
      await writeFile(file, "image");
      let count = 0;
      const harness = createHarness({
        uploadAsset: async (_space, folder, name, data) => {
          expect(folder).toBeUndefined();
          expect(name).toBe("demo.png");
          expect(new TextDecoder().decode(data)).toBe("image");
          count++;
        },
      });
      expect(
        await runCli(
          [
            "asset",
            "upload",
            "--file",
            file,
            "--space-id",
            "42",
            "--yes",
            "--json",
          ],
          harness.options,
        ),
      ).toBe(0);
      expect(harness.stdout).toEqual([
        { status: "created", filename: "demo.png" },
      ]);
      expect(harness.stderr).toEqual([]);
      expect(count).toBe(1);
      expect(
        await runCli(
          ["asset", "upload", "--file", file, "--space-id", "42", "--json"],
          harness.options,
        ),
      ).toBe(2);
      expect(count).toBe(1);
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  });
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

  test("plans the campaign recipe as JSON without credentials or Storyblok access", async () => {
    const harness = createHarness();
    harness.options.environment = {};
    harness.options.createGateway = () => {
      throw new Error("Planning must not contact Storyblok");
    };
    const stdout = new PassThrough();
    const stderr = new PassThrough();
    let output = "";
    let errors = "";
    stdout.on("data", (chunk) => (output += chunk.toString()));
    stderr.on("data", (chunk) => (errors += chunk.toString()));
    harness.options.output = createOutput({ json: true, stdout, stderr });

    expect(
      await runCli(
        [
          "space",
          "setup",
          "plan",
          "--config",
          "examples/recipes/campaign-launch.yaml",
          "--input",
          "campaign_name=Autumn Campaign",
          "--input",
          "asset_url=https://example.com/banner.jpg",
          "--json",
        ],
        harness.options,
      ),
    ).toBe(0);
    expect(errors).toBe("");
    const plan = JSON.parse(output);
    expect(plan).toMatchObject({
      apiVersion: "unblok/setup-blueprint-plan-v1",
      summary: { notImplemented: 0 },
      resolvedBlueprint: {
        releases: { create: [{ name: "Autumn Campaign", release_in_days: 7 }] },
        stories: {
          create: [{ name: "Autumn Campaign", release: "Autumn Campaign" }],
        },
        assets: { upload_url: [{ url: "https://example.com/banner.jpg" }] },
      },
    });
    expect(plan.operations).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          path: "releases.create",
          support: "available",
        }),
        expect.objectContaining({
          path: "stories.create",
          support: "available",
        }),
        expect.objectContaining({
          path: "assets.upload_url",
          support: "available",
        }),
      ]),
    );
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
      task: (title) => {
        events.push(title);
        return {
          message: (message) => events.push(message),
          success: () => events.push("complete"),
          error: () => events.push("failed"),
        };
      },
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
