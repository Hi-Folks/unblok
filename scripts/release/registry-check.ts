import config from "./config.json";
import { version } from "../../package.json";
const platforms = [
  "darwin-arm64",
  "darwin-x64",
  "linux-x64",
  "linux-arm64",
  "win32-x64",
];
for (const name of [
  config.packageName,
  ...platforms.map(
    (platform) => `${config.scope}/${config.packageName}-${platform}`,
  ),
]) {
  const response = await fetch(
    `https://registry.npmjs.org/${encodeURIComponent(name)}/${encodeURIComponent(version)}`,
  );
  if (response.status === 200)
    throw new Error(
      `${name}@${version} already exists; stop and follow partial-release recovery.`,
    );
  if (response.status !== 404)
    throw new Error(
      `Could not verify ${name}@${version} on npm (HTTP ${response.status}).`,
    );
}
console.log(
  "No target version is published; package-name ownership must be verified separately.",
);
