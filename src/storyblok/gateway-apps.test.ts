import { afterEach, describe, expect, test } from "bun:test";
import { createStoryblokGateway } from "./gateway.ts";

const originalFetch = globalThis.fetch;
afterEach(() => {
  globalThis.fetch = originalFetch;
});

describe("app provisioning gateway", () => {
  test("sends the observed space AI configuration", async () => {
    let request: Request | undefined;
    globalThis.fetch = (async (input: string | Request | URL, init?: RequestInit) => {
      request = input instanceof Request ? new Request(input, init) : new Request(String(input), init);
      return Response.json({ space: { id: 42 } });
    }) as typeof fetch;
    await createStoryblokGateway("test-token").updateSpaceSettings(42, { ai_text_generator_disabled: false, inherit_org_ai_configuration: false });
    expect(request?.method).toBe("PUT");
    expect(await request?.json()).toEqual({ space: { ai_text_generator_disabled: false, inherit_org_ai_configuration: false } });
  });
  test("sends the captured disclaimer payload to the space endpoint", async () => {
    let request: Request | undefined;
    globalThis.fetch = (async (input: string | Request | URL, init?: RequestInit) => {
      request = input instanceof Request ? new Request(input, init) : new Request(String(input), init);
      return Response.json({ space: { id: 42 } });
    }) as typeof fetch;
    await createStoryblokGateway("test-token").acceptSpaceDisclaimer(42, 35);
    expect(request?.method).toBe("PUT");
    expect(request?.url).toContain("/v1/spaces/42");
    expect(await request?.json()).toEqual({ space: { disclaimer_id: 35 } });
  });
  test("sends the app provision JSON payload to the space endpoint", async () => {
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
        app_provision: { app_id: 29942, name: "AI Translations", slug: "ai-translation" },
      });
    }) as typeof fetch;
    const result = await createStoryblokGateway("test-token").installApp(
      42,
      "29942",
    );
    expect(result.slug).toBe("ai-translation");
    expect(request?.url).toContain("/v1/spaces/42/app_provisions/");
    expect(request?.headers.get("content-type")).toContain("application/json");
    expect(await request?.json()).toEqual({ app_provision: { app_id: 29942 } });
  });
});
