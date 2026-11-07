<p align="center">
    <img width="800" src="https://repository-images.githubusercontent.com/1449493184/35658be2-58ad-4cca-a1e3-3684857c0703" alt="A developer CLI for managing and automating Storyblok Spaces">
</p>

<h1 align="center">unblok_</h1>

## Unblock your Storyblok operations.

A Bun and TypeScript CLI for practical Storyblok Management API operations.

> Early development: commands and interfaces may change while the initial workflow is shaped.

## Why `unblok_`?

Storyblok's Management API is powerful, but recurring operations often become one-off scripts. `unblok_` turns those operations into discoverable, tested commands that work equally well for people and automation.

The project aims to provide:

- readable terminal output with progress and actionable errors;
- stable JSON output for scripts and CI;
- local blueprint validation before setup changes;
- small, composable commands built on Storyblok's typed Management API client.

## Scope

`unblok_` complements existing Storyblok tooling. It focuses on operational space management and repeatable administration rather than project scaffolding or application development. Its YAML blueprints compose reusable operations into version-controlled space setups.

## Installation

The first public release is being prepared; the following npm and standalone channels are not published yet. Once available, npm users will be able to install with `npm install -g unblok` or try `npx unblok --help`; Bun users can use `bun install -g unblok`. Standalone binaries are planned for GitHub Releases on macOS, Linux (glibc), and Windows. Distributed executables will not require Bun; npm installations require Node.js for the launcher.

Unblok is an independent open-source project, licensed under the [MIT License](LICENSE), and is not an official Storyblok product. Contributors use Bun for development.

## Quick start

With Bun 1.4 or newer, open a terminal in a source checkout and run:

```bash
bun install --frozen-lockfile
bun run start --version
cp .env.example .env
```

Add a Storyblok personal access token to `.env`, then explore the CLI:

```bash
bun run start --help
bun run start space list
```

The [getting started guide](docs/getting-started.md) walks through obtaining the source, configuring a token, and making a first read-only request.

## Documentation

For an automated demo space setup with a confirmation after duplication, see [the demo setup guide](docs/demo-setup.md).

| Guide                                          | Use it for                                                          |
| ---------------------------------------------- | ------------------------------------------------------------------- |
| [Getting started](docs/getting-started.md)     | Requirements, authentication, installation, and the first request.  |
| [Repeatable space setups](docs/space-setups.md) | Provisioning workflow, composition, and repeat-run behavior. |
| [Command reference](docs/commands.md)          | Command syntax, every parameter, examples, and output behavior.     |
| [Setup blueprints](docs/commands.md#version-1-setup-blueprints) | YAML sections, examples, and repeatable setup behavior. |
| [Project direction](docs/project-direction.md) | Configuration-as-Code goals, design principles, and staged roadmap. |
| [Command roadmap](docs/command-roadmap.md)     | Resource operations planned as building blocks for space setups.    |

## Available commands

- `space list` searches and filters accessible spaces.
- `space get` retrieves details for one space.
- `space delete` previews a space and asks for confirmation before deletion.
- `space duplicate` duplicates content and components into a new space.
- `space token`, `space preview-set`, and `space demo-remove` configure demo space previews.
- `app list` and `app install` inspect and provision space apps.
- `app ai-translation enable` accepts a specified disclaimer and installs AI Translations.
- `space plan` validates and previews a versioned setup file without making changes.
- `space apply` reconciles supported resources after explicit confirmation.
- `space setup plan` and `space setup apply` inspect and run `version: 1` blueprints.
- `language list` and `language add` inspect and idempotently configure space languages.
- `component list`, `get`, `create`, and `update` manage component schemas.
- `component field-add` adds a field to a component tab.
- `story tags plan` and `story tags assign` add tags to stories by full slug.
- `workflow list`, `workflow stage`, and `story workflow` inspect stages and assign stories.

Run any command with `--help` for an inline summary:

```bash
bun run start space plan --help
```

## Repeatable setups

Define a space setup once in YAML, review it, and repeat it for another customer or environment. The `version: 1` blueprint format composes the same actions used by the CLI: duplicate a space, configure it, install apps, provision content, and assign workflows and tags.

Start with the [customer demo guide](examples/customer-demo/README.md) to understand the process and reusable steps, or use the [modular blueprint](examples/customer-demo/setup.yaml) to combine them. Planning is local and does not require a token:

For smaller, independent examples of individual capabilities, see [feature examples](examples/features/). The demo's [alternatives](examples/customer-demo/alternatives/) include local asset uploads.

The modular blueprint enables space AI using space-specific settings and accepts the AI Translations disclaimer. Review the disclaimer ID and terms before applying.

```bash
bun run start space setup plan --config examples/customer-demo/setup.yaml \
  --input 'space_name=Customer Demo' \
  --input 'asset_url=https://your-host.example/banner.png'
```

The URL above is a placeholder. The [setup guide](docs/space-setups.md) explains prerequisites, applying to a new or existing space, composition, and what happens on repeat runs. Blueprints use a local [JSON Schema](space-setup.schema.json) for editor support and CLI validation. Some operations are still awaiting live end-to-end verification.

The older `space-man/v1` format uses `space plan` and `space apply` and has different capabilities; see its [command reference](docs/commands.md#space-plan).

## Output philosophy

Interactive terminals use Clack for concise progress and status feedback. Commands produce human-readable summaries by default; add `--json` when output will be consumed by another program. Errors are written to stderr and return a non-zero exit code.

## Where this is going

The `space setup` workflow composes reusable actions into a repeatable configuration. Its next milestones include end-to-end verification and more complete planning. See the [project direction](docs/project-direction.md) for the architectural guardrails.

The [alpha release checklist](docs/alpha-release-checklist.md) tracks verification and release preparation.

## Development

```bash
bun test
bun run typecheck
bun run build
bun fmt
```

See [AGENTS.md](AGENTS.md) for repository conventions.
