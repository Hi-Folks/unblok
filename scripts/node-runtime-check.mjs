import { test } from "node:test";
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { resolve } from "node:path";
import {
  assignStoryTags,
  compareStoryDimensions,
  syncBlockFields,
  updateMatchingBlocks,
  UnblokError,
} from "../dist/package/src/library.js";

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

test("Node compares variants and selectively updates block fields", async () => {
  const stories = [
    {
      id: 1,
      full_slug: "global/home",
      content: {
        component: "page",
        _uid: "p1",
        body: [
          { component: "hero", _uid: "h1", eyebrow: "Welcome", text: "Global" },
        ],
      },
      alternates: [{ id: 2, full_slug: "italy/home" }],
    },
    {
      id: 2,
      full_slug: "italy/home",
      content: {
        component: "page",
        _uid: "p2",
        body: [
          { component: "hero", _uid: "h2", eyebrow: "Welcome", text: "Locale" },
        ],
      },
    },
  ];
  let writes = 0;
  const gateway = {
    findStoryBySlug: async (_space, slug) =>
      stories.find((story) => story.full_slug === slug),
    findStoryFolderBySlug: async () => ({ id: 9 }),
    getStory: async (_space, id) =>
      structuredClone(stories.find((story) => story.id === id)),
    listComponents: async () => [
      {
        name: "hero",
        schema: { eyebrow: { type: "text" }, text: { type: "text" } },
      },
    ],
    updateStoryContent: async (_space, id, content) => {
      writes++;
      const story = stories.find((item) => item.id === id);
      story.content = content;
      return structuredClone(story);
    },
  };
  const comparison = await compareStoryDimensions(gateway, {
    spaceId: 42,
    story: "global/home",
    folders: ["italy"],
  });
  assert.equal(comparison.folders[0].status, "compared");
  assert.ok(
    comparison.folders[0].changes.some(
      (change) => change.path === "/body/0/text",
    ),
  );
  const selection = {
    spaceId: 42,
    source: "global/home",
    target: "italy/home",
    component: "hero",
    fields: ["text"],
  };
  assert.equal((await syncBlockFields(gateway, selection)).status, "planned");
  assert.equal(writes, 0);
  assert.equal(
    (await syncBlockFields(gateway, { ...selection, apply: true })).status,
    "updated",
  );
  assert.equal(stories[1].content.body[0].text, "Global");
  const matching = {
    spaceId: 42,
    story: "italy/home",
    component: "hero",
    where: { field: "eyebrow", equals: "Welcome" },
    fields: { text: "Hello" },
  };
  assert.equal(
    (await updateMatchingBlocks(gateway, { ...matching, apply: true })).status,
    "updated",
  );
  assert.equal(stories[1].content.body[0].text, "Hello");
  assert.equal(writes, 2);
});
