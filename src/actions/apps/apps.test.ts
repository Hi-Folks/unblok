import { describe, expect, test } from "bun:test";
import { installAppBySlug } from "./apps.ts";

describe("installAppBySlug", () => {
  test("resolves a slug and installs its app ID", async () => {
    let received: string | undefined;
    const result = await installAppBySlug(
      {
        listInstalledApps: async () => [],
        listAvailableApps: async () => [
          { id: 12, slug: "import", name: "Import" },
        ],
        installApp: async (_spaceId, id) => {
          received = id;
          return { app_id: id, slug: "import", name: "Import" };
        },
      },
      42,
      "import",
    );
    expect(received).toBe("12");
    expect(result.status).toBe("installed");
  });

  test("skips installed apps and rejects missing slugs", async () => {
    let calls = 0;
    const gateway = {
      listInstalledApps: async () => [
        { app_id: 12, slug: "import", name: "Import" },
      ],
      listAvailableApps: async () => [],
      installApp: async () => {
        calls++;
        throw new Error("unexpected installation");
      },
    };
    expect((await installAppBySlug(gateway, 42, "import")).status).toBe(
      "unchanged",
    );
    expect(calls).toBe(0);
    await expect(installAppBySlug(gateway, 42, "missing")).rejects.toThrow(
      "No app found",
    );
  });
});
