import { describe, expect, test } from "bun:test";
import {
  getPreviewToken,
  removeDemoMode,
  setPreviewUrls,
} from "./configure-space.ts";

describe("space configuration", () => {
  test("retrieves a preview token and rejects a missing token", async () => {
    expect(
      await getPreviewToken(
        { getSpace: async () => ({ first_token: "secret" }) as never },
        42,
      ),
    ).toBe("secret");
    expect(
      getPreviewToken(
        { getSpace: async () => ({ first_token: "" }) as never },
        42,
      ),
    ).rejects.toThrow("No preview access token");
  });
  test("updates only the requested settings", async () => {
    const calls: unknown[] = [];
    const gateway = {
      updateSpaceSettings: async (id: number, settings: unknown) => {
        calls.push([id, settings]);
      },
    };
    await setPreviewUrls(gateway, 42, "https://example.com/?token=x&path=");
    await setPreviewUrls(gateway, 42, "https://example.com/", [
      { name: "Local", location: "http://localhost:3000/" },
    ]);
    expect(calls).toEqual([
      [42, { domain: "https://example.com/?token=x&path=" }],
      [
        42,
        {
          domain: "https://example.com/",
          environments: [{ name: "Local", location: "http://localhost:3000/" }],
        },
      ],
    ]);
  });
  test("skips updating when demo mode is already disabled", async () => {
    let calls = 0;
    const updated = await removeDemoMode(
      {
        getSpace: async () => ({ is_demo: false }) as never,
        updateSpaceSettings: async () => {
          calls++;
        },
      },
      42,
    );
    expect(updated).toBe(false);
    expect(calls).toBe(0);
  });
});
