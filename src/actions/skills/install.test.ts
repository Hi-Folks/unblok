import { describe, expect, test } from "bun:test";
import {
  mkdtemp,
  mkdir,
  readFile,
  readdir,
  rm,
  symlink,
  writeFile,
} from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { installSkill } from "./install.ts";

describe("installSkill", () => {
  test("downloads every reference linked by the maintained skill", async () => {
    const dir = await mkdtemp(join(tmpdir(), "unblok-skill-"));
    try {
      const requests: string[] = [];
      const fetchMock = async (url: string) => {
        requests.push(url);
        return new Response("content");
      };
      await installSkill({
        agent: "codex",
        version: "0.4.1",
        directory: dir,
        fetch: fetchMock,
      });
      const source = await readFile("skills/unblok/SKILL.md", "utf8");
      const references = [...source.matchAll(/\]\((references\/[^)]+)\)/g)].map(
        (match) => match[1]!,
      );
      expect(references.length).toBeGreaterThan(0);
      for (const reference of references)
        expect(
          requests.some((url) => url.endsWith(`/skills/unblok/${reference}`)),
        ).toBe(true);
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  });

  test.each([
    ["codex", ".agents"],
    ["claude", ".claude"],
  ] as const)(
    "installs %s from the matching tag without credentials",
    async (agent, folder) => {
      const dir = await mkdtemp(join(tmpdir(), "unblok-skill-"));
      try {
        const urls: string[] = [];
        const fetchMock = async (url: string | URL | Request) => {
          urls.push(String(url));
          return new Response(`content for ${url}`);
        };
        const result = await installSkill({
          agent,
          version: "0.4.1",
          directory: dir,
          fetch: fetchMock,
        });
        expect(result).toEqual({
          status: "installed",
          agent,
          version: "0.4.1",
          path: join(folder, "skills", "unblok"),
        });
        expect(urls).toHaveLength(4);
        expect(
          urls.every((url) =>
            url.startsWith(
              "https://raw.githubusercontent.com/Hi-Folks/unblok/v0.4.1/skills/unblok/",
            ),
          ),
        ).toBe(true);
        expect(
          await readFile(join(dir, result.path, "SKILL.md"), "utf8"),
        ).toContain("SKILL.md");
        expect(
          (await readdir(join(dir, result.path, "references"))).sort(),
        ).toEqual(["blueprints.md", "operations.md", "recipes.md"]);
      } finally {
        await rm(dir, { recursive: true, force: true });
      }
    },
  );

  test("keeps an existing skill and avoids all downloads", async () => {
    const dir = await mkdtemp(join(tmpdir(), "unblok-skill-"));
    try {
      const destination = join(dir, ".agents/skills/unblok");
      await mkdir(destination, { recursive: true });
      await writeFile(join(destination, "SKILL.md"), "local changes");
      let requests = 0;
      const fetchMock = async () => {
        requests++;
        return new Response("download");
      };
      await expect(
        installSkill({
          agent: "codex",
          version: "0.4.1",
          directory: dir,
          fetch: fetchMock,
        }),
      ).rejects.toThrow("already exists");
      expect(requests).toBe(0);
      expect(await readFile(join(destination, "SKILL.md"), "utf8")).toBe(
        "local changes",
      );
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  });

  test("does not replace an existing symlink", async () => {
    const dir = await mkdtemp(join(tmpdir(), "unblok-skill-"));
    try {
      await mkdir(join(dir, ".claude/skills"), { recursive: true });
      await symlink(
        join(dir, "missing-target"),
        join(dir, ".claude/skills/unblok"),
      );
      await expect(
        installSkill({ agent: "claude", version: "0.4.1", directory: dir }),
      ).rejects.toThrow("already exists");
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  });

  test("leaves no skill directory if a file is missing or the network fails", async () => {
    const dir = await mkdtemp(join(tmpdir(), "unblok-skill-"));
    try {
      for (const fetchMock of [
        async () => new Response("missing", { status: 404 }),
        async () => {
          throw new Error("offline");
        },
      ]) {
        await expect(
          installSkill({
            agent: "codex",
            version: "0.4.1",
            directory: dir,
            fetch: fetchMock,
          }),
        ).rejects.toThrow();
        await expect(
          readdir(join(dir, ".agents/skills/unblok")),
        ).rejects.toThrow();
      }
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  });
});
