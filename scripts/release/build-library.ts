import { mkdir, rm } from "node:fs/promises";

await rm("dist/library", { recursive: true, force: true });
await rm("dist/library-types", { recursive: true, force: true });
await mkdir("dist/library", { recursive: true });
const result = await Bun.build({
  entrypoints: ["src/library.ts"],
  outdir: "dist/library",
  target: "bun",
  format: "esm",
  external: ["@storyblok/management-api-client", "@storyblok/region-helper"],
});
if (!result.success) throw new Error("Library JavaScript build failed.");

const declarations = Bun.spawn(
  ["bunx", "--no-install", "tsc", "-p", "tsconfig.library.json"],
  {
    stdout: "inherit",
    stderr: "inherit",
  },
);
if ((await declarations.exited) !== 0)
  throw new Error("Library declaration build failed.");
