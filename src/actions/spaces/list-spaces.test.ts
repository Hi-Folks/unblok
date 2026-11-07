import { describe, expect, test } from "bun:test";
import type { StoryblokGateway } from "../../storyblok/gateway.ts";
import {
  filterSpacesUpdatedBefore,
  inspectSoloSpaces,
  listSpaces,
} from "./list-spaces.ts";

describe("listSpaces", () => {
  test("applies cheap filters before collaborator inspection", async () => {
    const inspectedIds: number[] = [];
    const gateway = {
      getCurrentUserId: async () => 7,
      getSpace: async (spaceId: number) => {
        inspectedIds.push(spaceId);
        return { id: spaceId, collaborators: [] } as never;
      },
      listSpaces: async () =>
        [
          { id: 1, owner_id: 7, updated_at: "2020-01-01T00:00:00Z" },
          { id: 2, owner_id: 8, updated_at: "2020-01-01T00:00:00Z" },
        ] as never,
    } satisfies Pick<
      StoryblokGateway,
      "getCurrentUserId" | "getSpace" | "listSpaces"
    >;

    const result = await listSpaces(gateway, { soloOnly: true });

    expect(result.map((space) => space.id)).toEqual([1]);
    expect(inspectedIds).toEqual([1]);
  });
});

describe("filterSpacesUpdatedBefore", () => {
  test("keeps spaces older than the requested age", () => {
    const now = Date.parse("2026-04-10T00:00:00Z");
    const spaces = [
      { id: 1, updated_at: "2026-01-01T00:00:00Z" },
      { id: 2, updated_at: "2026-04-01T00:00:00Z" },
    ] as never;

    expect(
      filterSpacesUpdatedBefore(spaces, 30, now).map((space) => space.id),
    ).toEqual([1]);
  });
});

describe("inspectSoloSpaces", () => {
  test("yields inspections as detail requests complete", async () => {
    const spaces = [
      { id: 1, name: "One" },
      { id: 2, name: "Two" },
      { id: 3, name: "Three" },
    ] as never;
    const yielded: Array<{ id: number; isSolo: boolean }> = [];

    for await (const result of inspectSoloSpaces(
      spaces,
      async (spaceId) => {
        await Bun.sleep(spaceId === 1 ? 10 : 1);
        return {
          id: spaceId,
          collaborators: spaceId === 2 ? [] : [{}],
        } as never;
      },
      2,
    )) {
      yielded.push({ id: result.space.id, isSolo: result.isSolo });
    }

    expect(yielded).toEqual([
      { id: 2, isSolo: true },
      { id: 3, isSolo: false },
      { id: 1, isSolo: false },
    ]);
  });
});
