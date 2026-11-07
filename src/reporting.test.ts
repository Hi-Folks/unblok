import { expect, test } from "bun:test";
import { formatStatus } from "./reporting.ts";

test("uses warning styling without treating a warning as success", () => {
  let color = "";
  const result = formatStatus(
    "warning",
    "App unavailable",
    "Continuing",
    (value, text) => {
      color = value;
      return text;
    },
  );
  expect(color).toBe("yellow");
  expect(result).toContain("warning");
  expect(result).toContain("App unavailable — Continuing");
});
