import { afterEach, expect, test } from "bun:test";
import { createStoryblokGateway } from "./gateway.ts";

const originalFetch = globalThis.fetch;
afterEach(() => {
  globalThis.fetch = originalFetch;
});
test("sends experiment, mapping, results and draft story payloads", async () => {
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
    return Response.json({ story: { id: 5 }, experiment: { id: 9 } });
  }) as typeof fetch;
  const gateway = createStoryblokGateway("test-token");
  await gateway.createExperiment(42, { name: "hero" });
  await gateway.linkExperimentStory(42, 9, 5);
  await gateway.createExperimentMapping(42, 9, 3, 5);
  await gateway.pushExperimentResults(42, 9, [{ kind: "text", body: "Demo" }]);
  await gateway.updateStoryContent(42, 5, { component: "page" });
  await gateway.publishStory(42, 5);
  await gateway.activateExperiment(42, 9);
  expect(new URL(requests[0]!.url).pathname).toBe("/v1/spaces/42/experiments");
  expect(await requests[0]!.json()).toEqual({ experiment: { name: "hero" } });
  expect(new URL(requests[1]!.url).pathname).toBe(
    "/v1/spaces/42/experiments/9/stories",
  );
  expect(await requests[1]!.json()).toEqual({
    experiment_story: { story_id: 5 },
  });
  expect(new URL(requests[2]!.url).pathname).toBe(
    "/v1/spaces/42/experiments/9/variants/3/story_mappings",
  );
  expect(await requests[2]!.json()).toEqual({
    story_mapping: { original_story_id: 5 },
  });
  expect(await requests[3]!.json()).toEqual({
    charts: [{ kind: "text", body: "Demo" }],
  });
  expect(await requests[4]!.json()).toEqual({
    story: { content: { component: "page" } },
    publish: false,
  });
  expect(new URL(requests[5]!.url).pathname).toBe(
    "/v1/spaces/42/stories/5/publish",
  );
  expect(requests[5]!.method).toBe("GET");
  expect(new URL(requests[6]!.url).pathname).toBe(
    "/v1/spaces/42/experiments/9/activate",
  );
  expect(requests[6]!.method).toBe("PUT");
});
