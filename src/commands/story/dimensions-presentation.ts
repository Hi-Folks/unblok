import type { CompareDimensionsReport } from "../../actions/stories/compare-dimensions.ts";
import { formatColumns } from "../../cli/columns.ts";

/** Present a compact summary followed by the full content differences. */
export function formatDimensionsComparison(
  report: CompareDimensionsReport,
  width?: number,
): string {
  const summary = formatColumns(
    ["FOLDER", "STORY", "STATUS", "CHANGES"],
    report.folders.map((item) => [
      item.folder,
      item.story?.fullSlug ?? "—",
      item.status === "missing" ? "not linked" : "compared",
      item.changes === undefined ? "—" : String(item.changes.length),
    ]),
    width,
    { wrapColumn: 1 },
  );
  const details = report.folders.flatMap((item) => {
    if (!item.changes?.length) return [];
    return [
      `${item.folder} — ${item.story?.fullSlug ?? "—"}`,
      ...item.changes.map((change) =>
        [
          `  ${change.type} ${change.path || "/"}`,
          ...(Object.hasOwn(change, "before")
            ? [`    source: ${JSON.stringify(change.before)}`]
            : []),
          ...(Object.hasOwn(change, "after")
            ? [`    variant: ${JSON.stringify(change.after)}`]
            : []),
        ].join("\n"),
      ),
    ].join("\n");
  });
  return [
    `Source: ${report.story.fullSlug}`,
    "",
    summary,
    ...(details.length ? ["", "Content differences", ...details] : []),
  ].join("\n");
}
