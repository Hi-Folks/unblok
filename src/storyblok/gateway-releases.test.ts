import { afterEach, expect, test } from "bun:test";
import { createStoryblokGateway } from "./gateway.ts";

const originalFetch = globalThis.fetch;
afterEach(() => {
  globalThis.fetch = originalFetch;
});

test("retrieves an individual release through the regional API", async () => {
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
      release: { id: 8, name: "Campaign", release_at: "2027-01-01 10:00" },
    });
  }) as typeof fetch;
  const gateway = createStoryblokGateway("test-token", { region: "us" });
  expect(await gateway.getRelease(42, 8)).toMatchObject({
    id: 8,
    name: "Campaign",
  });
  expect(new URL(request!.url).pathname).toBe("/v1/spaces/42/releases/8");
  expect(new URL(request!.url).hostname).toContain("us");
  await expect(gateway.getRelease(42, 9)).rejects.toMatchObject({
    code: "CONFLICT",
  });
});

test("lists and creates releases with regional Management API requests", async () => {
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
      ? Response.json({ releases: [{ id: 1, name: "Launch" }] })
      : Response.json({ release: { id: 2, name: "Campaign" } });
  }) as typeof fetch;
  const gateway = createStoryblokGateway("test-token", { region: "us" });
  expect(await gateway.listReleases(42)).toEqual([{ id: 1, name: "Launch" }]);
  expect(
    await gateway.createRelease(42, "Campaign", "2027-02-20 15:30"),
  ).toEqual({
    id: 2,
    name: "Campaign",
  });
  expect(new URL(requests[0]!.url).hostname).toContain("us");
  expect(new URL(requests[0]!.url).pathname).toBe("/v1/spaces/42/releases/");
  expect(await requests[1]!.json()).toEqual({
    release: { name: "Campaign", release_at: "2027-02-20 15:30" },
  });
});

test("collects subsequent pages and rejects repeated pages", async () => {
  const first = Array.from({ length: 100 }, (_, index) => ({
    id: index + 1,
    name: `Release ${index + 1}`,
  }));
  let repeat = false;
  globalThis.fetch = (async (
    input: string | Request | URL,
    init?: RequestInit,
  ) => {
    const request =
      input instanceof Request
        ? new Request(input, init)
        : new Request(String(input), init);
    const page = new URL(request.url).searchParams.get("page");
    return Response.json({
      releases: page === "1" || repeat ? first : [{ id: 101, name: "Last" }],
    });
  }) as typeof fetch;
  const gateway = createStoryblokGateway("test-token");
  expect((await gateway.listReleases(42)).at(-1)).toEqual({
    id: 101,
    name: "Last",
  });
  repeat = true;
  await expect(gateway.listReleases(42)).rejects.toThrow("repeated release");
});

test("sends the documented release publication request", async () => {
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
      release: { id: 5, name: "Campaign", released: true },
    });
  }) as typeof fetch;
  const result = await createStoryblokGateway("test-token", {
    region: "us",
  }).publishRelease(42, 5, "Campaign");
  expect(result).toMatchObject({ id: 5, released: true });
  expect(request?.method).toBe("PUT");
  expect(new URL(request!.url).pathname).toBe("/v1/spaces/42/releases/5");
  expect(new URL(request!.url).hostname).toContain("us");
  expect(await request!.json()).toEqual({
    do_release: true,
    release: { name: "Campaign" },
  });
});
