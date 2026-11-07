<p align="center">
    <img width="800" src="https://repository-images.githubusercontent.com/1449493184/35658be2-58ad-4cca-a1e3-3684857c0703" alt="A developer CLI for managing and automating Storyblok Spaces">
</p>

<h1 align="center">unblok_</h1>

## Unblock your Storyblok operations.

Set up and manage Storyblok spaces from the command line, or describe a setup in YAML and run it whenever you need it. `unblok_` turns recurring operations into reusable building blocks for developers, CI pipelines, and AI assistants.

> Early development: commands and interfaces may change while the initial workflow is shaped.

## Why `unblok_`?

Creating preconfigured spaces for a content editor team, launching a new brand, or starting a new project often means repeating the same steps in the Storyblok UI or maintaining one-off API scripts. With `unblok_`, you can run individual commands for everyday tasks or combine them in a YAML blueprint for a repeatable space setup.

This is **configuration as code** applied to Storyblok: keep a setup in Git, review changes with your team, and reuse it across spaces. For example, a blueprint can install an app and add a tag to a story:

```yaml
version: 1
template:
  name: Apps and story tags
execution:
  mode: reconcile
apps:
  install:
    - import
tags:
  - stories:
      slugs:
        - home
    tags:
      - demo
```

Save this as `setup.yaml`, then review and apply it to an existing space:

```bash
unblok space setup plan --config setup.yaml
unblok space setup apply --config setup.yaml --space-id YOUR_SPACE_ID --yes
```

The plan validates the blueprint locally and shows its operations; it does not inspect the space or predict changes. Applying requires a token and performs the operations against Storyblok. Repeat behavior depends on the resource and existing state; see [repeatable space setups](docs/space-setups.md) for details.

## Built for people and AI assistants

An AI assistant can understand your intent and choose when to run a command or prepare a blueprint. `unblok_` carries out the operation using shared, tested logic instead of asking the assistant to generate a new sequence of API calls each time.

That gives people and agents the same predictable commands, validation, and structured results. It can reduce prompt and token usage, and save time on recurring work. Add `--json` for machine-readable output that an assistant or CI pipeline can inspect.

AI still needs the right instructions and permissions, and Storyblok state or API errors can affect results. Review plans and reports, especially before applying changes; a failed setup can leave earlier changes in place.

## Scope

`unblok_` complements existing Storyblok tooling. It focuses on operational space management and repeatable administration rather than project scaffolding or application development. Its YAML blueprints compose reusable operations into version-controlled space setups.

## Installation

Install the published CLI with npm (requires Node.js):

```bash
npm install -g unblok
unblok --help
```

You can also try `npx unblok --help` or install with `bun install -g unblok`. The npm launcher requires Node.js; the platform executable does not require Bun.

Unblok is an independent open-source project, licensed under the [MIT License](LICENSE), and is not an official Storyblok product. Contributors use Bun for development.

## Quick start

Set a [Storyblok Management API personal access token](https://www.storyblok.com/docs/concepts/access-tokens#management-api-access-tokens) in your environment, then explore the CLI:

```bash
export STORYBLOK_TOKEN="your-personal-access-token"
unblok --version
unblok space list
```

The [getting started guide](docs/getting-started.md) covers authentication, a first read-only request, and running from source.

Ready to automate a setup? Follow [your first blueprint](docs/first-blueprint.md) to try Unblok with `npx`, then plan and apply a simple change.

## Documentation

For an automated demo space setup with a confirmation after duplication, see [the demo setup guide](docs/demo-setup.md).

| Guide                                          | Use it for                                                          |
| ---------------------------------------------- | ------------------------------------------------------------------- |
| [Getting started](docs/getting-started.md)     | Requirements, authentication, installation, and the first request.  |
| [Your first blueprint](docs/first-blueprint.md) | Plan and apply a simple YAML setup to an existing space. |
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
unblok space plan --help
```

## Repeatable setups

Define a space setup once in YAML, review it, and repeat it for another customer or environment. The `version: 1` blueprint format composes the same actions used by the CLI: duplicate a space, configure it, install apps, provision content, and assign workflows and tags.

Start with the [customer demo guide](examples/customer-demo/README.md) to understand the process and reusable steps, or use the [modular blueprint](examples/customer-demo/setup.yaml) to combine them. The following command runs from a source checkout; planning is local and does not require a token.

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
