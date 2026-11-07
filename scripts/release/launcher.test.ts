import { expect, test } from "bun:test";
import { resolve } from "node:path";
const launcher = resolve("scripts/release/launcher.cjs");
test("launcher fails clearly for an unsupported platform", () => {
  const result = Bun.spawnSync([
    "node",
    "-e",
    `Object.defineProperty(process,'platform',{value:'freebsd'});require(${JSON.stringify(launcher)})`,
  ]);
  expect(result.exitCode).toBe(1);
  expect(result.stderr.toString()).toContain("unsupported platform");
});
test("launcher explains missing optional platform packages", () => {
  const result = Bun.spawnSync(["node", launcher]);
  expect(result.exitCode).toBe(1);
  expect(result.stderr.toString()).toContain("optional dependencies enabled");
});
