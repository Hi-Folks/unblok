# Getting Started

## Planned public installation

These channels are being prepared and are **not published yet**. Once released, users with Node.js can install or run Unblok through npm:

```bash
npm install -g unblok
unblok --help
unblok --version
# Or run without a global installation:
npx unblok --help
```

Bun users will also be able to run `bun install -g unblok`. The npm launcher requires Node.js, but it does not require Bun. Standalone executables for macOS, Linux (glibc), and Windows will be available from the project's GitHub Releases after publication; download the matching platform and verify it against `SHA256SUMS`. Standalone executables require neither Bun nor Node.js. On Unix, make a downloaded binary executable with `chmod +x` before running it.

## Run from source today

This guide runs the alpha from a source checkout using Bun. Run the commands below from the repository root; this does not install a global `unblok` command.

## 1. Get the source

Install [Bun](https://bun.com) 1.4 or newer and Git. Check your Bun version:

```bash
bun --version
```

Clone the Unblok repository and enter it:

```bash
git clone https://github.com/Hi-Folks/unblok.git unblok
cd unblok
```

If you already downloaded the source, open a terminal in that directory instead. Repository access may be restricted until the public release.

## 2. Install and check Unblok

```bash
bun install --frozen-lockfile
bun run start --version
bun run start --help
```

The version and help commands work without Storyblok credentials. Run subsequent commands from the same directory; `bun run start` invokes the local CLI. The alpha is currently a private package, not a published package installation.

## 3. Configure Storyblok access

Create a [Storyblok personal access token](https://app.storyblok.com/#/me/account?tab=token) with the permissions needed for your operations. Prefer a non-production space when evaluating the CLI.

```bash
cp .env.example .env
```

Open `.env` in an editor and replace the placeholder with your token:

```dotenv
STORYBLOK_TOKEN=your-personal-access-token
```

Bun loads `.env` automatically. Keep the file private: never commit it or share its contents. Optionally set `STORYBLOK_SPACE_ID` in `.env` to select a default space; an explicit `--space-id` takes precedence.

## 4. Make a read-only request

List spaces accessible to your token:

```bash
bun run start space list
```

Use `--json` to pipe machine-readable output to tools such as `jq`:

```bash
bun run start space list --json
```

If the request fails, check the token, its permissions, and your network connection. Configuration and API errors return a non-zero exit code. Requests are limited to six per second by default; set `STORYBLOK_REQUESTS_PER_SECOND` if your plan requires a different rate. Explicit HTTP 429 responses are retried with backoff.

## 5. Explore a repeatable setup

The [customer demo guide](../examples/customer-demo/README.md) explains how to review a modular blueprint and apply its steps. Start with `space setup plan`: it validates locally without changing Storyblok. Applying a setup changes resources and requires `--yes`; creating a space may have plan implications.

Get command-specific help at any time:

```bash
bun run start space --help
bun run start space setup --help
```
