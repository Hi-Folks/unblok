import { afterEach, describe, expect, test } from "bun:test";
import { createStoryblokGateway } from "./gateway.ts";

const originalFetch = globalThis.fetch;
afterEach(() => {
  globalThis.fetch = originalFetch;
});

describe("Storyblok retries", () => {
  test("retries a workflow POST after an explicit 429 response", async () => {
    let attempts = 0;
    const bodies: unknown[] = [];
    globalThis.fetch = (async (
      input: string | Request | URL,
      init?: RequestInit,
    ) => {
      const request =
        input instanceof Request
          ? new Request(input, init)
          : new Request(String(input), init);
      bodies.push(await request.json());
      attempts++;
      if (attempts === 1)
        return Response.json(
          { error: "rate limited" },
          { status: 429, headers: { "Retry-After": "0" } },
        );
      return Response.json({
        workflow_stage_change: { id: 1, workflow_stage_id: 8 },
      });
    }) as typeof fetch;
    const result = await createStoryblokGateway("test-token", {
      requestsPerSecond: 100,
    }).assignWorkflowStage(42, { storyId: 5, stageId: 8 });
    expect(result.id).toBe(1);
    expect(attempts).toBe(2);
    expect(bodies).toEqual([
      { workflow_stage_change: { story_id: 5, workflow_stage_id: 8 } },
      { workflow_stage_change: { story_id: 5, workflow_stage_id: 8 } },
    ]);
  });

  test("does not retry a workflow POST after a server error or network failure", async () => {
    for (const failure of ["server", "network"]) {
      let attempts = 0;
      globalThis.fetch = (async () => {
        attempts++;
        if (failure === "network") throw new Error("connection lost");
        return Response.json({ error: "server error" }, { status: 500 });
      }) as unknown as typeof fetch;
      await expect(
        createStoryblokGateway("test-token", {
          requestsPerSecond: 100,
        }).assignWorkflowStage(42, { storyId: 5, stageId: 8 }),
      ).rejects.toThrow();
      expect(attempts).toBe(1);
    }
  });
});
