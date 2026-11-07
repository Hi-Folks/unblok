import { expect, test } from "bun:test";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { windowsBatchCommand } from "./windows-command";

test.skipIf(process.platform !== "win32")(
  "runs a batch launcher from a path containing spaces",
  async () => {
    const directory = await mkdtemp(join(tmpdir(), "unblok test "));
    try {
      const launcher = join(directory, "launcher.cmd");
      await Bun.write(launcher, "@echo off\r\necho %1\r\n");
      const result = Bun.spawnSync(windowsBatchCommand(launcher, "--version"));
      expect(result.exitCode).toBe(0);
      expect(result.stdout.toString().trim()).toBe("--version");
    } finally {
      await rm(directory, { recursive: true, force: true });
    }
  },
);
