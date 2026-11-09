import { afterEach, expect, test } from "bun:test";
import { createStoryblokGateway } from "./gateway.ts";
const original = globalThis.fetch;
afterEach(() => {
  globalThis.fetch = original;
});
test("sends regional branch requests without exposing URLs in results", async () => {
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
          branches: [
            {
              id: 1,
              name: "Preview",
              url: "https://example.com/?token=secret",
            },
          ],
        })
      : Response.json({
          branch: {
            id: 2,
            name: "Go Live",
            source_id: 1,
            url: "https://example.com/?token=secret",
          },
        });
  }) as typeof fetch;
  const gateway = createStoryblokGateway("test-token", { region: "us" });
  expect(await gateway.listPipelineBranches(42)).toEqual([
    { id: 1, name: "Preview" },
  ]);
  expect(
    await gateway.createPipelineBranch(42, { name: "Go Live", source_id: 1 }),
  ).toEqual({ id: 2, name: "Go Live", source_id: 1 });
  expect(new URL(requests[0]!.url).hostname).toContain("us");
  expect(new URL(requests[0]!.url).pathname).toBe("/v1/spaces/42/branches/");
  expect(await requests[1]!.json()).toEqual({
    branch: { name: "Go Live", source_id: 1 },
  });
});
