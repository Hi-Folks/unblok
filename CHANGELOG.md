# Changelog

## 0.2.0 - 2026-11-20

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
