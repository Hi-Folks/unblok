import { expect, test } from "bun:test";
import { ClientError } from "@storyblok/management-api-client";
import {
  createRelease,
  listReleases,
  type ReleaseGateway,
} from "./releases.ts";

test("lists and creates releases after checking either known app slug", async () => {
  let slug = "releases_only";
  const calls: string[] = [];
  const gateway: ReleaseGateway = {
    listInstalledApps: async () => {
      calls.push("apps");
      return [{ app_id: 1, name: "Releases", slug }];
    },
    listReleases: async () => {
      calls.push("list");
      return [{ id: 5, name: "Campaign" }];
    },
    createRelease: async (_id, name) => {
      calls.push("create");
      return { id: 6, name };
    },
  };
  expect(await listReleases(gateway, { spaceId: 42 })).toEqual([
    { id: 5, name: "Campaign" },
  ]);
  slug = "releases";
  expect(
    await createRelease(gateway, { spaceId: 42, name: " Launch " }),
  ).toEqual({ status: "created", release: { id: 6, name: "Launch" } });
  expect(calls).toEqual(["apps", "list", "apps", "list", "create"]);
});

test("skips an existing exact name and fails on ambiguous duplicates", async () => {
  let releases = [{ id: 5, name: "Campaign" }];
  let writes = 0;
  const gateway: ReleaseGateway = {
    listInstalledApps: async () => [
      { app_id: 1, name: "Releases", slug: "releases" },
    ],
    listReleases: async () => releases,
    createRelease: async (_id, name) => {
      writes++;
      return { id: 6, name };
    },
  };
  expect(
    await createRelease(gateway, { spaceId: 42, name: " Campaign " }),
  ).toEqual({ status: "unchanged", release: { id: 5, name: "Campaign" } });
  releases = [...releases, { id: 6, name: "Campaign" }];
  await expect(
    createRelease(gateway, { spaceId: 42, name: "Campaign" }),
  ).rejects.toMatchObject({ code: "AMBIGUOUS" });
  expect(writes).toBe(0);
});

test("rejects invalid input and missing app before release requests", async () => {
  let calls = 0;
  const gateway: ReleaseGateway = {
    listInstalledApps: async () => [],
    listReleases: async () => {
      calls++;
      return [];
    },
    createRelease: async () => {
      calls++;
      return { id: 1, name: "x" };
    },
  };
  await expect(
    createRelease(gateway, { spaceId: 1, name: " " }),
  ).rejects.toMatchObject({ code: "INVALID_INPUT" });
  await expect(listReleases(gateway, { spaceId: 1 })).rejects.toMatchObject({
    code: "NOT_FOUND",
  });
  await expect(
    createRelease(gateway, { spaceId: 1, name: "x" }),
  ).rejects.toMatchObject({ code: "NOT_FOUND" });
  expect(calls).toBe(0);
});

test("classifies API errors", async () => {
  const gateway: ReleaseGateway = {
    listInstalledApps: async () => [
      { app_id: 1, name: "Releases", slug: "releases" },
    ],
    listReleases: async () => [],
    createRelease: async () => {
      throw new ClientError("Forbidden", {
        status: 403,
        statusText: "Forbidden",
        data: {},
      });
    },
  };
  await expect(
    createRelease(gateway, { spaceId: 1, name: "x" }),
  ).rejects.toMatchObject({ code: "PERMISSION_DENIED", status: 403 });
});

test("passes a valid schedule, skips matching schedules, and refuses changes to existing releases", async () => {
  let releases: Array<{
    id: number;
    name: string;
    release_at?: string | null;
  }> = [];
  let received: string | undefined;
  const gateway: ReleaseGateway = {
    listInstalledApps: async () => [
      { app_id: 1, name: "Releases", slug: "releases" },
    ],
    listReleases: async () => releases,
    createRelease: async (_space, name, releaseAt) => {
      received = releaseAt;
      return { id: 1, name, release_at: releaseAt };
    },
  };
  const input = { spaceId: 42, name: "Launch", releaseAt: "2027-02-20 15:30" };
  expect((await createRelease(gateway, input)).status).toBe("created");
  expect(received).toBe(input.releaseAt);
  releases = [{ id: 1, name: "Launch", release_at: input.releaseAt }];
  expect((await createRelease(gateway, input)).status).toBe("unchanged");
  releases = [{ id: 1, name: "Launch", release_at: null }];
  await expect(createRelease(gateway, input)).rejects.toMatchObject({
    code: "CONFLICT",
  });
  await expect(
    createRelease(gateway, { ...input, releaseAt: "2027-02-30 15:30" }),
  ).rejects.toMatchObject({ code: "INVALID_INPUT" });
  await expect(
    createRelease(gateway, { ...input, releaseAt: "2027-02-20T15:30Z" }),
  ).rejects.toMatchObject({ code: "INVALID_INPUT" });
});

