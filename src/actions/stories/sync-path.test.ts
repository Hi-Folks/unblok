import { expect, test } from "bun:test";
import { syncStoryPath, type SyncPathGateway } from "./sync-path.ts";

function setup() {
  const source = {
    id: 1,
    full_slug: "global/home",
    content: {
      component: "page",
      _uid: "sp",
      body: [
        {
          component: "hero",
          _uid: "sh",
          headline: [
            {
              component: "headline",
              _uid: "source-headline",
              text: "Hello",
              nested: [{ component: "child", _uid: "child", text: "nested" }],
            },
          ],
        },
      ],
    },
  };
  const target = {
    id: 2,
    full_slug: "italy/home",
    content: {
      component: "page",
      _uid: "tp",
      body: [
        {
          component: "hero",
          _uid: "th",
          headline: [
            {
              component: "headline",
              _uid: "target-headline",
              text: "Ciao",
              nested: [],
            },
          ],
        },
      ],
    },
  };
  let writes = 0;
  const gateway: SyncPathGateway = {
    findStoryBySlug: async (_space, slug) =>
      ({ id: slug === source.full_slug ? 1 : 2 }) as never,
    getStory: async (_space, id) =>
      structuredClone(id === 1 ? source : target) as never,
    updateStoryContent: async (_space, _id, content) => {
      writes++;
      target.content = structuredClone(content) as typeof target.content;
      return structuredClone(target) as never;
    },
  };
  return { gateway, source, target, writes: () => writes };
}
const input = {
  spaceId: 42,
  source: "global/home",
  target: "italy/home",
  path: "/body/0/headline/0",
};

test("previews and replaces a block by position including nested UIDs; repeat is unchanged", async () => {
  const f = setup();
  const plan = await syncStoryPath(f.gateway, input);
  expect(plan).toMatchObject({
    status: "planned",
    before: { _uid: "target-headline", text: "Ciao" },
    after: {
      _uid: "source-headline",
      text: "Hello",
      nested: [{ _uid: "child" }],
    },
  });
  expect(f.writes()).toBe(0);
  expect(
    (await syncStoryPath(f.gateway, { ...input, apply: true })).status,
  ).toBe("updated");
  expect(JSON.stringify(f.target.content.body[0]!.headline[0])).toBe(
    JSON.stringify(f.source.content.body[0]!.headline[0]),
  );
  expect(
    (await syncStoryPath(f.gateway, { ...input, apply: true })).status,
  ).toBe("unchanged");
  expect(f.writes()).toBe(1);
});

test("copies a field and a blocks field without copying unrelated fields", async () => {
  const f = setup();
  expect(
    (
      await syncStoryPath(f.gateway, {
        ...input,
        path: `${input.path}/text`,
        apply: true,
      })
    ).status,
  ).toBe("updated");
  expect(f.target.content.body[0]!.headline[0]).toMatchObject({
    _uid: "target-headline",
    text: "Hello",
  });
  expect(
    (
      await syncStoryPath(f.gateway, {
        ...input,
        path: "/body/0/headline",
        apply: true,
      })
    ).status,
  ).toBe("updated");
  expect(f.target.content.body[0]!.headline[0]?._uid).toBe("source-headline");
});

test("rejects missing paths, reserved segments and duplicate UIDs before writing", async () => {
  const f = setup();
  await expect(
    syncStoryPath(f.gateway, {
      ...input,
      path: "/body/1/headline/0",
      apply: true,
    }),
  ).rejects.toMatchObject({ code: "NOT_FOUND" });
  await expect(
    syncStoryPath(f.gateway, { ...input, path: "/body/0/_uid", apply: true }),
  ).rejects.toMatchObject({ code: "INVALID_INPUT" });
  f.target.content.body[0]!._uid = "source-headline";
  await expect(
    syncStoryPath(f.gateway, { ...input, apply: true }),
  ).rejects.toMatchObject({ code: "CONFLICT" });
  expect(f.writes()).toBe(0);
});

test("stops if source changes before the write", async () => {
  const f = setup();
  const read = f.gateway.getStory;
  let count = 0;
  f.gateway.getStory = async (space, id) => {
    count++;
    const story = await read(space, id);
    if (count === 3)
      return {
        ...story,
        content: { ...story.content, changed: true },
      } as never;
    return story;
  };
  await expect(
    syncStoryPath(f.gateway, { ...input, apply: true }),
  ).rejects.toMatchObject({ code: "CONFLICT" });
  expect(f.writes()).toBe(0);
});

test("decodes JSON Pointer escapes and rejects malformed escapes", async () => {
  const f = setup();
  const read = f.gateway.getStory;
  f.gateway.getStory = async (space, id) => {
    const story = await read(space, id);
    const content = story.content as Record<string, unknown>;
    content["name/with~symbols"] = id === 1 ? "source" : "target";
    return story;
  };
  expect(
    await syncStoryPath(f.gateway, { ...input, path: "/name~1with~0symbols" }),
  ).toMatchObject({ status: "planned", before: "target", after: "source" });
  await expect(
    syncStoryPath(f.gateway, { ...input, path: "/name~2bad" }),
  ).rejects.toMatchObject({ code: "INVALID_INPUT" });
});

test("reports an unconfirmed write when the response omits the selected path", async () => {
  const f = setup();
  f.gateway.updateStoryContent = async () =>
    ({
      id: 2,
      full_slug: "italy/home",
      content: { component: "page", _uid: "tp" },
    }) as never;
  await expect(
    syncStoryPath(f.gateway, { ...input, apply: true }),
  ).rejects.toMatchObject({
    code: "CONFLICT",
    message: expect.stringContaining("inspect the target"),
  });
});
