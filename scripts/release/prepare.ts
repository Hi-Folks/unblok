import { parseArgs } from "node:util";

type ReleaseStep = { name: string; status: "pending" | "running" | "done" };
const steps: ReleaseStep[] = [
  { name: "Preflight checks", status: "pending" },
  { name: "Format and check working tree", status: "pending" },
  { name: "Quality checks", status: "pending" },
  { name: "Update and stage package version", status: "pending" },
  { name: "Create release commit", status: "pending" },
  { name: "Create annotated tag", status: "pending" },
];

export function formatReleaseReport(
  items: readonly ReleaseStep[],
  version?: string,
  success = false,
): string {
  const lines = [
    success ? "Release preparation complete" : "Release preparation stopped",
    ...(version ? [`Version: ${version}`] : []),
    "",
    ...items.map(
      (item) =>
        `  ${item.status === "done" ? "✓" : item.status === "running" ? "!" : "–"} ${item.name}: ${item.status === "running" ? "interrupted or failed" : item.status === "pending" ? "not run" : "complete"}`,
    ),
  ];
  if (success && version)
    lines.push(
      "",
      "Review the release commit and tag:",
      "  git log -1 --oneline",
      `  git show v${version}`,
      "",
      "When ready, push the commit and tag:",
      "  git push",
      `  git push origin v${version}`,
      "",
      "Pushing the tag starts the GitHub release workflow. Nothing has been pushed.",
    );
  else
    lines.push(
      "",
      "Inspect git status, the latest commit, and local tags before retrying; changes are not rolled back automatically.",
    );
  return lines.join("\n");
}

let selectedVersion: string | undefined;
async function step(index: number, task: () => Promise<void>): Promise<void> {
  const item = steps[index];
  if (!item) throw new Error("Invalid release step.");
  item.status = "running";
  console.log(`\n→ ${item.name}`);
  await task();
  item.status = "done";
}

export function parseReleaseVersion(args: string[], current: string): string {
  const { positionals } = parseArgs({
    args,
    allowPositionals: true,
    strict: true,
  });
  if (
    positionals.length !== 1 ||
    !/^(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)$/.test(positionals[0]!)
  )
    throw new Error(
      "Provide exactly one stable version, for example: bun run release 0.1.4",
    );
  const version = positionals[0]!;
  if (!/^(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)$/.test(current))
    throw new Error(
      "Current package version is not a stable semantic version.",
    );
  const target = version.split(".").map(BigInt);
  const previous = current.split(".").map(BigInt);
  const firstDifference = target.findIndex(
    (part, index) => part !== previous[index],
  );
  if (
    firstDifference < 0 ||
    target[firstDifference]! < previous[firstDifference]!
  )
    throw new Error(
      "Release version must be greater than the current package version.",
    );
  return version;
}

async function run(args: string[], capture = false): Promise<string> {
  const process = Bun.spawn(args, {
    stdout: capture ? "pipe" : "inherit",
    stderr: "inherit",
    stdin: "inherit",
  });
  const output = capture ? await new Response(process.stdout).text() : "";
  if (await process.exited)
    throw new Error(`Command failed: ${args.join(" ")}`);
  return output.trim();
}

async function main(): Promise<void> {
  const manifestFile = Bun.file("package.json");
  const original = await manifestFile.text();
  const manifest = JSON.parse(original) as { version?: unknown };
  if (typeof manifest.version !== "string")
    throw new Error("package.json has no valid version.");
  const version = parseReleaseVersion(Bun.argv.slice(2), manifest.version);
  selectedVersion = version;
  const tag = `v${version}`;
  await step(0, async () => {
    if (
      await run(["git", "status", "--porcelain", "--untracked-files=all"], true)
    )
      throw new Error(
        "Commit or remove all working-tree changes before preparing a release.",
      );
    if (await run(["git", "tag", "--list", tag], true))
      throw new Error(`Tag ${tag} already exists locally.`);
    const changelog = await Bun.file("CHANGELOG.md").text();
    if (
      !changelog
        .split(/\r?\n/)
        .some(
          (line) =>
            line.startsWith(`## ${version} `) || line === `## ${version}`,
        )
    )
      throw new Error(
        `Add a changelog section for ${version} before preparing the release.`,
      );
    const releaseNotes = changelog.split(/\r?\n/);
    const heading = releaseNotes.findIndex(
      (line) => line.startsWith(`## ${version} `) || line === `## ${version}`,
    );
    const next = releaseNotes.findIndex(
      (line, index) => index > heading && line.startsWith("## "),
    );
    if (
      !releaseNotes
        .slice(heading + 1, next < 0 ? undefined : next)
        .some((line) => /^\s*[-*] \S/.test(line))
    )
      throw new Error(
        `Add at least one changelog entry for ${version} before preparing the release.`,
      );
  });
  await step(1, async () => {
    await run(["bun", "fmt"]);
    if (
      await run(["git", "status", "--porcelain", "--untracked-files=all"], true)
    )
      throw new Error(
        "Formatting changed files. Review and commit them, then rerun the release command.",
      );
  });
  await step(2, async () => {
    await run(["bun", "run", "quality"]);
    if (
      await run(["git", "status", "--porcelain", "--untracked-files=all"], true)
    )
      throw new Error(
        "Quality checks changed files. Review and commit them before retrying.",
      );
  });
  await step(3, async () => {
    const updated = original.replace(
      /("version"\s*:\s*")[^"]+("\s*[,}])/,
      (_match, prefix: string, suffix: string) =>
        `${prefix}${version}${suffix}`,
    );
    if (
      updated === original ||
      (JSON.parse(updated) as { version?: string }).version !== version
    )
      throw new Error("Could not safely update the package version.");
    await Bun.write("package.json", updated);
    await run(["git", "add", "--", "package.json"]);
  });
  await step(4, () =>
    run(["git", "commit", "-m", `Release ${version}`]).then(() => {}),
  );
  await step(5, () =>
    run(["git", "tag", "-a", tag, "-m", `Release ${version}`]).then(() => {}),
  );
  console.log(`\n${formatReleaseReport(steps, version, true)}`);
}

if (import.meta.main) {
  main().catch((error: unknown) => {
    console.error(
      error instanceof Error ? error.message : "Release preparation failed.",
    );
    console.error(`\n${formatReleaseReport(steps, selectedVersion)}`);
    process.exitCode = 1;
  });
}