test("retrieves releases by ID or unique exact name and rejects ambiguous data", async () => {
  const { getRelease } = await import("./releases.ts");
  let releases = [{ id: 5, name: "Campaign" }];
  let listCalls = 0;
  const gateway = {
    listInstalledApps: async () => [
      { app_id: 1, name: "Releases", slug: "releases_only" },
    ],
    listReleases: async () => {
      listCalls++;
      return releases;
    },
    getRelease: async (_space: number, id: number) => ({
      id,
      name: "Campaign",
      release_at: "2027-01-01 10:00",
    }),
  };
  expect(
    await getRelease(gateway as never, { spaceId: 42, reference: "5" }),
  ).toMatchObject({ id: 5, name: "Campaign" });
  expect(listCalls).toBe(0);
  expect(
    await getRelease(gateway as never, { spaceId: 42, reference: "Campaign" }),
  ).toMatchObject({ id: 5 });
  expect(listCalls).toBe(1);
  releases = [];
  await expect(
    getRelease(gateway as never, { spaceId: 42, reference: "Campaign" }),
  ).rejects.toMatchObject({ code: "NOT_FOUND" });
  releases = [
    { id: 5, name: "Campaign" },
    { id: 6, name: "Campaign" },
  ];
  await expect(
    getRelease(gateway as never, { spaceId: 42, reference: "Campaign" }),
  ).rejects.toMatchObject({ code: "AMBIGUOUS" });
  await expect(
    getRelease(gateway as never, { spaceId: 42, reference: "0" }),
  ).rejects.toMatchObject({ code: "INVALID_INPUT" });
  await expect(
    getRelease(
      {
        ...gateway,
        getRelease: async () => {
          throw new ClientError("Forbidden", {
            status: 403,
            statusText: "Forbidden",
            data: {},
          });
        },
      } as never,
      { spaceId: 42, reference: "5" },
    ),
  ).rejects.toMatchObject({ code: "PERMISSION_DENIED" });
  releases = [{ id: 5, name: "Campaign" }];
  await expect(
    getRelease(
      {
        ...gateway,
        getRelease: async () => ({ id: 5, name: "Renamed" }),
      } as never,
      { spaceId: 42, reference: "Campaign" },
    ),
  ).rejects.toMatchObject({ code: "CONFLICT" });
});

test("publishes a verified release once and skips an already published release", async () => {
  const { publishRelease } = await import("./releases.ts");
  let released = false;
  let writes = 0;
  const gateway = {
    listInstalledApps: async () => [
      { app_id: 1, name: "Releases", slug: "releases_only" },
    ],
    listReleases: async () => [{ id: 5, name: "Campaign" }],
    getRelease: async () => ({ id: 5, name: "Campaign", released }),
    publishRelease: async () => {
      writes++;
      released = true;
      return { id: 5, name: "Campaign", released };
    },
  };
  expect(
    await publishRelease(gateway as never, {
      spaceId: 42,
      reference: "Campaign",
    }),
  ).toEqual({ status: "published", releaseId: 5 });
  expect(
    await publishRelease(gateway as never, { spaceId: 42, reference: "5" }),
  ).toEqual({ status: "unchanged", releaseId: 5 });
  expect(writes).toBe(1);
});

test("does not publish with unknown state and reports unconfirmed publication", async () => {
  const { publishRelease } = await import("./releases.ts");
  let writes = 0;
  const gateway = {
    listInstalledApps: async () => [
      { app_id: 1, name: "Releases", slug: "releases" },
    ],
    listReleases: async () => [],
    getRelease: async () => ({ id: 5, name: "Campaign" }),
    publishRelease: async () => {
      writes++;
      return { id: 5, name: "Campaign" };
    },
  };
  await expect(
    publishRelease(gateway as never, { spaceId: 42, reference: "5" }),
  ).rejects.toMatchObject({
    code: "CONFLICT",
    message: expect.stringContaining("publishing was stopped"),
  });
  expect(writes).toBe(0);
  const unknown = {
    ...gateway,
    getRelease: async () => ({ id: 5, name: "Campaign", released: false }),
  };
  await expect(
    publishRelease(unknown as never, { spaceId: 42, reference: "5" }),
  ).rejects.toMatchObject({
    code: "CONFLICT",
    message: expect.stringContaining("before retrying"),
  });
  expect(writes).toBe(1);
});

test("verifies publication through a follow-up read when the response omits status", async () => {
  const { publishRelease } = await import("./releases.ts");
  let reads = 0;
  const gateway = {
    listInstalledApps: async () => [
      { app_id: 1, name: "Releases", slug: "releases" },
    ],
    listReleases: async () => [],
    getRelease: async () => ({
      id: 5,
      name: "Campaign",
      released: ++reads > 1,
    }),
    publishRelease: async () => ({ id: 5, name: "Campaign" }),
  };
  expect(
    await publishRelease(gateway as never, { spaceId: 42, reference: "5" }),
  ).toEqual({ status: "published", releaseId: 5 });
});

test("reports an uncertain publication if the follow-up read fails", async () => {
  const { publishRelease } = await import("./releases.ts");
  let reads = 0;
  const gateway = {
    listInstalledApps: async () => [
      { app_id: 1, name: "Releases", slug: "releases" },
    ],
    listReleases: async () => [],
    getRelease: async () => {
      if (++reads > 1) throw new Error("network failure");
      return { id: 5, name: "Campaign", released: false };
    },
    publishRelease: async () => ({ id: 5, name: "Campaign" }),
  };
  await expect(
    publishRelease(gateway as never, { spaceId: 42, reference: "5" }),
  ).rejects.toMatchObject({
    code: "CONFLICT",
    message: expect.stringContaining("before retrying"),
  });
});
