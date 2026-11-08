# Repository Guidelines

## Project Structure & Module Organization

This is a Bun and TypeScript project with CLI, YAML provisioning, and library entry points. `index.ts` is the thin executable entry point. Put command groups in `src/commands/<resource>/`, reusable operations in `src/actions/<resource>/`, dispatch code in `src/cli/`, configuration readers in `src/config/`, API adapters in `src/storyblok/`, and guides in `docs/`. Commands should parse and present; actions must remain independent of terminal I/O so the YAML runner and library can call them. For operation design and cross-entry-point tests, follow [the Unblok operations skill](skills/unblok-operations/SKILL.md). Keep tests beside their subjects as `*.test.ts`. Do not edit `node_modules/` or commit `dist/`.

## Build, Test, and Development Commands

- `bun install` installs dependencies from `bun.lock`.
- `bun run start` runs the utility locally.
- `bun run dev` reruns it during development when files change.
- `bun run typecheck` performs the strict TypeScript check configured by `tsconfig.json`.
- `bun test` runs Bun's native test suite.
- `bun fmt` formats supported source files.
- `bun run build` bundles the CLI into `dist/`.

Use Bun for development, testing, quality checks, and builds. Published CLI and shared library runtime code must work with Node.js as well as Bun; use runtime-compatible APIs instead of Bun-only globals in those paths. Validate the packed CLI under Node.js and Bun. The CLI may load `.env`, but library actions must not read environment variables or prompt.

## Coding Style & Naming Conventions

Write ES modules and preserve explicit TypeScript types at public boundaries. The compiler uses strict mode, `noUncheckedIndexedAccess`, and `noImplicitOverride`; handle possibly missing indexed values instead of asserting them away. Follow the formatter's output, use two-space indentation, `camelCase` for variables and functions, `PascalCase` for types and classes, and descriptive kebab-case filenames such as `space-client.ts`. Keep modules focused and avoid unused dependencies.

## Testing Guidelines

Use `bun:test` and name files `*.test.ts`. Cover successful behavior, invalid inputs, and API failures; add a regression test for every bug fix. Run `bun test` and `bun check` before submitting changes.

## CLI Output Guidelines

Route user-facing messages through `src/output.ts`. Use Clack for concise human feedback, validate before API calls, and handle every interactive cancellation. Reveal complex choices in small steps with clear defaults. Keep `--json` free of prompts, spinners, and decorative text so scripts receive stable data.

## Commit & Pull Request Guidelines

Git history is unavailable in this checkout. Use concise, imperative subjects such as `Add space lookup command`. Pull requests should explain the change, list validation commands, link issues, and include terminal output for CLI changes.

## Security & Configuration

Never commit Storyblok tokens, space IDs, or populated `.env` files. Document variables in `.env.example` with placeholders, and never log credentials or sensitive API responses.
