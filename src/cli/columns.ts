/** Render aligned columns, wrapping the selected column when space is limited. */
export function formatColumns(
  headers: string[],
  rows: string[][],
  terminalWidth?: number,
  options?: { wrapColumn: number },
): string {
  const clean = (value: string) => value.replace(/[\r\n\t]+/g, " ");
  const headings = headers.map(clean);
  const values = rows.map((row) =>
    headings.map((_, index) => clean(row[index] ?? "")),
  );
  const widths = headings.map((header, index) =>
    Math.max(
      Bun.stringWidth(header),
      ...values.map((row) => Bun.stringWidth(row[index] ?? "")),
    ),
  );
  const separators = Math.max(0, headings.length - 1) * 2;
  const total = widths.reduce((sum, width) => sum + width, 0) + separators;
  const width =
    terminalWidth !== undefined &&
    Number.isFinite(terminalWidth) &&
    terminalWidth > 0
      ? Math.floor(terminalWidth)
      : undefined;
  const wrapIndex = options?.wrapColumn;
  if (
    width !== undefined &&
    total > width &&
    wrapIndex !== undefined &&
    wrapIndex >= 0 &&
    wrapIndex < headings.length
  ) {
    const otherWidth = widths.reduce(
      (sum, value, index) => sum + (index === wrapIndex ? 0 : value),
      separators,
    );
    const available = width - otherWidth;
    if (available >= Bun.stringWidth(headings[wrapIndex] ?? ""))
      widths[wrapIndex] = available;
  }
  const line = (row: string[]) =>
    row
      .map(
        (value, index) =>
          value +
          " ".repeat(
            Math.max(0, (widths[index] ?? 0) - Bun.stringWidth(value)),
          ),
      )
      .join("  ")
      .trimEnd();
  if (
    width !== undefined &&
    widths.reduce((sum, value) => sum + value, separators) > width
  ) {
    const safeWidth = Math.max(4, width);
    return values
      .map((row) =>
        headings
          .map((header, index) =>
            Bun.wrapAnsi(`${header}: ${row[index] ?? ""}`, safeWidth, {
              hard: true,
              trim: false,
            }),
          )
          .join("\n"),
      )
      .join("\n\n");
  }
  const renderedRows = values.flatMap((row) => {
    if (
      wrapIndex === undefined ||
      Bun.stringWidth(row[wrapIndex] ?? "") <= (widths[wrapIndex] ?? 0)
    )
      return [line(row)];
    return Bun.wrapAnsi(row[wrapIndex] ?? "", widths[wrapIndex] ?? 1, {
      hard: true,
      trim: false,
    })
      .split("\n")
      .map((part, index) =>
        line(
          row.map((value, column) =>
            column === wrapIndex ? part : index === 0 ? value : "",
          ),
        ),
      );
  });
  return [
    line(headings),
    line(widths.map((value) => "─".repeat(value))),
    ...renderedRows,
  ].join("\n");
}
