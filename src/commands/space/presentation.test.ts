import { describe, expect, test } from "bun:test";
import {
  formatDuplicatedSpace,
  formatSpaceDetails,
  formatSpaceList,
} from "./presentation.ts";

describe("space presentation", () => {
  test("formats a compact list table", () => {
    const output = formatSpaceList([
      {
        id: 42,
        name: "Demo",
        plan: "Team",
        is_demo: true,
        created_at: "2025-01-02T00:00:00Z",
        updated_at: "2026-03-04T00:00:00Z",
      },
    ] as never);

    expect(output).toContain("ID  NAME  PLAN  DEMO");
    expect(output).toContain("42  Demo  Team  yes");
    expect(output).toContain("2025-01-02  2026-03-04");
  });

  test("keeps a scannable space list on a narrow terminal", () => {
    const spaces = [
      {
        id: 72872,
        name: "Untitled space",
        plan: "Teams",
        is_demo: false,
        created_at: "2020-01-08",
        updated_at: "2026-07-21",
      },
      {
        id: 51376,
        name: "Storyblok.com 2019",
        plan: "Elite",
        is_demo: false,
        created_at: "2018-12-12",
        updated_at: "2026-11-06",
      },
    ];
    const output = formatSpaceList(spaces as never, 70);
    expect(output).toContain(
      "ID     NAME                PLAN   DEMO  CREATED     UPDATED",
    );
    expect(output).toContain(
      "72872  Untitled space      Teams  no    2020-01-08  2026-07-21",
    );
    expect(output).toContain(
      "51376  Storyblok.com 2019  Elite  no    2018-12-12  2026-11-06",
    );
    expect(
      output.split("\n").every((line) => Bun.stringWidth(line) <= 70),
    ).toBe(true);
  });

  test("wraps long names without dropping their content", () => {
    const name = "A-very-long-space-name-without-spaces";
    const output = formatSpaceList(
      [
        {
          id: 123456789012345,
          name,
          plan: "Team",
          is_demo: false,
          created_at: "2020-01-08",
          updated_at: "2026-07-21",
        },
      ] as never,
      64,
    );
    const rows = output.split("\n").slice(2);
    expect(rows.length).toBeGreaterThan(1);
    expect(rows.map((row) => row.slice(17, 28).trim()).join("")).toBe(name);
    expect(rows.every((row) => Bun.stringWidth(row) <= 64)).toBe(true);
  });

  test("formats selected space details", () => {
    const output = formatSpaceDetails({
      id: 42,
      name: "Demo",
      plan: "Team",
      role: "admin",
      stories_count: 12,
      assets_count: 3,
      created_at: "2026-01-01T00:00:00Z",
    } as never);

    expect(output).toContain("Stories  12");
    expect(output).toContain("Role     admin");
  });

  test("formats a duplicated space summary", () => {
    const output = formatDuplicatedSpace(
      {
        id: 99,
        name: "Copy",
        plan: "Team",
        duplication_status: "pending",
      } as never,
      42,
    );

    expect(output).toContain("Source ID  42");
    expect(output).toContain("Status     pending");
  });
});
