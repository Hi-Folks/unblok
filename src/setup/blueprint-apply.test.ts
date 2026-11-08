import { describe, expect, test } from "bun:test";
import {
  applySupportedBlueprint,
  compileSupportedBlueprint,
} from "./blueprint-apply.ts";

describe("blueprint execution", () => {
  test("resolves YAML app slugs separately for each target space", async () => {
    const writes: Array<[number, string]> = [];
    const blueprint = compileSupportedBlueprint({
      version: 1,
      apps: { install: ["import"] },
    });
    const gateway = {
      listInstalledApps: async () => [],
      listAvailableApps: async (space: number) => [
        { id: space === 1_500_000 ? 11 : 22, slug: "import", name: "Import" },
      ],
      installApp: async (space: number, id: string) => {
        writes.push([space, id]);
        return { app_id: id, slug: "import", name: "Import" };
      },
    };
    expect(
      (await applySupportedBlueprint(gateway as never, 1_500_000, blueprint))
        .failed,
    ).toBe(false);
    expect(
      (await applySupportedBlueprint(gateway as never, 2_500_000, blueprint))
        .failed,
    ).toBe(false);
    expect(writes).toEqual([
      [1_500_000, "11"],
      [2_500_000, "22"],
    ]);
  });
  test("reports the current app before it finishes and reports a continued failure", async () => {
    const blueprint = compileSupportedBlueprint({
      version: 1,
      apps: { continue_on_error: true, install: ["import", "export"] },
    });
    const events: Array<{
      stage: string;
      item?: string;
      current?: number;
      total?: number;
      failed?: boolean;
    }> = [];
    let release: (() => void) | undefined;
    const gate = new Promise<void>((resolve) => {
      release = resolve;
    });
    const gateway = {
      listAvailableApps: async () => [
        { id: 1, slug: "import", name: "Import" },
        { id: 2, slug: "export", name: "Export" },
      ],
      listInstalledApps: async () => [],
      installApp: async (_space: number, id: string) => {
        if (id === "1") {
          await gate;
          throw new Error("unavailable");
        }
        return { app_id: 2, slug: "export", name: "Export" };
      },
    };
    const pending = applySupportedBlueprint(
      gateway as never,
      42,
      blueprint,
      [],
      (event) => events.push(event),
    );
    await Promise.resolve();
    expect(events).toEqual([
      { stage: "apps", current: 1, total: 2, item: "import" },
    ]);
    release?.();
    const report = await pending;
    expect(events).toContainEqual({
      stage: "apps",
      current: 1,
      total: 2,
      item: "import",
      failed: true,
    });
    expect(events).toContainEqual({
      stage: "apps",
      current: 2,
      total: 2,
      item: "export",
    });
    expect(report.failed).toBe(true);
  });
  test("validates unsupported operations before execution", () => {
    expect(() =>
      compileSupportedBlueprint({
        version: 1,
        apps: { install: ["import"] },
        ai: { enabled: true },
      }),
    ).toThrow("must both be booleans");
    expect(() =>
      compileSupportedBlueprint({
        version: 1,
        tags: [{ stories: { slugs: ["home"] }, tags: ["Page"], other: true }],
      }),
    ).toThrow("only stories.slugs and tags");
    expect(() =>
      compileSupportedBlueprint({
        version: 1,
        components: {
          fields: [
            {
              component: "page",
              field: "body",
              type: "text",
              customize_toolbar: false,
            },
          ],
        },
      }),
    ).toThrow("only supported for richtext");
  });

  test("configures space AI independently and skips an already matching setting", async () => {
    const blueprint = compileSupportedBlueprint({
      version: 1,
      ai: { enabled: true, inherit_org_configuration: false },
    });
    let space = {
      id: 42,
      ai_text_generator_disabled: true,
      inherit_org_ai_configuration: true,
    };
    const calls: unknown[] = [];
    const gateway = {
      getSpace: async () => space,
      updateSpaceSettings: async (
        _id: number,
        settings: Partial<typeof space>,
      ) => {
        calls.push(settings);
        space = { ...space, ...settings };
      },
    };
    const first = await applySupportedBlueprint(
      gateway as never,
      42,
      blueprint,
    );
    const second = await applySupportedBlueprint(
      gateway as never,
      42,
      blueprint,
    );
    expect(calls).toEqual([
      {
        ai_text_generator_disabled: false,
        inherit_org_ai_configuration: false,
      },
    ]);
    expect(first.operations).toContainEqual({
      operation: "configure-space-ai",
      key: "space",
      status: "updated",
    });
    expect(second.operations[0]?.status).toBe("unchanged");
  });

  test("enables AI Translations before general apps and avoids installing it twice", async () => {
    const blueprint = compileSupportedBlueprint({
      version: 1,
      ai_translation: { disclaimer_id: 35 },
      apps: { install: [{ id: 29942 }, "import"] },
    });
    const calls: string[] = [];
    const gateway = {
      getSpace: async () => ({ id: 42, disclaimer_ids: [] }) as never,
      acceptSpaceDisclaimer: async (_id: number, disclaimer: number) => {
        calls.push(`disclaimer:${disclaimer}`);
      },
      listInstalledApps: async () => [],
      listAvailableApps: async () => [
        { id: 12, name: "Import", slug: "import" },
      ],
      installApp: async (_id: number, appId: string) => {
        calls.push(`app:${appId}`);
        return { app_id: Number(appId), name: "App", slug: "app" };
      },
    };
    const report = await applySupportedBlueprint(
      gateway as never,
      42,
      blueprint,
    );
    expect(report.failed).toBe(false);
    expect(calls).toEqual(["disclaimer:35", "app:29942", "app:12"]);
  });

  test("calls app and tag actions for a supported blueprint", async () => {
    const blueprint = compileSupportedBlueprint({
      version: 1,
      apps: { install: ["import"] },
      tags: [{ stories: { slugs: ["home"] }, tags: ["Landing"] }],
    });
    const calls: unknown[] = [];
    const gateway = {
      listInstalledApps: async () => [],
      listAvailableApps: async () => [
        { id: 12, name: "Import", slug: "import" },
      ],
      installApp: async (_space: number, id: string) => {
        calls.push(["app", id]);
        return { app_id: id, name: "Import", slug: "import" };
      },
      findStoryBySlug: async (_space: number, slug: string) =>
        ({
          id: 5,
          full_slug: slug,
          is_folder: false,
          tag_list: ["Existing"],
        }) as never,
      getStory: async () =>
        ({
          id: 5,
          full_slug: "home",
          is_folder: false,
          tag_list: ["Existing"],
        }) as never,
      updateStoryTags: async (_space: number, id: number, tags: string[]) => {
        calls.push(["tags", id, tags]);
      },
    };
    const report = await applySupportedBlueprint(
      gateway as never,
      42,
      blueprint,
    );
    expect(calls).toEqual([
      ["app", "12"],
      ["tags", 5, ["Existing", "Landing"]],
    ]);
    expect(report.failed).toBe(false);
  });

  test("reconciles languages, preview, demo mode and app IDs across repeat runs", async () => {
    const blueprint = compileSupportedBlueprint({
      version: 1,
      space: { languages: ["it"] },
      preview: {
        enabled: true,
        default: "https://example.com/?token=${{ space.preview_token }}",
        environments: [
          {
            name: "Local",
            url: "https://localhost/?token=${{ space.preview_token }}",
          },
        ],
      },
      demo_mode: { remove: true },
      apps: { install: [{ id: 29942 }] },
    });
    let languages = [{ code: "fr", name: "Français" }];
    let space = {
      id: 42,
      first_token: "super-secret",
      domain: "old",
      is_demo: true,
      environments: [{ name: "Other", location: "https://other.example" }],
    };
    let installed: Array<{ app_id: number; slug: string; name: string }> = [];
    let writes = 0;
    const gateway = {
      listLanguages: async () => languages,
      updateLanguages: async (_id: number, next: typeof languages) => {
        writes++;
        languages = next;
        return next;
      },
      getSpace: async () => space as never,
      updateSpaceSettings: async (
        _id: number,
        settings: Partial<typeof space>,
      ) => {
        writes++;
        space = { ...space, ...settings };
      },
      listInstalledApps: async () => installed,
      installApp: async (_id: number, appId: string) => {
        writes++;
        const app = { app_id: Number(appId), name: "App", slug: "app" };
        installed.push(app);
        return app;
      },
    };
    const first = await applySupportedBlueprint(
      gateway as never,
      42,
      blueprint,
    );
    expect(first.failed).toBe(false);
    expect(languages).toEqual([
      { code: "fr", name: "Français" },
      { code: "it", name: "Italian" },
    ]);
    expect(space.environments).toEqual([
      { name: "Other", location: "https://other.example" },
      { name: "Local", location: "https://localhost/?token=super-secret" },
    ]);
    expect(space.domain).toBe("https://example.com/?token=super-secret");
    expect(JSON.stringify(first)).not.toContain("super-secret");
    expect(writes).toBe(4);
    const second = await applySupportedBlueprint(
      gateway as never,
      42,
      blueprint,
    );
    expect(second.failed).toBe(false);
    expect(writes).toBe(4);
    expect(second.operations.every((item) => item.status === "unchanged")).toBe(
      true,
    );
  });

  test("does not expose preview token from API failures or continue to apps", async () => {
    const blueprint = compileSupportedBlueprint({
      version: 1,
      preview: {
        default: "https://example.com/?token=${{ space.preview_token }}",
      },
      apps: { install: ["import"] },
    });
    let calls = 0;
    const gateway = {
      getSpace: async () => ({ first_token: "secret", domain: "old" }) as never,
      updateSpaceSettings: async () => {
        throw new Error("bad token=secret");
      },
      listInstalledApps: async () => {
        calls++;
        return [];
      },
    };
    const report = await applySupportedBlueprint(
      gateway as never,
      42,
      blueprint,
    );
    expect(report.failed).toBe(true);
    expect(JSON.stringify(report)).not.toContain("secret");
    expect(calls).toBe(0);
  });

  test("honors app failure continuation and reports partial failure", async () => {
    let installed = 0;
    const gateway = {
      listInstalledApps: async () => [],
      listAvailableApps: async () => [
        { id: 12, name: "Import", slug: "import" },
      ],
      installApp: async () => {
        installed++;
        return { app_id: 12, slug: "import", name: "Import" };
      },
    };
    const stop = compileSupportedBlueprint({
      version: 1,
      apps: { install: ["missing", "import"] },
    });
    const stopped = await applySupportedBlueprint(gateway as never, 42, stop);
    expect(stopped.failed).toBe(true);
    expect(installed).toBe(0);
    expect(stopped.summary).toEqual({
      completed: 0,
      skipped: 0,
      failed: 1,
      notRun: 1,
    });
    expect(stopped.operations[1]).toMatchObject({
      operation: "install-app",
      key: "import",
      status: "not_run",
      reason: "Stopped after an earlier failure.",
    });
    expect(stopped.recovery?.message).toContain("--space-id 42");
    const proceed = compileSupportedBlueprint({
      version: 1,
      apps: { continue_on_error: true, install: ["missing", "import"] },
    });
    const continued = await applySupportedBlueprint(
      gateway as never,
      42,
      proceed,
    );
    expect(continued.failed).toBe(true);
    expect(continued.operations.map((item) => item.status)).toEqual([
      "failed",
      "installed",
    ]);
    expect(installed).toBe(1);
  });

  test("explains skipped stories and identifies a failed story with later work not run", async () => {
    const blueprint = compileSupportedBlueprint({
      version: 1,
      stories: {
        create: [
          {
            name: "Existing",
            slug: "existing",
            content: { component: "page" },
          },
          { name: "New", slug: "new", content: { component: "page" } },
          { name: "Later", slug: "later", content: { component: "page" } },
        ],
      },
      tags: [{ stories: { slugs: ["existing"] }, tags: ["Demo"] }],
    });
    const gateway = {
      findStoryBySlug: async (_id: number, slug: string) =>
        slug === "existing" ? { id: 1 } : undefined,
      createStory: async () => {
        throw new Error("Story limit reached");
      },
    };
    const report = await applySupportedBlueprint(
      gateway as never,
      42,
      blueprint,
    );
    expect(report.operations).toEqual([
      {
        operation: "create-story",
        key: "existing",
        status: "unchanged",
        reason: "Story already exists; its content was preserved.",
      },
      {
        operation: "create-story",
        key: "new",
        status: "failed",
        error: "Story limit reached",
        reason: "Story limit reached",
      },
      {
        operation: "create-story",
        key: "later",
        status: "not_run",
        reason: "Stopped after an earlier failure.",
      },
      {
        operation: "assign-tags",
        key: "existing",
        status: "not_run",
        reason: "Stopped after an earlier failure.",
      },
    ]);
    expect(report.summary).toEqual({
      completed: 0,
      skipped: 1,
      failed: 1,
      notRun: 2,
    });
  });

  test("installs the app before reconciling component fields", async () => {
    const blueprint = compileSupportedBlueprint({
      version: 1,
      apps: { install: ["seo"] },
      components: {
        fields: [
          {
            component: "article-page",
            field: "SEO",
            type: "custom",
            field_type: "sb-ai-seo",
            tab: "SEO",
          },
          {
            component: "article-page",
            field: "text",
            type: "richtext",
            customize_toolbar: false,
          },
        ],
      },
    });
    let schema: Record<string, Record<string, unknown>> = {
      text: { type: "richtext", customize_toolbar: true },
    };
    const calls: string[] = [];
    const component = () => ({ id: 1, name: "article-page", schema }) as never;
    const gateway = {
      listInstalledApps: async () => [],
      listAvailableApps: async () => [{ id: 12, name: "SEO", slug: "seo" }],
      installApp: async () => {
        calls.push("install");
        return { app_id: 12, slug: "seo", name: "SEO" };
      },
      listComponents: async () => [component()],
      getComponent: async () => component(),
      updateComponent: async (
        _space: number,
        _id: number,
        value: { schema?: unknown },
      ) => {
        calls.push("field");
        schema = value.schema as typeof schema;
        return component();
      },
    };
    const result = await applySupportedBlueprint(
      gateway as never,
      42,
      blueprint,
    );
    expect(result.failed).toBe(false);
    expect(calls).toEqual(["install", "field", "field"]);
    expect(result.operations.map((item) => item.status)).toEqual([
      "installed",
      "created",
      "updated",
    ]);
    expect(schema.text?.customize_toolbar).toBe(false);
  });
});
