import { describe, expect, test } from "bun:test";
import { assignStoryTags, planStoryTags } from "./story-tags.ts";

describe("story tag assignment", () => {
  test("preserves fresh tags, deduplicates inputs, and skips matching stories", async () => {
    const writes: unknown[] = [];
    const gateway = {
      findStoryBySlug: async (_space: number, slug: string) =>
        ({
          id: slug === "home" ? 1 : 2,
          full_slug: slug,
          tag_list: ["Existing"],
          is_folder: false,
        }) as never,
      getStory: async (_space: number, id: number) =>
        ({
          id,
          full_slug: id === 1 ? "home" : "contact",
          tag_list:
            id === 1
              ? ["Existing", "Added elsewhere"]
              : ["Existing", "Marketing"],
          is_folder: false,
        }) as never,
      updateStoryTags: async (_space: number, id: number, tags: string[]) => {
        writes.push({ id, tags });
      },
    };
    const report = await assignStoryTags(
      gateway,
      42,
      ["home", "home", "contact"],
      ["Marketing", "Marketing"],
    );
    expect(writes).toEqual([
      { id: 1, tags: ["Existing", "Added elsewhere", "Marketing"] },
    ]);
    expect(report.summary).toEqual({ updated: 1, unchanged: 1, failed: 0 });
  });

  test("rejects missing slugs before any updates", async () => {
    let writes = 0;
    const gateway = {
      findStoryBySlug: async (_space: number, slug: string) =>
        slug === "home"
          ? ({ id: 1, full_slug: slug, tag_list: [] } as never)
          : undefined,
      getStory: async () => ({}) as never,
      updateStoryTags: async () => {
        writes++;
      },
    };
    await expect(
      assignStoryTags(gateway, 42, ["home", "missing"], ["News"]),
    ).rejects.toThrow("Stories not found: missing");
    expect(writes).toBe(0);
    expect(
      (await planStoryTags(gateway, 42, ["home"], ["News"])).operations[0]
        ?.status,
    ).toBe("change");
  });

  test("continues after an update fails", async () => {
    const gateway = {
      findStoryBySlug: async (_space: number, slug: string) =>
        ({
          id: slug === "one" ? 1 : 2,
          full_slug: slug,
          tag_list: [],
        }) as never,
      getStory: async (_space: number, id: number) =>
        ({
          id,
          full_slug: id === 1 ? "one" : "two",
          is_folder: false,
          tag_list: [],
        }) as never,
      updateStoryTags: async (_space: number, id: number) => {
        if (id === 1) throw new Error("Forbidden");
      },
    };
    const report = await assignStoryTags(gateway, 42, ["one", "two"], ["News"]);
    expect(report.summary).toEqual({ updated: 1, unchanged: 0, failed: 1 });
    expect(report.operations[0]?.error).toBe("Forbidden");
  });
});
