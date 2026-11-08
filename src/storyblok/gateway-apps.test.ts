import { afterEach, describe, expect, test } from "bun:test";
import { createStoryblokGateway } from "./gateway.ts";
import { installAppBySlug } from "../actions/apps/apps.ts";

const originalFetch = globalThis.fetch;
afterEach(() => {
  globalThis.fetch = originalFetch;
});

describe("app provisioning gateway", () => {
  test("resolves and installs the regional app ID for the target space", async () => {
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
      const url = new URL(request.url);
      if (url.pathname === "/v1/apps")
        return Response.json({
          apps: [
            {
              id: url.hostname.startsWith("api-us") ? 11 : 22,
              slug: "import",
              name: "Import",
            },
          ],
        });
      if (request.method === "GET")
        return Response.json({ app_provisions: [] });
      return Response.json({
        app_provision: {
          app_id: url.hostname.startsWith("api-us") ? 11 : 22,
          slug: "import",
          name: "Import",
        },
      });
    }) as typeof fetch;
    const gateway = createStoryblokGateway("test-token");
    await installAppBySlug(gateway, 1_500_000, "import");
    await installAppBySlug(gateway, 2_500_000, "import");
    expect(requests.map((request) => new URL(request.url).hostname)).toEqual([
      "api-us.storyblok.com",
      "api-us.storyblok.com",
      "api-us.storyblok.com",
      "api-ca.storyblok.com",
      "api-ca.storyblok.com",
      "api-ca.storyblok.com",
    ]);
    expect(await requests[2]!.json()).toEqual({
      app_provision: { app_id: 11 },
    });
    expect(await requests[5]!.json()).toEqual({
      app_provision: { app_id: 22 },
    });
  });
  test("allows a region override when an ID is ambiguous", async () => {
    let request: Request | undefined;
    globalThis.fetch = (async (
      input: string | Request | URL,
      init?: RequestInit,
    ) => {
      request =
        input instanceof Request
          ? new Request(input, init)
          : new Request(String(input), init);
      return Response.json({ app_provisions: [] });
    }) as typeof fetch;
    await createStoryblokGateway("test-token", {
      region: "cn",
    }).listInstalledApps(42);
    expect(new URL(request!.url).hostname).toBe("app.storyblokchina.cn");
  });
  test("sends the observed space AI configuration", async () => {
    let request: Request | undefined;
    globalThis.fetch = (async (
      input: string | Request | URL,
      init?: RequestInit,
    ) => {
      request =
        input instanceof Request
          ? new Request(input, init)
          : new Request(String(input), init);
      return Response.json({ space: { id: 42 } });
    }) as typeof fetch;
    await createStoryblokGateway("test-token").updateSpaceSettings(42, {
      ai_text_generator_disabled: false,
      inherit_org_ai_configuration: false,
    });
    expect(request?.method).toBe("PUT");
    expect(await request?.json()).toEqual({
      space: {
        ai_text_generator_disabled: false,
        inherit_org_ai_configuration: false,
      },
    });
  });
  test("sends the captured disclaimer payload to the space endpoint", async () => {
    let request: Request | undefined;
    globalThis.fetch = (async (
      input: string | Request | URL,
      init?: RequestInit,
    ) => {
      request =
        input instanceof Request
          ? new Request(input, init)
          : new Request(String(input), init);
      return Response.json({ space: { id: 42 } });
    }) as typeof fetch;
    await createStoryblokGateway("test-token").acceptSpaceDisclaimer(42, 35);
    expect(request?.method).toBe("PUT");
    expect(request?.url).toContain("/v1/spaces/42");
    expect(await request?.json()).toEqual({ space: { disclaimer_id: 35 } });
  });
  test("sends the observed Experiments setup IDs as numbers", async () => {
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
      return Response.json({
        app_provision: {
          app_id: 173657247642152,
          name: "Experiments",
          slug: "experiments",
        },
      });
    }) as typeof fetch;
    const gateway = createStoryblokGateway("test-token");
    await gateway.acceptSpaceDisclaimer(42, 173657768407244);
    await gateway.installApp(42, "173657247642152");
    expect(await requests[0]?.json()).toEqual({
      space: { disclaimer_id: 173657768407244 },
    });
    expect(await requests[1]?.json()).toEqual({
      app_provision: { app_id: 173657247642152 },
    });
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
        app_provision: {
          app_id: 29942,
          name: "AI Translations",
          slug: "ai-translation",
        },
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
