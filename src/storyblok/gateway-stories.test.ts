import { afterEach, expect, test } from "bun:test";
import { createStoryblokGateway } from "./gateway.ts";

const originalFetch = globalThis.fetch;
afterEach(() => {
  globalThis.fetch = originalFetch;
});

test("follows version pages when Storyblok returns fewer records than requested", async () => {
  const pages: number[] = [];
  globalThis.fetch = (async (input: string | Request | URL) => {
    const url = new URL(input instanceof Request ? input.url : String(input));
    const page = Number(url.searchParams.get("page"));
    pages.push(page);
    return Response.json(
      {
        story_versions:
          page === 1
            ? [
                { id: 1, story_id: 7 },
                { id: 2, story_id: 7 },
              ]
            : [{ id: 3, story_id: 7 }],
      },
      { headers: { total: "3", "per-page": "2" } },
    );
  }) as typeof fetch;
  const versions = await createStoryblokGateway("test-token").listStoryVersions(
    42,
    7,
  );
  expect(versions.map((version) => version.id)).toEqual([1, 2, 3]);
  expect(pages).toEqual([1, 2]);
});

test("retrieves version pages with optional content and excludes author contact details", async () => {
  const urls: URL[] = [];
  globalThis.fetch = (async (input: string | Request | URL) => {
    const url = new URL(input instanceof Request ? input.url : String(input));
    urls.push(url);
    const page = Number(url.searchParams.get("page"));
    return Response.json({
      story_versions:
        page === 1
          ? Array.from({ length: 100 }, (_, i) => ({
              id: i + 1,
              story_id: 7,
              content: { title: `Version ${i}` },
              user: {
                id: 2,
                friendly_name: "Editor",
                alt_email: "private@example.test",
              },
            }))
          : [{ id: 101, story_id: 7, content: { title: "Final" } }],
    });
  }) as typeof fetch;
  const result = await createStoryblokGateway("test-token").listStoryVersions(
    42,
    7,
    { includeContent: true },
  );
  expect(result).toHaveLength(101);
  expect(result[0]).toMatchObject({
    id: 1,
    storyId: 7,
    author: { id: 2, name: "Editor" },
    content: { title: "Version 0" },
  });
  expect(JSON.stringify(result)).not.toContain("private@example.test");
  expect(urls[0]?.pathname).toBe("/v1/spaces/42/story_versions");
  expect(urls[0]?.searchParams.get("by_story_id")).toBe("7");
  expect(urls[0]?.searchParams.get("show_content")).toBe("true");
  expect(urls[0]?.searchParams.get("per_page")).toBe("100");
  expect(urls[1]?.searchParams.get("page")).toBe("2");
});

test("limits version metadata without requesting content and rejects mismatched story versions", async () => {
  let url: URL | undefined;
  globalThis.fetch = (async (input: string | Request | URL) => {
    url = new URL(input instanceof Request ? input.url : String(input));
    return Response.json({
      story_versions: [{ id: 1, story_id: 7, content: { secret: "hidden" } }],
    });
  }) as typeof fetch;
  const gateway = createStoryblokGateway("test-token");
  expect(await gateway.listStoryVersions(42, 7, { limit: 1 })).toEqual([
    { id: 1, storyId: 7 },
  ]);
  expect(url?.searchParams.get("per_page")).toBe("1");
  expect(url?.searchParams.has("show_content")).toBe(false);
  await expect(gateway.listStoryVersions(42, 8, { limit: 1 })).rejects.toThrow(
    "story identity",
  );
});

test("rejects duplicate versions across pages rather than returning an incomplete history", async () => {
  globalThis.fetch = (async (input: string | Request | URL) => {
    const url = new URL(input instanceof Request ? input.url : String(input));
    return Response.json({
      story_versions:
        Number(url.searchParams.get("page")) === 1
          ? Array.from({ length: 100 }, (_, i) => ({ id: i + 1, story_id: 7 }))
          : [{ id: 1, story_id: 7 }],
    });
  }) as typeof fetch;
  await expect(
    createStoryblokGateway("test-token").listStoryVersions(42, 7),
  ).rejects.toThrow("duplicate story version");
});

test("lists all pages of stories with the requested Management API filters", async () => {
  const urls: URL[] = [];
  globalThis.fetch = (async (input: string | Request | URL) => {
    const url = new URL(input instanceof Request ? input.url : String(input));
    urls.push(url);
    const page = Number(url.searchParams.get("page"));
    return Response.json({
      stories:
        page === 1
          ? Array.from({ length: 1000 }, (_, i) => ({ id: i + 1 }))
          : [{ id: 1001 }],
    });
  }) as typeof fetch;
  const stories = await createStoryblokGateway("test-token").listStories(42, {
    search: "news",
    textSearch: "hello",
    startsWith: "articles/",
    component: "hero",
    tag: "campaign",
    published: false,
    storyOnly: true,
    fieldFilters: [
      { field: "category", operator: "in", value: "news,events" },
      { field: "seo.title", operator: "like", value: "*launch*" },
      { field: "date", operator: "gt_date", value: "2026-11-12 10:30" },
    ],
  });
  expect(stories).toHaveLength(1001);
  expect(urls).toHaveLength(2);
  expect(urls[0]?.pathname).toBe("/v1/spaces/42/stories");
  for (const [key, value] of Object.entries({
    search: "news",
    text_search: "hello",
    starts_with: "articles/",
    contain_component: "hero",
    with_tag: "campaign",
    is_published: "false",
    story_only: "true",
    per_page: "1000",
    "filter_query[category][in]": "news,events",
    "filter_query[seo.title][like]": "*launch*",
    "filter_query[date][gt_date]": "2026-11-12 10:30",
  }))
    expect(urls[0]?.searchParams.get(key)).toBe(value);
  expect(urls[1]?.searchParams.get("page")).toBe("2");
  expect(urls[1]?.searchParams.get("filter_query[category][in]")).toBe(
    "news,events",
  );
});

