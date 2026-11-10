# Changelog

## 0.3.3 - WIP

### Added

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
