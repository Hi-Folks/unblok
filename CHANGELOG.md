# Changelog

## 0.6.2 - WIP

### Added

- Document positional story synchronization with CLI, YAML and JavaScript examples.
- Preview and copy a story block or field by position using a JSON Pointer through the CLI, YAML and JavaScript library.

### Changed

- Show common goals, recipe discovery and AI skill installation in top-level CLI help.
- Expand the Dimensions recipe with coverage and missing-variant workflows.

## 0.6.1 - 2026-11-15

### Added

- Combine country-folder setup and missing article variants in a modular Dimensions demo YAML example.
- Plan and create missing Dimensions variants for a source folder through the CLI, YAML and JavaScript library.
- Report Dimensions variant coverage for stories under a selected folder via the CLI and JavaScript library.
- Show Dimensions coverage results as each story is checked, with an optional library progress callback.
- Highlight linked and missing Dimensions variants in terminal output.

### Changed

- Add editor descriptions to setup schema sections and common operations.
- Compare all configured Dimensions folders by default when no explicit folders are selected.
- Show live progress while discovering and creating missing Dimensions variants.

### Fixed

- Create missing Dimensions variants for start pages whose full slugs end in a slash.

## 0.6.0 - 2026-11-14

### Added

- Preview and update all story blocks matching an exact field condition via the CLI, YAML and JavaScript library.
- Preview and synchronize selected block fields between stories through the CLI, YAML and JavaScript library.
- Document the Dimensions comparison and selected-field synchronization workflow with a complete recipe.
- Bundle a parameterized Dimensions field synchronization recipe for local agent and CLI discovery.
- Bundle and document a Dimensions country-folder migration recipe.
- Copy draft story content to an exact target slug using YAML and the JavaScript library.
- Request a Dimensions merge between stories by ID or full slug through the CLI and JavaScript library.
- Add `--verbose` for safe error diagnostics, including the Dimensions duplication operation and response shape.
- List Dimensions folders and create linked story variants through shared actions, the CLI, and YAML setup.
- Compare linked Dimensions story variants across root folders using the CLI and JavaScript library.
- Move a story by full slug into an existing folder with the CLI and JavaScript library.
- Organize root-level stories and folders into a destination using YAML and the shared library action.
- Configure Dimensions folder selection in YAML and the JavaScript library.
- Filter story lists by content fields using repeatable CLI `--field` options and the library's `fieldFilters` input.

### Changed

- Present Dimensions comparisons as a labeled summary table with content differences below it.
- Show labeled, width-aware tables for Dimensions folders, stories, story versions, apps, releases, and pipeline stages.

### Fixed

- Match the Dimensions UI duplication request when creating linked variants.
- Preserve recognized, non-sensitive Storyblok validation details in shared action errors.

## 0.5.1 - 2026-11-11

### Added

- Compare a current story draft with preceding saved content using `story compare-versions --previous` and the JavaScript library.
- List story version history and compare version content through the CLI and JavaScript library.
- Compare stored field-level story translations against default content using the CLI or JavaScript library.
- List and filter non-folder stories from the CLI and JavaScript library using Management API queries.

### Fixed

- Follow story version pagination headers when Storyblok returns fewer entries than requested, and explain missing previous-history results.
- Include non-release workflow-stage history snapshots when comparing a draft with its previous version.

## 0.5.0 - 2026-11-11

### Added

- Install the version-matched Unblok skill for Codex or Claude Code with `unblok skill install --agent <codex|claude>`.
- Include shared error codes and optional HTTP status for failed YAML operations, with per-language details for all-languages translation failures.
- List and print version-matched blueprint examples locally with `space setup examples` and `space setup example`.
- Add `bun run buildexe` to compile a local standalone CLI executable for the current platform.
- Print the installed CLI's blueprint JSON Schema locally with `space setup schema`.
- Add an Unblok skill for AI coding agents, with guidance for CLI operations, YAML blueprints, the JavaScript library, translation, and campaign preparation.
- Include individual blueprint validation issues with paths and messages in JSON errors.

### Changed

