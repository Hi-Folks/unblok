import { expect, test } from "bun:test";
import { syncBlockFields, type SyncBlockGateway } from "./sync-block-fields.ts";

function fixture() {
  const source = {
    id: 1,
    full_slug: "global/home",
    content: {
      component: "page",
      _uid: "page-1",
      body: [
        {
          component: "hero-section",
          _uid: "hero-1",
          image: { id: 10, filename: "new.png" },
          text: "English",
        },
      ],
    },
  };
  const target = {
    id: 2,
    full_slug: "germany/home",
    content: {
      component: "page",
      _uid: "page-2",
      body: [
        {
          component: "hero-section",
          _uid: "hero-2",
          image: { id: 20, filename: "old.png" },
          text: "Deutsch",
        },
      ],
    },
  };
  let writes = 0,
    changed = false;
  const gateway: SyncBlockGateway = {
    findStoryBySlug: async (_space, slug) =>
      ({ id: slug === source.full_slug ? 1 : 2 }) as never,
    getStory: async (_space, id) => {
      const story = structuredClone(id === 1 ? source : target);
      if (changed && id === 2) story.content.body[0]!.text = "Concurrent edit";
      return story as never;
    },
    listComponents: async () =>
      [
        {
          name: "hero-section",
          schema: { image: { type: "asset" }, text: { type: "text" } },
        },
      ] as never,
    updateStoryContent: async (_space, _id, content) => {
      writes++;
      target.content = content as typeof target.content;
      return structuredClone(target) as never;
    },
  };
  return {
    gateway,
    target,
    writes: () => writes,
    change: () => {
      changed = true;
    },
  };
}
const input = {
  spaceId: 42,
  source: "global/home",
  target: "germany/home",
  component: "hero-section",
  fields: ["image"],
};

test("plans and applies selected fields while preserving the target block and other content", async () => {
  const f = fixture();
  const plan = await syncBlockFields(f.gateway, input);
  expect(plan).toMatchObject({
    status: "planned",
    changes: [{ field: "image", before: { id: 20 }, after: { id: 10 } }],
  });
  expect(f.writes()).toBe(0);
  const result = await syncBlockFields(f.gateway, { ...input, apply: true });
  expect(result.status).toBe("updated");
  expect(f.target.content.body[0]).toMatchObject({
    _uid: "hero-2",
    text: "Deutsch",
    image: { id: 10 },
  });
  expect(
    (await syncBlockFields(f.gateway, { ...input, apply: true })).status,
  ).toBe("unchanged");
  expect(f.writes()).toBe(1);
});

test("rejects missing and ambiguous blocks and invalid fields before writes", async () => {
  const f = fixture();
  await expect(
    syncBlockFields(f.gateway, { ...input, fields: ["missing"] }),
  ).rejects.toMatchObject({ code: "NOT_FOUND" });
  await expect(
    syncBlockFields(f.gateway, { ...input, fields: ["_uid"] }),
  ).rejects.toMatchObject({ code: "INVALID_INPUT" });
  await expect(
    syncBlockFields(f.gateway, { ...input, targetUid: "wrong" }),
  ).rejects.toMatchObject({ code: "NOT_FOUND" });
  f.target.content.body.push({
    component: "hero-section",
    _uid: "hero-3",
    image: { id: 30, filename: "x" },
    text: "Other",
  });
  await expect(syncBlockFields(f.gateway, input)).rejects.toMatchObject({
    code: "AMBIGUOUS",
  });
  expect(
    (await syncBlockFields(f.gateway, { ...input, targetUid: "hero-2" }))
      .status,
  ).toBe("planned");
  expect(f.writes()).toBe(0);
});

test("stops without writing when the target changes between reads", async () => {
  const f = fixture();
  let reads = 0;
  const getStory = f.gateway.getStory;
  f.gateway.getStory = async (space, id) => {
    if (id === 2 && ++reads === 2) f.change();
    return getStory(space, id);
  };
  await expect(
    syncBlockFields(f.gateway, { ...input, apply: true }),
  ).rejects.toMatchObject({ code: "CONFLICT" });
  expect(f.writes()).toBe(0);
});
