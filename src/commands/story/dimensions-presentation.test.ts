import { expect, test } from "bun:test";
import { formatDimensionsComparison } from "./dimensions-presentation.ts";
import type { CompareDimensionsReport } from "../../actions/stories/compare-dimensions.ts";

const report: CompareDimensionsReport = {
  apiVersion: "unblok/story-dimensions-comparison-v1",
  story: { id: 1, fullSlug: "global/home" },
  folders: [
    {
      folder: "italy",
      status: "compared",
      story: { id: 2, fullSlug: "italy/home" },
      changes: [],
    },
    {
      folder: "germany",
      status: "compared",
      story: { id: 3, fullSlug: "germany/home" },
      changes: [
        { path: "/title", type: "changed", before: "Hello", after: "Hallo" },
        { path: "/new", type: "added", after: null },
      ],
    },
    { folder: "uk", status: "missing" },
  ],
};

test("renders a labeled comparison and details only for changed variants", () => {
  const output = formatDimensionsComparison(report);
  expect(output).toContain("Source: global/home");
  expect(output).toContain("FOLDER   STORY         STATUS      CHANGES");
  expect(output).toContain("italy    italy/home    compared    0");
  expect(output).toContain("uk       —             not linked  —");
  expect(output).toContain('source: "Hello"');
  expect(output).toContain('variant: "Hallo"');
  expect(output).toContain("variant: null");
  expect(output).not.toContain("undefined");
});

test("keeps the comparison summary readable at narrow widths", () => {
  const output = formatDimensionsComparison(
    { ...report, folders: [report.folders[0]!] },
    24,
  );
  expect(output).toContain("FOLDER: italy");
  expect(output).toContain("STORY: italy/home");
  expect(output.split("\n").every((line) => Bun.stringWidth(line) <= 24)).toBe(
    true,
  );
});