test("fails instead of reporting an empty list when the API omits stories", async () => {
  globalThis.fetch = (async () => Response.json({})) as unknown as typeof fetch;
  await expect(
    createStoryblokGateway("test-token").listStories(42),
  ).rejects.toThrow("did not return a stories list");
});

test("moves a story using the parent folder ID", async () => {
  let body: unknown,
    path = "";
  globalThis.fetch = (async (
    input: string | Request | URL,
    init?: RequestInit,
  ) => {
    const request =
      input instanceof Request
        ? new Request(input, init)
        : new Request(String(input), init);
    path = new URL(request.url).pathname;
    body = await request.json();
    expect(request.method).toBe("PUT");
    return Response.json({
      story: { id: 7, parent_id: 10, full_slug: "global/home" },
    });
  }) as typeof fetch;
  expect(
    await createStoryblokGateway("test-token").moveStory(42, 7, 10),
  ).toMatchObject({ parent_id: 10 });
  expect(path).toBe("/v1/spaces/42/stories/7");
  expect(body).toEqual({ story: { parent_id: 10 } });
  await createStoryblokGateway("test-token").moveStory(42, 7, 10, true);
  expect(body).toEqual({ story: { parent_id: 10, is_folder: true } });
});

test("sends the AI translation request through the space gateway", async () => {
  let request: Request | undefined;
  globalThis.fetch = (async (
    input: string | Request | URL,
    init?: RequestInit,
  ) => {
    request =
      input instanceof Request
        ? new Request(input, init)
        : new Request(String(input), init);
    return Response.json({
      story: { id: 7, content: { component: "default-page" } },
    });
  }) as typeof fetch;
  await createStoryblokGateway("test-token").aiTranslateStory(42, 7, {
    lang: "en",
    code: "en-us",
    overwrite: false,
  });
  expect(request?.method).toBe("PUT");
  expect(new URL(request!.url).pathname).toBe(
    "/v1/spaces/42/stories/7/ai_translate",
  );
  expect(await request!.json()).toEqual({
    lang: "en",
    code: "en-us",
    overwrite: false,
  });
});

test("reports only safe response shape when AI translation omits the documented story", async () => {
  globalThis.fetch = (async () =>
    Response.json({
      error: "sensitive content",
      unexpected_secret: "private",
    })) as unknown as typeof fetch;
  await expect(
    createStoryblokGateway("test-token").aiTranslateStory(42, 7, {
      lang: "de",
      code: "de",
      overwrite: false,
    }),
  ).rejects.toThrow(
    "Storyblok did not return a story or a background task ID.",
  );
});

test("returns the background task ID without polling", async () => {
  const paths: string[] = [];
  globalThis.fetch = (async (
    input: string | Request | URL,
    init?: RequestInit,
  ) => {
    const request =
      input instanceof Request
        ? new Request(input, init)
        : new Request(String(input), init);
    paths.push(new URL(request.url).pathname);
    return paths.length === 1
      ? Response.json({ background_task_id: 123 })
      : Response.json({
          background_task: { status: "running", result: "private" },
        });
  }) as typeof fetch;
  await expect(
    createStoryblokGateway("test-token").aiTranslateStory(42, 7, {
      lang: "de",
      code: "de",
      overwrite: false,
    }),
  ).resolves.toEqual({ backgroundTaskId: 123 });
  expect(paths).toEqual(["/v1/spaces/42/stories/7/ai_translate"]);
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

test("sends language-based workflow update and language stage assignment", async () => {
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
    return Response.json(
      request.method === "PUT"
        ? { workflow: { id: 5 } }
        : { workflow_stage_change: { id: 10, workflow_stage_id: 8 } },
    );
  }) as typeof fetch;
  const gateway = createStoryblokGateway("test-token");
  await gateway.updateWorkflow(42, 5, { per_language_stages: true });
  await gateway.assignWorkflowStage(42, {
    storyId: 7,
    stageId: 8,
    language: "es",
  });
  expect(new URL(requests[0]!.url).pathname).toBe("/v1/spaces/42/workflows/5");
  expect(await requests[0]!.json()).toEqual({
    workflow: { per_language_stages: true },
  });
  expect(await requests[1]!.json()).toEqual({
    workflow_stage_change: {
      story_id: 7,
      workflow_stage_id: 8,
      language: "es",
    },
  });
});
