# Preparing a release

The first release is not published. The root package remains private for development; release scripts stage the unscoped `unblok` launcher and five `@hi-folks/unblok-<platform>` packages in `dist/npm`. Publishing remains blocked until ownership and availability are confirmed.

## Before the first release

1. Confirm ownership and publish permissions for `unblok` and every platform package in the chosen npm scope. A registry 404 alone does not establish ownership. Change the scope in `scripts/release/config.json` if needed; the staged launcher and platform manifests use that scope.
2. Verify the MIT `LICENSE` copyright notice and configured GitHub repository. Set `namesAndPermissionsVerified` in `scripts/release/config.json` to `true` only after step 1. The release checks refuse public staging until these fields are set.
3. Configure npm trusted publishing for each package, for the exact GitHub repository and `.github/workflows/release.yml` workflow. Confirm whether npm supports the desired first-publication setup for your packages; bootstrap each package securely if required. Configure a GitHub `release` environment, with required reviewers if desired. The publishing job uses OIDC rather than a stored npm token. Trusted publishing requires a supported npm/Node version and a GitHub-hosted runner. See [npm trusted publishing](https://docs.npmjs.com/trusted-publishers/).
4. Confirm all five native matrix jobs and the package installation checks pass in the actual repository. Linux artifacts target glibc, not Alpine/musl. The npm launcher requires Node.js 18 or newer; standalone binaries need neither Node nor Bun. Check the Bun runtime's OS and CPU requirements for the pinned build version.

## Prepare a version

Update the version in `package.json` and add release notes to `CHANGELOG.md`. The build injects the version into each executable; staged package manifests use the same source. Ensure the lockfile remains valid with `bun install --frozen-lockfile`.

```bash
bun run quality
bun run build              # Current platform
bun run release:check      # Pack and install current platform locally
bun run build:all          # Cross-compiles; downloads Bun runtimes when needed
bun run scripts/release/check.ts --all --publish
```

The last command stages publishable packages only after the configuration is complete; it does not publish them. The local check uses npm to pack packages, verifies their file lists, installs the current-platform tarballs offline in a temporary directory, and runs the installed CLI. It also tests the standalone binary's version, help, JSON version, and error exit code. Cross-compiled binaries must be executed on their target systems; the release workflow does this on native runners.

`quality` checks formatting for the release scripts, type-checks, and runs the full test suite. A repository-wide `bun fmt --check` currently reports pre-existing formatting differences; no lint command is configured.

Review changes and artifacts before creating a `v<version>` tag. The release workflow checks the tag, runs quality and native builds, stages all packages, checks registry versions, publishes platform packages first and the launcher last, verifies installation, and creates a GitHub Release with standalone binaries and `SHA256SUMS`. It does not run until a tag is pushed:

```bash
git tag v0.1.0
git push origin v0.1.0
```

The generated packages use a Node launcher and `optionalDependencies` for platform binaries; they perform no install-time download. Verify the GitHub release assets and checksums, `npm view unblok@VERSION`, and installation on supported systems after publishing. Registry propagation can take time.

## Failure recovery

The preflight refuses to proceed if any target package version already exists; it never silently skips one. npm package versions are immutable, and publication cannot be rolled back atomically. If a workflow fails after publishing some packages, inspect npm and GitHub to determine exactly what was published. Resolve the cause, then use a new patch version and tag for all packages; do not overwrite versions or retry blindly. If all packages were published but GitHub release creation failed, verify their versions and artifacts first and create the missing release deliberately. Keep credentials and `.env` files out of artifacts and logs.
