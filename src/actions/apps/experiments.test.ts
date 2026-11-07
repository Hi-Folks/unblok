import { expect, test } from "bun:test";
import {
  enableExperiments,
  EXPERIMENTS_APP_ID,
  type ExperimentsAppOperation,
} from "./experiments.ts";

test("accepts the disclaimer before installing Experiments and skips an existing installation", async () => {
  const calls: string[] = [];
  let installed = false;
  const gateway = {
    listInstalledApps: async () =>
      installed
        ? [
            {
              app_id: EXPERIMENTS_APP_ID,
              name: "Experiments",
              slug: "experiments",
            },
          ]
        : [],
    getSpace: async () => ({ id: 42, disclaimer_ids: [] }) as never,
    acceptSpaceDisclaimer: async (_space: number, id: number) => {
      calls.push(`disclaimer:${id}`);
    },
    installApp: async (_space: number, id: string) => {
      calls.push(`app:${id}`);
      installed = true;
      return { app_id: id, name: "Experiments", slug: "experiments" };
    },
  };
  const first: ExperimentsAppOperation[] = [];
  await enableExperiments(gateway, 42, 173657768407244, first);
  expect(calls).toEqual(["disclaimer:173657768407244", "app:173657247642152"]);
  expect(first.map((item) => item.status)).toEqual(["accepted", "installed"]);
  const second: ExperimentsAppOperation[] = [];
  await enableExperiments(gateway, 42, 173657768407244, second);
  expect(calls).toHaveLength(2);
  expect(second[0]?.status).toBe("unchanged");
});

test("stops on disclaimer failure and reports partial installation failure", async () => {
  let installs = 0;
  const gateway = {
    listInstalledApps: async () => [],
    getSpace: async () => ({ id: 42, disclaimer_ids: [] }) as never,
    acceptSpaceDisclaimer: async () => {
      throw new Error("Disclaimer failed");
    },
    installApp: async () => {
      installs++;
      throw new Error("Install failed");
    },
  };
  await expect(enableExperiments(gateway, 42, 123)).rejects.toThrow(
    "Disclaimer failed",
  );
  expect(installs).toBe(0);
  const operations: ExperimentsAppOperation[] = [];
  await expect(
    enableExperiments(
      { ...gateway, acceptSpaceDisclaimer: async () => {} },
      42,
      123,
      operations,
    ),
  ).rejects.toThrow("Install failed");
  expect(operations.map((item) => item.status)).toEqual(["accepted", "failed"]);
});

test("skips a confirmed accepted disclaimer and rejects invalid IDs before API calls", async () => {
  let accepts = 0;
  let requests = 0;
  const gateway = {
    listInstalledApps: async () => {
      requests++;
      return [];
    },
    getSpace: async () => ({ id: 42, disclaimer_ids: [123] }) as never,
    acceptSpaceDisclaimer: async () => {
      accepts++;
    },
    installApp: async (_space: number, id: string) => ({
      app_id: id,
      name: "Experiments",
      slug: "experiments",
    }),
  };
  await expect(enableExperiments(gateway, 42, 0)).rejects.toThrow(
    "positive disclaimer",
  );
  expect(requests).toBe(0);
  const operations: ExperimentsAppOperation[] = [];
  await enableExperiments(gateway, 42, 123, operations);
  expect(accepts).toBe(0);
  expect(operations.map((item) => item.status)).toEqual([
    "unchanged",
    "installed",
  ]);
});
