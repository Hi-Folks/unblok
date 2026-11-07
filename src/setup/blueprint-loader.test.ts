import { describe, expect, test } from "bun:test";
import { mkdtemp, mkdir, rm, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { loadBlueprint } from "./blueprint-loader.ts";
import { resolveBlueprint } from "./blueprint-validation.ts";

describe("blueprint extends", () => {
  test("merges ordered fragments, resolves inputs, and rebases asset directories", async () => {
    const dir = await mkdtemp(join(tmpdir(), "unblok-extends-"));
    try {
      await mkdir(join(dir, "parts"));
      await writeFile(join(dir, "parts", "base.yaml"), 'version: 1\ninputs:\n  space_name:\n    default: Default\nspace:\n  name: "${{ inputs.space_name }}"\n  languages: [it]\napps:\n  install: [import]\nassets:\n  upload_directory:\n    - source: ./images\n      target_folder: Images\n');
      await writeFile(join(dir, "parts", "other.yaml"), 'extends: base.yaml\napps:\n  install: [export]\nspace:\n  languages: [fr]\n');
      await writeFile(join(dir, "main.yaml"), 'version: 1\nextends: [parts/base.yaml, parts/other.yaml]\napps:\n  install: [backups]\n');
      const result = resolveBlueprint(await loadBlueprint(join(dir, "main.yaml")), { space_name: "My Demo" });
      expect(result.space).toEqual({ name: "My Demo", languages: ["fr"] });
      expect(result.apps).toEqual({ install: ["import", "export", "backups"] });
      expect(result.assets).toEqual({ upload_directory: [{ source: "parts/images", target_folder: "Images" }] });
      expect(result.extends).toBeUndefined();
    } finally { await rm(dir, { recursive: true, force: true }); }
  });

  test("rejects cycles, missing files, invalid versions and dynamic include paths", async () => {
    const dir = await mkdtemp(join(tmpdir(), "unblok-extends-"));
    try {
      await writeFile(join(dir, "a.yaml"), "version: 1\nextends: b.yaml\n");
      await writeFile(join(dir, "b.yaml"), "version: 1\nextends: a.yaml\n");
      await expect(loadBlueprint(join(dir, "a.yaml"))).rejects.toThrow("Circular blueprint extends");
      await writeFile(join(dir, "b.yaml"), "version: 2\n");
      await expect(loadBlueprint(join(dir, "a.yaml"))).rejects.toThrow("version must be 1");
      await writeFile(join(dir, "b.yaml"), 'version: 1\nextends: "${{ inputs.path }}"\n');
      await expect(loadBlueprint(join(dir, "a.yaml"))).rejects.toThrow("extends must be a path");
      await writeFile(join(dir, "b.yaml"), "version: 1\nextends: missing.yaml\n");
      await expect(loadBlueprint(join(dir, "a.yaml"))).rejects.toThrow("not found");
    } finally { await rm(dir, { recursive: true, force: true }); }
  });
});
