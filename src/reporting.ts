import type { Output } from "./output.ts";

type StatusStyle = NonNullable<Output["style"]>;
const plain: StatusStyle = (_color, text) => text;

/** Render a status independently of the command's structured result. */
export function formatStatus(
  status: string,
  label: string,
  detail?: string,
  style: StatusStyle = plain,
): string {
  const failed = status === "failed" || status === "error";
  const notRun = status === "not_run";
  const skipped =
    status === "unchanged" || status === "skipped" || status === "unsupported";
  const warning = status === "warning" || status === "warn";
  const symbol = failed
    ? "✗"
    : notRun
      ? "○"
      : skipped
        ? "–"
        : warning
          ? "!"
          : "✓";
  const color = failed
    ? "red"
    : notRun
      ? "gray"
      : skipped || warning
        ? "yellow"
        : "green";
  return `${style(color, `${symbol} ${status.padEnd(10)}`)} ${label}${detail ? ` — ${detail}` : ""}`;
}
