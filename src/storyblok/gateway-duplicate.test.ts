import { afterEach, describe, expect, test } from "bun:test";
import { createStoryblokGateway } from "./gateway.ts";

const originalFetch = globalThis.fetch;
afterEach(() => {
  globalThis.fetch = originalFetch;
});

describe("duplicate space request", () => {
  test("sends duplication and organization options in the JSON body", async () => {
    let request: Request | undefined;
    globalThis.fetch = (async (
      input: string | Request | URL,
      init?: RequestInit,
    ) => {
      request =
        input instanceof Request
          ? new Request(input, init)
          : new Request(String(input), init);
      return Response.json({ space: { id: 987, name: "Demo" } });
    }) as typeof fetch;
    const result = await createStoryblokGateway("test-token").duplicateSpace({
      sourceSpaceId: 42,
      name: "Demo",
      inOrg: true,
      spaceType: "sandbox",
      assignPartner: true,
    });
    expect(result.id).toBe(987);
    expect(new URL(request!.url).search).toBe("");
    expect(request?.headers.get("content-type")).toContain("application/json");
    expect(await request?.json()).toEqual({
      dup_id: 42,
      in_org: true,
      assign_partner: true,
      space_type: "sandbox",
      space: { name: "Demo" },
    });
  });
});
