import { describe, expect, test } from "bun:test";
import { formatColumns } from "./columns.ts";

describe("list columns", () => {
  test("aligns long IDs and Unicode values without truncating them", () => {
    const result = formatColumns(
      ["ID", "NAME", "WORKFLOW"],
      [
        ["238858950572132", "翻訳", "238858950478697"],
        ["42", "Reviewing", "9"],
      ],
    );
    const lines = result.split("\n");
    expect(lines[0]?.indexOf("NAME")).toBe(lines[2]?.indexOf("翻訳"));
    expect(Bun.stringWidth(lines[2]?.split("238858950478697")[0] ?? "")).toBe(
      Bun.stringWidth(lines[3]?.split("9").at(-2) ?? ""),
    );
    expect(result).toContain("238858950572132");
    expect(result).toContain("238858950478697");
  });

  test("uses wrapped labeled records on narrow terminals", () => {
    const result = formatColumns(
      ["ID", "NAME"],
      [["238858950572132", "Reviewing"]],
      20,
    );
    expect(result).toContain("ID: 238858950572132");
    expect(result).toContain("NAME: Reviewing");
    expect(
      result.split("\n").every((line) => Bun.stringWidth(line) <= 20),
    ).toBe(true);
  });
});
