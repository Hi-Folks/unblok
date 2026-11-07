import { describe, expect, test } from "bun:test";
import { enableAiTranslation } from "./ai-translation.ts";

describe("enable AI Translations", () => {
  test("accepts the disclaimer before installing and skips both on repeat", async () => {
    let accepted = false;
    let installed = false;
    const calls: string[] = [];
    const gateway = {
      getSpace: async () =>
        ({ id: 42, disclaimer_ids: accepted ? [35] : [] }) as never,
      acceptSpaceDisclaimer: async (_id: number, disclaimer: number) => {
        calls.push(`disclaimer:${disclaimer}`);
        accepted = true;
      },
      listInstalledApps: async () =>
        installed
          ? [{ app_id: 29942, name: "AI", slug: "ai-translation" }]
          : [],
      installApp: async (_id: number, appId: string) => {
        calls.push(`app:${appId}`);
        installed = true;
        return { app_id: 29942, name: "AI", slug: "ai-translation" };
      },
    };
    const first: Array<{ operation: string; key: string; status: string }> = [];
    await enableAiTranslation(gateway, 42, 35, first);
    expect(calls).toEqual(["disclaimer:35", "app:29942"]);
    expect(first.map((item) => item.status)).toEqual(["accepted", "installed"]);
    const second: typeof first = [];
    await enableAiTranslation(gateway, 42, 35, second);
    expect(calls).toHaveLength(2);
    expect(second.map((item) => item.status)).toEqual([
      "unchanged",
      "unchanged",
    ]);
  });

  test("does not install the app if disclaimer acceptance fails", async () => {
    let installs = 0;
    const gateway = {
      getSpace: async () => ({ id: 42 }) as never,
      acceptSpaceDisclaimer: async () => {
        throw new Error("Forbidden");
      },
      listInstalledApps: async () => [],
      installApp: async () => {
        installs++;
        throw new Error("unexpected");
      },
    };
    await expect(enableAiTranslation(gateway, 42, 35)).rejects.toThrow(
      "Forbidden",
    );
    expect(installs).toBe(0);
  });

  test("keeps the acceptance result if the app installation fails", async () => {
    const gateway = {
      getSpace: async () => ({ id: 42, disclaimer_ids: [] }) as never,
      acceptSpaceDisclaimer: async () => {},
      listInstalledApps: async () => [],
      installApp: async () => {
        throw new Error("App unavailable");
      },
    };
    const operations: Array<{
      operation: string;
      key: string;
      status: string;
    }> = [];
    await expect(
      enableAiTranslation(gateway, 42, 35, operations),
    ).rejects.toThrow("App unavailable");
    expect(operations).toEqual([
      {
        operation: "accept-ai-translation-disclaimer",
        key: "35",
        status: "accepted",
      },
      { operation: "install-ai-translations", key: "29942", status: "failed" },
    ]);
  });
});
