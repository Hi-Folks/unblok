import { test } from "node:test";
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { resolve } from "node:path";
import { assignStoryTags, UnblokError } from "../dist/package/src/library.js";

const cli = resolve("dist/package/index.js");

test("Node runs the built CLI and plans a YAML blueprint", () => {
  assert.match(
    execFileSync(process.execPath, [cli, "--help"], { encoding: "utf8" }),
    /Usage: unblok/,
  );
  const output = execFileSync(
    process.execPath,
    [
      cli,
      "space",
      "setup",
      "plan",
      "--config",
      resolve("src/setup/fixtures/input-blueprint.yaml"),
      "--json",
    ],
    { encoding: "utf8" },
  );
  assert.equal(JSON.parse(output).apiVersion, "unblok/setup-blueprint-plan-v1");
});

test("Node runs library actions and exposes structured validation errors", async () => {
  let saved;
  const gateway = {
    findStoryBySlug: async () => ({
      id: 1,
      full_slug: "home",
      tag_list: ["Existing"],
    }),
    getStory: async () => ({
      id: 1,
      full_slug: "home",
      tag_list: ["Existing"],
    }),
    updateStoryTags: async (_spaceId, _storyId, tags) => {
      saved = tags;
    },
  };
  const report = await assignStoryTags(gateway, {
    spaceId: 1,
    stories: ["home"],
    tags: ["News"],
  });
  assert.deepEqual(saved, ["Existing", "News"]);
  assert.equal(report.summary.updated, 1);
  await assert.rejects(
    assignStoryTags(gateway, { spaceId: 1, stories: [], tags: ["News"] }),
    (error) => error instanceof UnblokError && error.code === "INVALID_INPUT",
  );
});
