import { expect, test } from "bun:test";
import { formatReleaseReport, parseReleaseVersion } from "./prepare.ts";

test("reports completed steps and version-specific next commands", () => {
  const report = formatReleaseReport(
    [{ name: "Create tag", status: "done" }],
    "0.1.4",
    true,
  );
  expect(report).toContain("Create tag: complete");
  expect(report).toContain("git show v0.1.4");
  expect(report).toContain("git push origin v0.1.4");
  expect(report).toContain("Nothing has been pushed");
});

test("reports failed and unstarted steps without suggesting a push", () => {
  const report = formatReleaseReport(
    [
      { name: "Commit", status: "running" },
      { name: "Tag", status: "pending" },
    ],
    "0.1.4",
  );
  expect(report).toContain("Commit: interrupted or failed");
  expect(report).toContain("Tag: not run");
  expect(report).not.toContain("git push origin");
  expect(report).toContain("not rolled back");
});

test("requires one higher stable semantic version", () => {
  expect(parseReleaseVersion(["0.1.4"], "0.1.3")).toBe("0.1.4");
  expect(parseReleaseVersion(["1.0.0"], "0.9.99")).toBe("1.0.0");
  for (const args of [
    [],
    ["v0.1.4"],
    ["0.1.3"],
    ["0.1.2"],
    ["0.1.4-beta.1"],
    ["0.1.4", "0.1.5"],
    ["--help"],
  ]) {
    expect(() => parseReleaseVersion(args, "0.1.3")).toThrow();
  }
});