- Emit structured CLI errors on stderr in `--json` mode, while keeping partial-result reports on stdout.
- Make blueprint validation errors more actionable with clearer missing-field and conflicting-field messages and suggestions for similar property names.
- Clarify setup, release, and AI translation command help, including examples and important side effects.
- Describe translation requests as processed rather than finished when background tasks may still be running, and report specific invalid option combinations.
- Document how to install the Unblok skill for Codex and Claude Code.

## 0.4.0 - 2026-11-10

### Added

- Publish a Storyblok release explicitly through the CLI, YAML and library, with publication-state checks.
- Retrieve an individual Storyblok release or Pipeline stage by ID or exact name through the CLI and library.
- Add a campaign launch recipe combining a release, asset, landing page, home-page change and editorial organization.
- Add a local webhook integration example for requesting translation when a story enters a workflow stage.
- Add an AI translation and editorial review recipe covering the CLI, YAML and library.
- Support passing an AI translation story ID through YAML inputs and document an event-driven recipe.
- Allow YAML AI translation to resolve stories by slug and include home translation in the customer demo.
- Show a separate progress step for each main setup operation, including translation requests.
- Edit workflow names, content types and language-based stages through the CLI, YAML and library.
- Translate story content with Storyblok AI through the CLI, YAML and library, with per-language results, draft saves, and an option to use all configured additional languages.
- Optionally enable language-based workflow stages and move accepted translations to an existing review stage per language.
- Support creating and editing stories in a selected Storyblok release through the CLI, YAML and library. YAML can refer to a release by name, including one created by the same setup.
- Add nested content folder creation to the CLI, YAML and library, reusing existing folders on repeat runs.
- Support creating draft stories inside existing folders through the CLI, YAML and library using a full slug.
- Add Pipeline stage listing and creation through the CLI and library, plus a modular YAML recipe for a `Go Live` stage.

## 0.3.2 - 2026-11-09

### Added

- Add CLI and library operations to list and create Storyblok content releases with optional scheduling, checking for the Releases app first.
- Add YAML release provisioning and relative schedules expressed as a number of days for the CLI and library.
- Add a library action to create root-level draft stories using the same creation behavior as YAML provisioning.
- Add a library action to publish a story's current draft by exact full slug, skipping stories already published without pending changes.
- Add `story publish` to publish a story by full slug from the CLI using the same action as the library.
- Add `story create` to create root-level draft stories from JSON using the shared story creation action.

## 0.3.1 - 2026-11-08

### Added

- Add a library action to reconcile translated story slugs using the same logic as YAML provisioning.
- Add a library action to install apps by slug and a region override for space-scoped CLI and YAML operations.
- Add CLI and library asset uploads with optional nested folder creation, shared with YAML asset reconciliation. Identical files are reused; conflicting files are not replaced.

### Changed

- Explain how to create and configure a Storyblok Management API token when credentials are missing or rejected.

## 0.3.0 - 2026-11-08

### Changed

- Support Node.js 22.21.0 and newer for the CLI and library; Bun remains supported.
- Test the built CLI and library with Node.js in CI, alongside Bun tests and packed-package checks.

### Fixed

- Load `.env` from the working directory when the CLI is run through `bunx --bun`.
- Clarify experiment command availability and the verification status of the demo workflows.

## 0.2.0 - 2026-11-08

### Changed

- Prepare a single JavaScript npm package with the CLI and library for Node.js 26 and Bun, replacing platform-specific executable packages. Bun remains the development and build runtime.

## 0.1.6 - 2026-11-08

### Added

- Manage Storyblok Experiments through CLI commands and YAML blueprints, including variant story creation, content updates, activation, and simulated results.
- Add an experiment recipe to the combined customer demo setup.
- Add an initial Bun/TypeScript library API for workflow and tag assignment, story block updates, and component field reconciliation, with structured errors and partial-failure reports. Include the library in the npm release package alongside the CLI.
- Add CI checks for formatting, type checking, and tests.
- Add `space list --limit <n>` to show the most recently created matching spaces.

### Changed

- Share story block reconciliation between YAML provisioning and the library.

## 0.1.3 - 2026-11-07

Initial test alpha release
