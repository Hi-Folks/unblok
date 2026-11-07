import { expect, test } from "bun:test";
import {
  finishBlueprintReport,
  formatBlueprintReport,
} from "./blueprint-report.ts";
import { styleText } from "node:util";

test("formats the same skipped reasons, failures, summary and recovery as the JSON report", () => {
  const report = finishBlueprintReport(
    42,
    [
      { operation: "install-app", key: "import", status: "installed" },
      { operation: "create-story", key: "home", status: "unchanged" },
      {
        operation: "upload-asset",
        key: "Images/hero.png",
        status: "failed",
        error: "HTTP 404",
      },
    ],
    [{ operation: "assign-tags", key: "home" }],
  );
  expect(report.summary).toEqual({
    completed: 1,
    skipped: 1,
    failed: 1,
    notRun: 1,
  });
  expect(report.operations[1]?.reason).toContain("content was preserved");
  const output = formatBlueprintReport(report);
  expect(output).toContain("HTTP 404");
  expect(output).toContain("1 completed · 1 skipped · 1 failed · 1 not run");
  expect(output).toContain("--space-id 42");
});

test("colors report statuses when styling is enabled without altering JSON data", () => {
  const report = finishBlueprintReport(
    42,
    [
      { operation: "install-app", key: "import", status: "installed" },
      { operation: "create-story", key: "home", status: "unchanged" },
      {
        operation: "upload-asset",
        key: "hero.png",
        status: "failed",
        error: "failed",
      },
    ],
    [{ operation: "assign-tags", key: "home" }],
  );
  const output = formatBlueprintReport(report, (color, text) =>
    styleText(color, text, { validateStream: false }),
  );
  expect(output).toContain("\u001b[32m✓");
  expect(output).toContain("\u001b[33m–");
  expect(output).toContain("\u001b[31m✗");
  expect(output).toContain("\u001b[90m○");
  expect(JSON.stringify(report)).not.toContain("\u001b");
});
