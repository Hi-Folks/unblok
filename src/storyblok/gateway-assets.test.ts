import { afterEach, expect, test } from "bun:test";
import { createStoryblokGateway } from "./gateway.ts";

const originalFetch = globalThis.fetch;
afterEach(() => {
  globalThis.fetch = originalFetch;
});

test("uploads through the management client's signed upload flow", async () => {
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
    if (url.hostname === "s3.example.com")
      return new Response(null, { status: 204 });
    if (
      url.pathname.replace(/\/$/, "").endsWith("/assets") &&
      request.method === "POST"
    )
      return Response.json({
        id: 7,
        post_url: "https://s3.example.com/",
        fields: { key: "test", "Content-Type": "image/png" },
      });
    if (url.pathname.endsWith("/finish_upload"))
      return Response.json({ asset: { id: 7 } });
    if (url.pathname.endsWith("/assets/7"))
      return Response.json({
        asset: { id: 7, filename: "https://a.storyblok.com/test.png" },
      });
    return new Response("unexpected", { status: 500 });
  }) as typeof fetch;
  await createStoryblokGateway("test-token").uploadAsset(
    42,
    5,
    "test.png",
    new Uint8Array([1, 2]),
  );
  expect(requests).toHaveLength(4);
  expect(requests[0]?.url).toContain("filename=test.png");
  expect(requests[0]?.url).toContain("asset_folder_id=5");
  expect(requests[1]?.headers.get("authorization")).toBeNull();
  expect(requests[2]?.url).toContain("/finish_upload");
  requests.length = 0;
  await createStoryblokGateway("test-token").uploadAsset(
    42,
    undefined,
    "test.png",
    new Uint8Array([1, 2]),
  );
  expect(requests).toHaveLength(4);
  expect(new URL(requests[0]!.url).searchParams.has("asset_folder_id")).toBe(
    false,
  );
});
