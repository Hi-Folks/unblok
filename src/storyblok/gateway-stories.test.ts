import { afterEach, expect, test } from "bun:test";
import { createStoryblokGateway } from "./gateway.ts";

const originalFetch = globalThis.fetch;
afterEach(() => { globalThis.fetch = originalFetch; });

test("sends story creation and translated slug attributes to the Management API", async () => {
  const requests: Request[] = [];
  globalThis.fetch = (async (input: string | Request | URL, init?: RequestInit) => {
    const request = input instanceof Request ? new Request(input, init) : new Request(String(input), init);
    requests.push(request);
    return Response.json({ story: { id: 5 } });
  }) as typeof fetch;
  const gateway = createStoryblokGateway("test-token");
  await gateway.createStory(42, { name: "Auto", slug: "auto", content: { component: "page" } });
  await gateway.updateTranslatedSlugs(42, 5, [{ id: 11, slug: "chi-siamo", name: "Chi siamo" }]);
  expect(await requests[0]?.json()).toEqual({ story: { name: "Auto", slug: "auto", content: { component: "page" } } });
  expect(await requests[1]?.json()).toEqual({ story: { translated_slugs_attributes: [{ id: 11, slug: "chi-siamo", name: "Chi siamo" }] } });
  expect(requests[1]?.method).toBe("PUT");
});
