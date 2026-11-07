import { chmod, copyFile, mkdir, rm, stat, symlink } from "node:fs/promises";
import { createHash } from "node:crypto";
import { dirname, join, resolve } from "node:path";
import { tmpdir } from "node:os";
import { mkdtemp } from "node:fs/promises";
import { version } from "../../package.json";
import config from "./config.json";

const platforms = [
  "darwin-arm64",
  "darwin-x64",
  "linux-x64",
  "linux-arm64",
  "win32-x64",
];
const all = Bun.argv.includes("--all");
const publish = Bun.argv.includes("--publish");
const host = `${process.platform}-${process.arch}`;
if (!platforms.includes(host)) throw new Error(`Unsupported host: ${host}`);
if (
  config.packageName !== "unblok" ||
  !/^@[a-z0-9][a-z0-9._-]*$/.test(config.scope)
)
  throw new Error("Invalid release package name or npm scope.");
if (
  publish &&
  (!config.namesAndPermissionsVerified ||
    !/^https:\/\/github\.com\/[\w.-]+\/[\w.-]+$/.test(config.repository) ||
    !config.license ||
    !(await Bun.file("LICENSE").exists()))
) {
  throw new Error(
    "Publishing blocked: configure repository URL, license, LICENSE file, and verified npm package/scope ownership in scripts/release/config.json.",
  );
}
if (
  process.env.GITHUB_REF_TYPE === "tag" &&
  process.env.GITHUB_REF_NAME !== `v${version}`
)
  throw new Error("Git tag does not match package version");
const release = resolve("dist/release");
const stage = resolve("dist/npm");
await rm(stage, { recursive: true, force: true });
await mkdir(stage, { recursive: true });
const optionalDependencies = Object.fromEntries(
  platforms.map((platform) => [
    `${config.scope}/${config.packageName}-${platform}`,
    version,
  ]),
);
const metadata = {
  version,
  description: "Unblock your Storyblok operations.",
  license: config.license || "UNLICENSED",
  ...(config.repository
    ? {
        repository: { type: "git", url: `${config.repository}.git` },
        homepage: config.repository,
        bugs: { url: `${config.repository}/issues` },
      }
    : {}),
};
const main = join(stage, "unblok");
await mkdir(join(main, "bin"), { recursive: true });
await Bun.write(
  join(main, "bin/unblok.cjs"),
  (await Bun.file("scripts/release/launcher.cjs").text()).replace(
    "@hi-folks/unblok-${platform}",
    `${config.scope}/${config.packageName}-\${platform}`,
  ),
);
const hasLicense = await Bun.file("LICENSE").exists();
if (hasLicense) await copyFile("LICENSE", join(main, "LICENSE"));
await Bun.write(
  join(main, "README.md"),
  "# Unblok\n\nUnofficial Storyblok management CLI. Run `unblok --help`.\n",
);
await Bun.write(
  join(main, "package.json"),
  JSON.stringify(
    {
      name: config.packageName,
      ...metadata,
      private: !publish,
      bin: { unblok: "bin/unblok.cjs" },
      files: ["bin/unblok.cjs", "README.md"],
      engines: { node: ">=18" },
      keywords: ["storyblok", "cli", "automation"],
      optionalDependencies,
    },
    null,
    2,
  ),
);
for (const platform of all ? platforms : [host]) {
  const exe = platform.startsWith("win32") ? "unblok.exe" : "unblok";
  const artifact = join(
    release,
    `unblok-${platform}${exe.endsWith(".exe") ? ".exe" : ""}`,
  );
  if (
    !(await Bun.file(artifact).exists()) ||
    (await Bun.file(artifact).size) === 0
  )
    throw new Error(`Missing release artifact: ${artifact}`);
  if (!platform.startsWith("win32")) {
    const mode = (await stat(artifact)).mode;
    if (!(mode & 0o111))
      throw new Error(`Release artifact is not executable: ${artifact}`);
  }
  const directory = join(stage, platform);
  await mkdir(join(directory, "bin"), { recursive: true });
  await copyFile(artifact, join(directory, "bin", exe));
  if (hasLicense) await copyFile("LICENSE", join(directory, "LICENSE"));
  if (!platform.startsWith("win32"))
    await chmod(join(directory, "bin", exe), 0o755);
  const [os, cpu] = platform.split("-");
  await Bun.write(
    join(directory, "package.json"),
    JSON.stringify(
      {
        name: `${config.scope}/${config.packageName}-${platform}`,
        ...metadata,
        private: !publish,
        os: [os],
        cpu: [cpu],
        ...(os === "linux" ? { libc: ["glibc"] } : {}),
        files: [`bin/${exe}`],
      },
      null,
      2,
    ),
  );
}
const run = async (
  cmd: string[],
  cwd?: string,
  extraEnv: Record<string, string> = {},
) => {
  if (process.platform === "win32" && cmd[0] === "npm") {
    const npm = Bun.which("npm");
    if (!npm) throw new Error("npm was not found");
    cmd = [
      "node",
      join(dirname(npm), "node_modules/npm/bin/npm-cli.js"),
      ...cmd.slice(1),
    ];
  }
  const p = Bun.spawn(cmd, {
    cwd,
    stdout: "pipe",
    stderr: "pipe",
    env: {
      ...process.env,
      npm_config_cache: join(tmpdir(), "unblok-npm-cache"),
      npm_config_audit: "false",
      npm_config_fund: "false",
      npm_config_update_notifier: "false",
      ...extraEnv,
    },
  });
  const [stdout, stderr, code] = await Promise.all([
    new Response(p.stdout).text(),
    new Response(p.stderr).text(),
    p.exited,
  ]);
  if (code) throw new Error(`${cmd.join(" ")} failed: ${stderr || stdout}`);
  return stdout.trim();
};
const hostBinary = join(
  release,
  `unblok-${host}${process.platform === "win32" ? ".exe" : ""}`,
);
if ((await run([hostBinary, "--version"])) !== `unblok ${version}`)
  throw new Error("Compiled binary version mismatch");
