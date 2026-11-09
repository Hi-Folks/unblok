import { afterEach, expect, test } from "bun:test";
import { createStoryblokGateway } from "./gateway.ts";

const originalFetch = globalThis.fetch;
afterEach(() => {
  globalThis.fetch = originalFetch;
});

test("looks up the exact folder and sends the parent ID when creating a story", async () => {
  const requests: Request[] = [];
  globalThis.fetch = (async (
    input: string | Request | URL,
    init?: RequestInit,
  ) => {
    const request =
      input instanceof Request
        ? new Request(input, init)
        : new Request(String(input), init);
    requests.push(request);
    return request.method === "GET"
      ? Response.json({
          stories: [{ id: 19, is_folder: true, full_slug: "articles/news/" }],
        })
      : Response.json({ story: { id: 5 } });
  }) as typeof fetch;
  const gateway = createStoryblokGateway("test-token");
  expect(await gateway.findStoryFolderBySlug(42, "articles/news")).toEqual({
    id: 19,
  });
  await gateway.createStory(42, {
    name: "Welcome",
    slug: "welcome",
    parent_id: 19,
    content: { component: "page" },
  });
  const url = new URL(requests[0]!.url);
  expect(url.searchParams.get("with_slug")).toBe("articles/news");
  expect(url.searchParams.get("folder_only")).toBe("true");
  expect(await requests[1]!.json()).toEqual({
    story: {
      name: "Welcome",
      slug: "welcome",
      parent_id: 19,
      content: { component: "page" },
    },
  });
});

test("rejects ambiguous folder matches", async () => {
  globalThis.fetch = (async () =>
    Response.json({
      stories: [
        { id: 1, is_folder: true, full_slug: "articles/" },
        { id: 2, is_folder: true, full_slug: "articles/" },
      ],
    })) as unknown as typeof fetch;
  await expect(
    createStoryblokGateway("test-token").findStoryFolderBySlug(42, "articles"),
  ).rejects.toThrow("Multiple folders");
});

test("creates content folders with the documented story payload", async () => {
  let request: Request | undefined;
  globalThis.fetch = (async (
    input: string | Request | URL,
    init?: RequestInit,
  ) => {
    request =
      input instanceof Request
        ? new Request(input, init)
        : new Request(String(input), init);
    return Response.json({ story: { id: 19 } });
  }) as typeof fetch;
  const result = await createStoryblokGateway("test-token").createStoryFolder(
    42,
    { name: "news", slug: "news", parentId: 8 },
  );
  expect(result).toEqual({ id: 19 });
  expect(await request!.json()).toEqual({
    story: { name: "news", slug: "news", parent_id: 8, is_folder: true },
  });
});

test("passes release scope as a query parameter for story reads and writes", async () => {
  const requests: Request[] = [];
  globalThis.fetch = (async (
    input: string | Request | URL,
    init?: RequestInit,
  ) => {
    const request =
      input instanceof Request
        ? new Request(input, init)
        : new Request(String(input), init);
    requests.push(request);
    return Response.json({ story: { id: 5, content: { component: "page" } } });
  }) as typeof fetch;
  const gateway = createStoryblokGateway("test-token");
  await gateway.createStory(
    42,
    { name: "Page", slug: "page", content: { component: "page" } },
    9,
  );
  await gateway.getStory(42, 5, 9);
  await gateway.updateStoryContent(42, 5, { component: "page" }, 9);
  expect(
    requests.map((request) =>
      new URL(request.url).searchParams.get("release_id"),
    ),
  ).toEqual(["9", "9", "9"]);
  expect(await requests[0]!.json()).toEqual({
    story: { name: "Page", slug: "page", content: { component: "page" } },
  });
  expect(await requests[2]!.json()).toEqual({
    story: { content: { component: "page" } },
    publish: false,
  });
});

test("sends story creation and translated slug attributes to the Management API", async () => {
  const requests: Request[] = [];
  globalThis.fetch = (async (
    input: string | Request | URL,
    init?: RequestInit,
  ) => {
    const request =
      input instanceof Request
        ? new Request(input, init)
        : new Request(String(input), init);
    requests.push(request);
    return Response.json({ story: { id: 5 } });
  }) as typeof fetch;
  const gateway = createStoryblokGateway("test-token");
  await gateway.createStory(42, {
    name: "Auto",
    slug: "auto",
    content: { component: "page" },
  });
  await gateway.updateTranslatedSlugs(42, 5, [
    { id: 11, slug: "chi-siamo", name: "Chi siamo" },
  ]);
  expect(await requests[0]?.json()).toEqual({
    story: { name: "Auto", slug: "auto", content: { component: "page" } },
  });
  expect(await requests[1]?.json()).toEqual({
    story: {
      translated_slugs_attributes: [
        { id: 11, slug: "chi-siamo", name: "Chi siamo" },
      ],
    },
  });
  expect(requests[1]?.method).toBe("PUT");
});
