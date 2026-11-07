import { mkdir } from "node:fs/promises";
import { version } from "../../package.json";

const targets: Record<string, string> = {
  "darwin-arm64": "bun-darwin-arm64",
  "darwin-x64": "bun-darwin-x64",
  "linux-x64": "bun-linux-x64",
  "linux-arm64": "bun-linux-arm64",
  "win32-x64": "bun-windows-x64",
};
const host = `${process.platform}-${process.arch}`;
const selected = Bun.argv.includes("--all") ? Object.keys(targets) : [host];
await mkdir("dist/release", { recursive: true });
for (const platform of selected) {
  const target = targets[platform];
  if (!target) throw new Error(`Unsupported build host ${platform}`);
  const outfile = `dist/release/unblok-${platform}${platform.startsWith("win32") ? ".exe" : ""}`;
  const child = Bun.spawn(
    [
      "bun",
      "build",
      "./index.ts",
      "--compile",
      `--target=${target}`,
      `--define=UNBLOK_BUILD_VERSION=${JSON.stringify(version)}`,
      "--outfile",
      outfile,
    ],
    { stdout: "inherit", stderr: "inherit" },
  );
  if ((await child.exited) !== 0) throw new Error(`Build failed: ${platform}`);
}
