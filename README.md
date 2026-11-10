<p align="center">
    <img width="800" src="https://repository-images.githubusercontent.com/1449493184/35658be2-58ad-4cca-a1e3-3684857c0703" alt="A developer CLI for managing and automating Storyblok Spaces">
</p>

<p align=center>
    <i>
    <strong>"Unblok"</strong> your Storyblok operations.
    </i>
</p>

<p align=center>
    <a href="https://www.npmjs.com/package/unblok">
        <img src="https://img.shields.io/npm/v/unblok?style=for-the-badge&label=Version" alt="Latest Version on NPM"></a>
    <a href="https://www.npmjs.com/package/unblok"
    ><img src="https://img.shields.io/npm/d18m/unblok?style=for-the-badge" alt="Total Downloads"></a>
    <br />
    <img src="https://img.shields.io/npm/l/unblok?style=for-the-badge" alt="Packagist License">
    <img src="https://img.shields.io/github/last-commit/hi-folks/unblok?style=for-the-badge" alt="GitHub last commit">
</p>

`unblok_` provides reusable building blocks for managing Storyblok spaces and content. Use it in three ways:

- **Command-line CLI:** run individual operations from a shell, script, or CI pipeline.
- **YAML provisioning:** describe a space setup as configuration and apply it repeatably.
- **JavaScript and TypeScript library:** call common content operations from your own code, such as assigning a workflow stage to multiple stories.

The library API is in early development. The next release packages it alongside the CLI for Node.js and Bun projects. See the [library guide](docs/library.md).

> Early development: commands and interfaces may change while the initial workflow is shaped.

## Why `unblok_`?

Creating preconfigured spaces for a content editor team, launching a new brand, or starting a new project often means repeating the same steps in the Storyblok UI or maintaining one-off API scripts. With `unblok_`, you can run individual commands, compose a repeatable YAML blueprint, or use shared operations in your application.

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

## Recipes

Recipes show how to use Unblok for common, real-world Storyblok workflows. Each recipe brings together the steps and API calls needed to achieve an outcome, so you can adapt it to your team and reuse it in a script, a YAML setup or an integration.

- [AI translation and review](docs/recipes/ai-translation-review.md): request translations for a story and move its language versions into an editorial review workflow.
- [Campaign launch](docs/recipes/campaign-launch.md): prepare a release with a landing page, campaign image and home-page change for the team to review.

## Built for people and AI assistants

An AI assistant can understand your intent and choose when to run a command or prepare a blueprint. `unblok_` carries out the operation using shared, tested logic instead of asking the assistant to generate a new sequence of API calls each time.

That gives people and agents the same predictable commands, validation, and structured results. It can reduce prompt and token usage, and save time on recurring work. Add `--json` for machine-readable output that an assistant or CI pipeline can inspect.

AI still needs the right instructions and permissions, and Storyblok state or API errors can affect results. Review plans and reports, especially before applying changes; a failed setup can leave earlier changes in place.

### Use Unblok with an AI coding agent

The [Unblok skill](skills/unblok/SKILL.md) helps agents choose between the CLI, YAML blueprints, and the JavaScript library. It includes focused guidance for translation and campaign recipes. Install the CLI separately and configure your Storyblok token as described below; installing the skill does not install Unblok or grant access to a space.

To get the skill, clone the repository if you don't already have a checkout:

```bash
git clone https://github.com/Hi-Folks/unblok.git ~/unblok-skill-source
```

Then, from the project where you use your agent, copy the complete skill directory to the appropriate location. These examples assume `~/unblok-skill-source` is your checkout; replace it if you use another path. If the destination already contains an `unblok` skill, review it before copying so you don't overwrite local changes.

```bash
# Codex
mkdir -p .agents/skills
cp -R ~/unblok-skill-source/skills/unblok .agents/skills/

# Claude Code
mkdir -p .claude/skills
cp -R ~/unblok-skill-source/skills/unblok .claude/skills/
```

Copy it to either or both locations according to the agents you use, and restart the agent if needed for it to discover the skill. You can ask your agent to use the Unblok skill when working on a Storyblok task. Project-local copies do not update automatically: to update one later, update your checkout, review any local changes and replace the existing skill directory with the updated copy.

The checkout and its documentation may describe a newer version than the installed CLI. Check `unblok --version` and the relevant command's `--help` for supported options. The examples above use a Unix-like shell; on Windows, copy the directory to the same project-relative location using your preferred shell or file manager.

## Scope

`unblok_` complements existing Storyblok tooling. It focuses on operational space and content management rather than project scaffolding. Its YAML blueprints compose reusable operations into version-controlled space setups, and its emerging library API makes common multi-step operations available to application code.

## Installation

The next release supports Node.js 22.21.0 or newer. Install the CLI with npm:

```bash
npm install -g unblok
unblok --help
```

You can also try `npx unblok --help`. Bun users can run `bunx --bun unblok --help`. The current published version may have different runtime requirements; these instructions describe the upcoming single-package release.

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

