import { mkdir, readdir, readFile, rm, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { version } from "../../package.json";

await rm("dist/package", { recursive: true, force: true });
await mkdir("dist/package", { recursive: true });
const result = await Bun.build({
  entrypoints: ["./index.ts", "./src/library.ts"],
  outdir: "dist/package",
  target: "node",
  format: "esm",
  packages: "external",
  define: { UNBLOK_BUILD_VERSION: JSON.stringify(version) },
});
if (!result.success) throw new Error("JavaScript build failed.");
const declarations = Bun.spawn(
  ["bunx", "--no-install", "tsc", "-p", "tsconfig.library.json"],
  { stdout: "inherit", stderr: "inherit" },
);
if ((await declarations.exited) !== 0)
  throw new Error("Type declaration build failed.");

// Published declarations reference declaration files through JavaScript-style
// specifiers, so consumers do not need allowImportingTsExtensions.
async function rewriteDeclarations(directory: string): Promise<void> {
  for (const entry of await readdir(directory, { withFileTypes: true })) {
    const path = join(directory, entry.name);
    if (entry.isDirectory()) await rewriteDeclarations(path);
    else if (entry.name.endsWith(".d.ts")) {
      const source = await readFile(path, "utf8");
      const updated = source.replace(
        /(["'])(\.{1,2}\/[^"']+)\.ts\1/g,
        "$1$2.js$1",
      );
      if (updated !== source) await writeFile(path, updated);
    }
  }
}
await rewriteDeclarations("dist/library-types");