if (!(await run([hostBinary, "--help"])).includes("Usage: unblok"))
  throw new Error("Compiled binary help failed");
const versionJson = JSON.parse(
  await run([hostBinary, "--version", "--json"]),
) as { version?: string };
if (versionJson.version !== version)
  throw new Error("Compiled JSON version mismatch");
const badCommand = Bun.spawn([hostBinary, "__unblok_unknown_command__"], {
  stdout: "pipe",
  stderr: "pipe",
});
const [badOut, badErr, badExit] = await Promise.all([
  new Response(badCommand.stdout).text(),
  new Response(badCommand.stderr).text(),
  badCommand.exited,
]);
if (badExit !== 2 || badOut || !badErr.includes("Unknown command"))
  throw new Error("Compiled CLI error handling failed");
const tarballs = resolve("dist/tarballs");
await rm(tarballs, { recursive: true, force: true });
await mkdir(tarballs, { recursive: true });
const packed: Record<string, string> = {};
for (const name of ["unblok", ...(all ? platforms : [host])]) {
  const result = JSON.parse(
    await run(
      [
        "npm",
        "pack",
        "--json",
        "--ignore-scripts",
        "--pack-destination",
        tarballs,
      ],
      join(stage, name),
    ),
  ) as Array<{ filename: string; files: Array<{ path: string }> }>;
  const info = result[0];
  if (!info) throw new Error(`npm pack failed: ${name}`);
  const allowed =
    name === "unblok"
      ? ["README.md", "bin/unblok.cjs", "package.json"]
      : [
          `bin/${name.startsWith("win32") ? "unblok.exe" : "unblok"}`,
          "package.json",
        ];
  if (hasLicense) allowed.push("LICENSE");
  const actual = info.files.map((entry) => entry.path).sort();
  if (JSON.stringify(actual) !== JSON.stringify(allowed.sort()))
    throw new Error(`Unexpected contents in ${name}: ${actual}`);
  packed[name] = join(tarballs, info.filename);
}
const temp = await mkdtemp(join(tmpdir(), "unblok-package-"));
try {
  const plan = JSON.parse(
    await run(
      [
        hostBinary,
        "space",
        "setup",
        "plan",
        "--config",
        resolve("src/setup/fixtures/input-blueprint.yaml"),
        "--json",
      ],
      temp,
    ),
  ) as { apiVersion?: string };
  if (plan.apiVersion !== "unblok/setup-blueprint-plan-v1")
    throw new Error(
      "Compiled CLI could not load its embedded schema outside the source tree",
    );
  await Bun.write(join(temp, "package.json"), '{"private":true}');
  await run(
    [
      "npm",
      "install",
      "--offline",
      "--ignore-scripts",
      "--omit=optional",
      "--no-save",
      packed.unblok!,
      packed[host]!,
    ],
    temp,
  );
  const launcher = join(
    temp,
    "node_modules",
    ".bin",
    process.platform === "win32" ? "unblok.cmd" : "unblok",
  );
  let executionEnv: Record<string, string> = {};
  if (process.platform !== "win32") {
    const node = Bun.which("node");
    if (!node) throw new Error("Node.js is required to test the npm launcher");
    const nodeOnly = join(temp, "node-only");
    await mkdir(nodeOnly);
    await symlink(node, join(nodeOnly, "node"));
    executionEnv = { PATH: nodeOnly };
  }
  const output =
    process.platform === "win32"
      ? await run(["cmd", "/d", "/s", "/c", `"${launcher}" --version`], temp)
      : await run([launcher, "--version"], temp, executionEnv);
  if (output !== `unblok ${version}`)
    throw new Error("Installed npm launcher version mismatch");
  const help =
    process.platform === "win32"
      ? await run(["cmd", "/d", "/s", "/c", `"${launcher}" --help`], temp)
      : await run([launcher, "--help"], temp, executionEnv);
  if (!help.includes("Usage: unblok"))
    throw new Error("Installed npm launcher help failed");
} finally {
  await rm(temp, { recursive: true, force: true });
}
if (all) {
  const checksums: string[] = [];
  for (const platform of platforms) {
    const filename = `unblok-${platform}${platform.startsWith("win32") ? ".exe" : ""}`;
    checksums.push(
      `${createHash("sha256")
        .update(
          Buffer.from(await Bun.file(join(release, filename)).arrayBuffer()),
        )
        .digest("hex")}  ${filename}`,
    );
  }
  await Bun.write(join(release, "SHA256SUMS"), `${checksums.join("\n")}\n`);
}
console.log(
  `Validated ${all ? "all platform packages and" : ""} ${host} executable, npm packages, and offline installation.`,
);