| Guide                                                           | Use it for                                                                   |
| --------------------------------------------------------------- | ---------------------------------------------------------------------------- |
| [Getting started](docs/getting-started.md)                      | Requirements, authentication, installation, and the first request.           |
| [Your first blueprint](docs/first-blueprint.md)                 | Plan and apply a simple YAML setup to an existing space.                     |
| [Demo experiment](docs/experiments.md)                          | Create and optionally activate an experiment with simulated results.         |
| [Library API](docs/library.md)                                  | Use story, translation, component, workflow and tag actions from JavaScript. |
| [Repeatable space setups](docs/space-setups.md)                 | Provisioning workflow, composition, and repeat-run behavior.                 |
| [Command reference](docs/commands.md)                           | Command syntax, every parameter, examples, and output behavior.              |
| [Setup blueprints](docs/commands.md#version-1-setup-blueprints) | YAML sections, examples, and repeatable setup behavior.                      |
| [Project direction](docs/project-direction.md)                  | Configuration-as-Code goals, design principles, and staged roadmap.          |
| [Command roadmap](docs/command-roadmap.md)                      | Resource operations planned as building blocks for space setups.             |

## Available commands

- `space list` searches and filters accessible spaces.
- `space get` retrieves details for one space.
- `space delete` previews a space and asks for confirmation before deletion.
- `space duplicate` duplicates content and components into a new space.
- `space token`, `space preview-set`, and `space demo-remove` configure demo space previews.
- `app list` and `app install` inspect and provision space apps.
- `asset upload` uploads a local file to a space's assets or an asset folder.
- `app ai-translation enable` accepts a specified disclaimer and installs AI Translations.
- `space plan` validates and previews a versioned setup file without making changes.
- `space apply` reconciles supported resources after explicit confirmation.
- `space setup plan` and `space setup apply` inspect and run `version: 1` blueprints.
- `language list` and `language add` inspect and idempotently configure space languages.
- `component list`, `get`, `create`, and `update` manage component schemas.
- `component field-add` adds a field to a component tab.
- `story tags plan` and `story tags assign` add tags to stories by full slug.
- `story publish` publishes the current draft of a story by full slug.
- `story create` creates a draft from a JSON definition at the root or in an existing folder.
- `story ai-translate` requests translations of a story's draft into selected languages using Storyblok AI.
- `story folder create` ensures a nested content folder path exists.
- `release list`, `get`, `create` and `publish` manage Storyblok content releases.
- `pipeline list`, `get` and `create` manage Storyblok Pipeline stages.
- `workflow list`, `workflow edit`, `workflow stage`, and `story workflow` inspect and configure workflows and assign stories.

Run any command with `--help` for an inline summary:

```bash
unblok space plan --help
```

## Repeatable setups

Define a space setup once in YAML, review it, and repeat it for another customer or environment. The `version: 1` blueprint format composes the same actions used by the CLI: duplicate a space, configure it, install apps, provision content, and assign workflows and tags.

Start with the [customer demo guide](examples/customer-demo/README.md) to understand the process and reusable steps, or use the [modular blueprint](examples/customer-demo/setup.yaml) to combine them. The following command runs from a source checkout; planning is local and does not require a token.

For smaller, independent examples of individual capabilities, see [feature examples](examples/features/). The demo's [alternatives](examples/customer-demo/alternatives/) include local asset uploads.

The modular blueprint enables space AI, accepts the AI Translations and Experiments disclaimers, and starts a demo experiment with simulated results. Review both disclaimer IDs and terms, the experiment configuration, and its publishing behavior before applying.

```bash
bun run start space setup plan --config examples/customer-demo/setup.yaml \
  --input 'space_name=Customer Demo' \
  --input 'asset_url=https://your-host.example/banner.png'
```

The URL above is a placeholder. The [setup guide](docs/space-setups.md) explains prerequisites, applying to a new or existing space, composition, and what happens on repeat runs. Blueprints use a local [JSON Schema](space-setup.schema.json) for editor support and CLI validation. Some operations are still awaiting live end-to-end verification.

The older `space-man/v1` format uses `space plan` and `space apply` and has different capabilities; see its [command reference](docs/commands.md#space-plan).

## Output philosophy

Interactive terminals use Clack for concise progress and status feedback. Commands produce human-readable summaries by default; add `--json` when output will be consumed by another program. Errors are written to stderr and return a non-zero exit code.

Use `unblok <command> --help` to discover options and examples for the installed version. Help is plain text, including when `--json` is also passed.

With `--json`, errors on stderr are JSON objects with an `error` containing `code`, `message`, `exitCode`, and, when available, the API HTTP `status`. For example, invalid command options use `INVALID_INPUT` and exit code `2`. Some failures also produce a JSON report on stdout with partial results; inspect both streams before retrying. Unclassified failures use `UNKNOWN`. Error messages may change, so automation should use the code and structured report instead of matching message text.

Blueprint schema and input validation errors also include an `issues` array on the error, with a `path` and `message` for each issue. For example, an unknown `setup.releases.create[0].release_in_day` can suggest `release_in_days`. Paths refer to the resolved blueprint; when using `extends`, they are not source file locations. Other errors may not include `issues`.

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
