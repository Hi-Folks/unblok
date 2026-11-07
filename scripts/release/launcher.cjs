#!/usr/bin/env node
"use strict";
const { spawnSync } = require("node:child_process");
const { join } = require("node:path");
const platforms = new Set([
  "darwin-arm64",
  "darwin-x64",
  "linux-x64",
  "linux-arm64",
  "win32-x64",
]);
const platform = `${process.platform}-${process.arch}`;
if (!platforms.has(platform)) {
  console.error(
    `Unblok: unsupported platform ${platform}. Supported: ${[...platforms].join(", ")}.`,
  );
  process.exit(1);
}
if (
  process.platform === "linux" &&
  process.report &&
  !process.report.getReport().header.glibcVersionRuntime
) {
  console.error(
    "Unblok: this release requires glibc on Linux; musl/Alpine is not supported.",
  );
  process.exit(1);
}
const name = `@hi-folks/unblok-${platform}`;
let binary;
try {
  const manifest = require.resolve(`${name}/package.json`);
  binary = join(
    manifest,
    "..",
    "bin",
    process.platform === "win32" ? "unblok.exe" : "unblok",
  );
} catch {
  console.error(
    `Unblok: platform package ${name} is missing. Reinstall with optional dependencies enabled (do not use --omit=optional).`,
  );
  process.exit(1);
}
const result = spawnSync(binary, process.argv.slice(2), {
  stdio: "inherit",
  windowsHide: false,
});
if (result.error) {
  console.error(`Unblok: could not run ${name}: ${result.error.message}`);
  process.exit(1);
}
if (result.signal) {
  try {
    process.kill(process.pid, result.signal);
  } catch {
    process.exit(1);
  }
} else process.exit(result.status === null ? 1 : result.status);
