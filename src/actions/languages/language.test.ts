import { describe, expect, test } from "bun:test";
import { compareLanguage, ensureLanguage } from "./language.ts";

describe("language actions", () => {
  test("classifies create, update, and unchanged", () => {
    const current = [{ code: "it", name: "Italian", aiTranslationCode: "it" }];
    expect(compareLanguage({ code: "de", name: "German" }, current)).toBe(
      "create",
    );
    expect(compareLanguage({ code: "it", name: "Italiano" }, current)).toBe(
      "update",
    );
    expect(compareLanguage({ code: "it", name: "Italian" }, current)).toBe(
      "unchanged",
    );
  });

  test("preserves existing languages when creating one", async () => {
    const writes: unknown[] = [];
    const gateway = {
      listLanguages: async () => [{ code: "it", name: "Italian" }],
      updateLanguages: async (_spaceId: number, languages: unknown[]) => {
        writes.push(languages);
        return languages as never;
      },
    };

    const result = await ensureLanguage(gateway, 42, {
      code: "de",
      name: "German",
    });

    expect(result.status).toBe("create");
    expect(writes).toEqual([
      [
        { code: "it", name: "Italian" },
        { code: "de", name: "German" },
      ],
    ]);
  });

  test("does not write an unchanged language", async () => {
    let writes = 0;
    const gateway = {
      listLanguages: async () => [{ code: "it", name: "Italian" }],
      updateLanguages: async () => {
        writes += 1;
        return [];
      },
    };

    const result = await ensureLanguage(gateway, 42, {
      code: "it",
      name: "Italian",
    });

    expect(result.status).toBe("unchanged");
    expect(writes).toBe(0);
  });
});
