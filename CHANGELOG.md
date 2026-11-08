# Changelog

## 0.3.2 - WIP

### Added

- Add a library action to create root-level draft stories using the same creation behavior as YAML provisioning.
- Add a library action to publish a story's current draft by exact full slug, skipping stories already published without pending changes.
- Add `story publish` to publish a story by full slug from the CLI using the same action as the library.

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
