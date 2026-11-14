import { expect, test } from "bun:test";
import { formatDimensionsFolders } from "./presentation.ts";

test("labels and aligns Dimensions folders and their translation codes", () => {
  const output = formatDimensionsFolders([
    { path: "global", id: 240981270729461, aiTranslationCode: "en" },
    { path: "italy", id: 240981276041976, aiTranslationCode: "it" },
    { path: "uk", id: 240981271798518, aiTranslationCode: "" },
  ]);
  expect(output).toContain("FOLDER  ID               AI LANGUAGE");
  expect(output).toContain("global  240981270729461  en");
  expect(output).toContain("uk      240981271798518  —");
});

test("keeps all values visible in a narrow terminal", () => {
  const output = formatDimensionsFolders(
    [
      {
        path: "a-very-long-market-folder",
        id: 240981270729461,
        aiTranslationCode: "en",
      },
    ],
    20,
  );
  expect(output).toContain("240981270729461");
  expect(output).toContain("AI LANGUAGE:");
  expect(output.split("\n").every((line) => Bun.stringWidth(line) <= 20)).toBe(
    true,
  );
});
