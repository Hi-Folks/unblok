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
