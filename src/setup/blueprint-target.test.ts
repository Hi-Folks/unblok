import { describe, expect, test } from "bun:test";
import { compileBlueprintTarget, createBlueprintTarget, waitForBlueprintTarget } from "./blueprint-target.ts";

describe("blueprint target", () => {
  test("passes the resolved duplication settings and rejects an invalid returned ID", async () => {
    const target = compileBlueprintTarget({ space: { name: "Demo", duplicate_from: "42", in_org: true, demo: false } });
    let options: unknown;
    await expect(createBlueprintTarget({ duplicateSpace: async (input) => { options = input; return { id: 42 } as never; } }, target)).rejects.toThrow("invalid target ID");
    expect(options).toMatchObject({ sourceSpaceId: 42, name: "Demo", inOrg: true, demo: false });
  });

  test("waits until done and times out when status stays pending", async () => {
    let time = 0;
    let calls = 0;
    const clock = { now: () => time, sleep: async (ms: number) => { time += ms; } };
    const target = { timeoutMs: 2000, intervalMs: 1000 };
    const space = await waitForBlueprintTarget({ getSpace: async () => ({ id: 9, duplication_status: ++calls === 2 ? "done" : "pending" }) as never }, 9, target, clock);
    expect(space.id).toBe(9);
    expect(time).toBe(1000);
    time = 0;
    await expect(waitForBlueprintTarget({ getSpace: async () => ({ id: 9, duplication_status: "pending" }) as never }, 9, target, clock)).rejects.toThrow("Space 9 is not ready");
    expect(time).toBe(2000);
  });
});
