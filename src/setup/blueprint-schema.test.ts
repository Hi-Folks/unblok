import { describe, expect, test } from "bun:test";
import { loadDocument } from "../config/document.ts";
import { compileSupportedBlueprint } from "./blueprint-apply.ts";
import { resolveBlueprint } from "./blueprint-validation.ts";
import schema from "../../space-setup.schema.json";
import Ajv2020 from "ajv/dist/2020.js";
import { loadBlueprint } from "./blueprint-loader.ts";

describe("blueprint editor schema", () => {
  test("country folder example validates and compiles", async () => {
    const blueprint = await loadBlueprint(
      "examples/features/setup-country-folders.yaml",
    );
    const resolved = resolveBlueprint(blueprint);
    const compiled = compileSupportedBlueprint(resolved);
    expect(compiled.apps).toEqual([{ id: "24" }]);
    expect(compiled.dimensionsFolders).toEqual([
      "global",
      "uk",
      "germany",
      "italy",
    ]);
    expect(compiled.organizeRoot).toEqual({
      destination: "global",
      keep: ["uk", "germany", "italy"],
    });
  });
  test("reports useful locations, typo suggestions, missing fields, and conflicting fields", () => {
    try {
      resolveBlueprint({
        version: 1,
        releases: { create: [{ name: "Campaign", release_in_day: 7 }] },
        stories: {
          create: [
            { slug: "first", content: { component: "default-page" } },
            {
              name: "Second",
              slug: "second",
              content: { component: "default-page" },
              release: "Campaign",
              release_id: 9,
            },
          ],
        },
      });
      throw new Error("Expected validation failure");
    } catch (error) {
      expect(error).toBeInstanceOf(Error);
      expect((error as Error).message).toContain(
        "setup.releases.create[0].release_in_day: unknown property. Did you mean 'release_in_days'?",
      );
      expect(error).toMatchObject({
        code: "INVALID_INPUT",
        issues: expect.arrayContaining([
          {
            path: "setup.releases.create[0].release_in_day",
            message: "unknown property. Did you mean 'release_in_days'?",
          },
          {
            path: "setup.stories.create[0].name",
            message: "required property is missing.",
          },
          {
            path: "setup.stories.create[1]",
            message: "cannot use 'release' and 'release_id' together.",
          },
        ]),
      });
    }
  });

  test("reports missing blueprint input as a structured issue", () => {
    try {
      resolveBlueprint({ version: 1, inputs: { campaign_name: {} } });
      throw new Error("Expected validation failure");
    } catch (error) {
      expect(error).toMatchObject({
        issues: [
          {
            path: "inputs.campaign_name",
            message: "requires a value (provide --input name=value).",
          },
        ],
      });
    }
  });
  test("uses local definitions and exposes only executable sections", () => {
    expect(schema.$schema).toBe("https://json-schema.org/draft/2020-12/schema");
    expect(schema.additionalProperties).toBe(false);
    expect(Object.keys(schema.properties)).toEqual([
      "version",
      "extends",
      "template",
      "execution",
      "inputs",
      "space",
      "preview",
      "demo_mode",
      "ai",
      "ai_translation",
      "experiments",
      "releases",
      "pipelines",
      "apps",
      "components",
      "assets",
      "stories",
      "workflow",
      "tags",
    ]);
    const walk = (value: unknown): void => {
      if (!value || typeof value !== "object") return;
      if (Array.isArray(value)) {
        value.forEach(walk);
        return;
      }
      for (const [key, child] of Object.entries(value)) {
        if (key === "$ref" && typeof child === "string") {
          expect(child.startsWith("#/$defs/")).toBe(true);
          expect(
            Object.hasOwn(schema.$defs, child.slice("#/$defs/".length)),
          ).toBe(true);
        } else walk(child);
      }
    };
    walk(schema);
  });

  test("all linked blueprint examples pass the CLI's validation and compilation", async () => {
    const validate = new Ajv2020({ allErrors: true, strict: false }).compile(
      schema,
    );
    for (const name of [
      "setup-apps-tags",
      "setup-assets",
      "setup-component-fields",
      "setup-configure",
      "setup-duplicate",
      "setup-experiment",
      "setup-remote-asset",
      "setup-releases",
      "setup-publish-release",
      "setup-release-stories",
      "setup-pipeline",
      "setup-stories",
      "setup-story-in-folder",
      "setup-workflow",
    ]) {
      const path = `examples/features/${name}.yaml`;
      expect(await Bun.file(path).text()).toStartWith(
        "# yaml-language-server: $schema=../../space-setup.schema.json",
      );
      const document = await loadDocument(path, "Setup");
      expect(validate(document)).toBe(true);
      const loaded = await loadBlueprint(path);
      expect(() =>
        compileSupportedBlueprint(resolveBlueprint(loaded)),
      ).not.toThrow();
    }
  });

  test("event translation example supports editor schema and string inputs", async () => {
    const path = "examples/features/setup-translation-from-event.yaml";
    const validate = new Ajv2020({ allErrors: true, strict: false }).compile(
      schema,
    );
    expect(validate(await loadDocument(path, "Setup"))).toBe(true);
    const resolved = resolveBlueprint(await loadBlueprint(path), {
      story_id: "123",
      language: "de",
    });
    expect(compileSupportedBlueprint(resolved).aiTranslations[0]?.storyId).toBe(
      123,
    );
  });

  test("rejects unsupported sections and invalid component fields through the shared schema", () => {
    expect(() =>
      resolveBlueprint({ version: 1, ai: { enabled: true } }),
    ).toThrow("inherit_org_configuration");
    expect(() =>
      resolveBlueprint({
        version: 1,
        components: {
          fields: [
            {
              component: "page",
              field: "body",
              type: "text",
              customize_toolbar: true,
            },
          ],
        },
      }),
    ).toThrow("setup.components.fields[0].type");
    expect(() =>
      resolveBlueprint({
        version: 1,
        assets: {
          upload_url: [{ name: "hero", url: "https://example.com/x.png" }],
        },
      }),
    ).toThrow("target_folder");
  });

  test("accepts positive release IDs for story creation and block edits", () => {
    const compiled = compileSupportedBlueprint(
      resolveBlueprint({
        version: 1,
        stories: {
          create: [
            {
              name: "Page",
              slug: "page",
              content: { component: "page" },
              release_id: 9,
            },
          ],
          update_blocks: [
            {
              story_slug: "home",
              component: "hero",
              fields: { title: "New" },
              release_id: 9,
            },
          ],
        },
      }),
    );
    expect(compiled.stories[0]?.releaseId).toBe(9);
    expect(compiled.storyUpdates[0]?.release_id).toBe(9);
    expect(() =>
      resolveBlueprint({
        version: 1,
        stories: {
          create: [
            {
              name: "Page",
              slug: "page",
              content: { component: "page" },
              release_id: 0,
            },
          ],
        },
      }),
    ).toThrow();
  });

  test("accepts release names and rejects a name combined with an ID", () => {
    const story = {
      name: "Page",
      slug: "page",
      content: { component: "page" },
      release: "Campaign",
    };
    const update = {
      story_slug: "page",
      component: "page",
      fields: { title: "New" },
      release: "Campaign",
    };
    const compiled = compileSupportedBlueprint(
      resolveBlueprint({
        version: 1,
        stories: { create: [story], update_blocks: [update] },
      }),
    );
    expect(compiled.stories[0]?.release).toBe("Campaign");
    expect(compiled.storyUpdates[0]?.release).toBe("Campaign");
    for (const stories of [
      { create: [{ ...story, release_id: 9 }] },
      { update_blocks: [{ ...update, release_id: 9 }] },
    ]) {
      expect(() => resolveBlueprint({ version: 1, stories })).toThrow();
      expect(() =>
        compileSupportedBlueprint({ version: 1, stories }),
      ).toThrow();
    }
  });

  test("the modular example and its fragments conform to the schema", async () => {
    const validate = new Ajv2020({ allErrors: true, strict: false }).compile(
      schema,
    );
    const files = [
      "examples/customer-demo/setup.yaml",
      "examples/customer-demo/alternatives/local-assets.yaml",
      ...Array.from(
        new Bun.Glob("*.yaml").scanSync({
          cwd: "examples/customer-demo/steps",
        }),
      ).map((file) => `examples/customer-demo/steps/${file}`),
    ];
    expect(files).toHaveLength(13);
    for (const path of files)
      expect(validate(await loadDocument(path, "Setup"))).toBe(true);
    const awaited = await loadBlueprint("examples/customer-demo/setup.yaml");
    expect(() =>
      compileSupportedBlueprint(resolveBlueprint(awaited)),
    ).not.toThrow();
    const compiled = compileSupportedBlueprint(resolveBlueprint(awaited));
    expect(compiled.aiSettings).toEqual({
      enabled: true,
      inheritOrgConfiguration: false,
    });
    expect(compiled.aiTranslationDisclaimerId).toBe(35);
    expect(compiled.workflowEdits).toContainEqual({
      workflow: "Default",
      perLanguageStages: true,
    });
    expect(compiled.aiTranslations).toContainEqual({
      storySlug: "home",
      languages: [{ lang: "it", code: "it" }],
      allLanguages: false,
      overwrite: false,
      review: { stage: "Reviewing", workflow: "Default" },
    });
    expect(compiled.releases).toEqual([
      { name: "Demo campaign", releaseInDays: 7 },
    ]);
    expect(compiled.stories).toContainEqual({
      name: "Release page",
      slug: "release-page",
      release: "Demo campaign",
      content: { component: "default-page", body: [] },
    });
    expect(compiled.storyUpdates).toContainEqual({
      story_slug: "home",
      component: "hero-section",
      release: "Demo campaign",
      fields: { eyebrow: "Release announcement" },
    });
    expect(compiled.pipelines).toEqual([{ name: "Go Live" }]);
    expect(
      compiled.apps.filter(
        (app) => "slug" in app && app.slug === "releases_only",
      ),
    ).toHaveLength(1);
    expect(compiled.apps.some((app) => "id" in app && app.id === "29942")).toBe(
      false,
    );
  });
});
