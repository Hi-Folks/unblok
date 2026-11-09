import { afterEach, expect, test, setSystemTime } from "bun:test";
import {
  compileSupportedBlueprint,
  applySupportedBlueprint,
} from "./blueprint-apply.ts";
import { compileReleases } from "./blueprint-releases.ts";
import { loadBlueprint } from "./blueprint-loader.ts";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

afterEach(() => setSystemTime());

test("appends release operations from included blueprints", async () => {
  const dir = await mkdtemp(join(tmpdir(), "unblok-releases-"));
  try {
    await writeFile(
      join(dir, "base.yaml"),
      "version: 1\nreleases:\n  create:\n    - name: Base\n      release_in_days: 7\n",
    );
    await writeFile(
      join(dir, "main.yaml"),
      "version: 1\nextends: base.yaml\nreleases:\n  create:\n    - name: Extra\n",
    );
    const blueprint = compileSupportedBlueprint(
      await loadBlueprint(join(dir, "main.yaml")),
    );
    expect(blueprint.releases.map((item) => item.name)).toEqual([
      "Base",
      "Extra",
    ]);
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});

test("creates a relative schedule once and preserves it on later runs", async () => {
  setSystemTime(new Date("2027-01-01T12:34:45Z"));
  const blueprint = compileSupportedBlueprint({
    version: 1,
    releases: { create: [{ name: "Campaign", release_in_days: 7 }] },
  });
  const releases: Array<{
    id: number;
    name: string;
    release_at: string | null;
  }> = [];
  let writes = 0;
  const gateway = {
    listInstalledApps: async () => [
      { app_id: 1, name: "Releases", slug: "releases_only" },
    ],
    listReleases: async () => releases,
    createRelease: async (_space: number, name: string, releaseAt?: string) => {
      writes++;
      const release = { id: 1, name, release_at: releaseAt ?? null };
      releases.push(release);
      return release;
    },
  };
  const first = await applySupportedBlueprint(gateway as never, 42, blueprint);
  expect(first.operations).toMatchObject([
    { operation: "create-release", key: "Campaign", status: "created" },
  ]);
  expect(releases[0]?.release_at).toBe("2027-01-08 12:34");
  setSystemTime(new Date("2027-01-04T12:34:45Z"));
  const second = await applySupportedBlueprint(gateway as never, 42, blueprint);
  expect(second.operations).toMatchObject([
    { operation: "create-release", key: "Campaign", status: "unchanged" },
  ]);
  expect(writes).toBe(1);
  expect(releases[0]?.release_at).toBe("2027-01-08 12:34");
});

test("validates schedules and reports remaining releases after a failure", async () => {
  for (const item of [
    { name: "x", release_in_days: 0 },
    { name: "x", release_in_days: 1.5 },
    { name: "x", release_in_days: 7, release_at: "2027-01-01 12:00" },
    { name: "x", release_at: "2027-02-30 12:00" },
  ])
    expect(() => compileReleases({ create: [item] })).toThrow();
  const blueprint = compileSupportedBlueprint({
    version: 1,
    releases: { create: [{ name: "One" }, { name: "Two" }] },
  });
  const report = await applySupportedBlueprint(
    { listInstalledApps: async () => [] } as never,
    42,
    blueprint,
  );
  expect(report.operations).toMatchObject([
    { operation: "create-release", key: "One", status: "failed" },
    { operation: "create-release", key: "Two", status: "not_run" },
  ]);
});
