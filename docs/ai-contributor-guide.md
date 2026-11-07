# AI contributor guide

Unblok is a Bun/TypeScript CLI for practical Storyblok Management API operations and repeatable, version-controlled space setups. Prefer small, composable changes that work both interactively and in automation.

## Start with the existing implementation

- Read the relevant command, action, gateway method, tests, and user-facing docs before designing a change. `index.ts` dispatches via `src/cli/`; `src/commands/` handles arguments and presentation; `src/actions/` owns reusable operations; `src/storyblok/` isolates API access; `src/setup/` composes blueprint execution.
- Reuse actions between CLI commands and setup execution. Return structured results from actions; keep prompts, colors, and streams outside them. Follow existing patterns rather than creating a framework for one command.
- Use the `unblok-blueprint` skill at `.claude/skills/unblok-blueprint/SKILL.md` for version 1 setup changes. See `docs/commands.md` for command contracts and `docs/space-setups.md` for setup behavior. The customer demo guide is `examples/customer-demo/README.md`.

## API and mutation behavior

- Validate inputs and known dependencies before writes. Reconcile explicitly declared settings, preserve unmanaged state, and avoid assuming absent response properties mean a resource is missing. Do not delete resources simply because a config omits them.
- Preserve the gateway's shared rate limiting and retry policy. It defaults to six requests per second and retries explicit HTTP 429 responses; do not blindly retry ambiguous network or server failures for non-idempotent writes. Confirm actual endpoint behavior and payloads before adding operations.
- Space duplication can complete asynchronously; retain readiness checks and the post-duplication confirmation where applicable. A successful earlier operation is not rolled back after a later failure: report completed, skipped, failed, and not-run work accurately.
- Respect the user's authority for live operations. Keep tokens and sensitive responses out of output and tests; don't expose preview tokens. Review Storyblok app/disclaimer and AI inheritance changes explicitly in configs and documentation.

## Output and documentation

- Preserve flags, exit codes, and JSON shape; JSON stdout must contain no progress, prompts, or ANSI. Use `src/output.ts`, Clack, and native `styleText` for human output. Separate partial success from success and keep errors actionable.
- Keep lists readable, preserve meaningful information, and test narrow and non-interactive output when changing rendering. Avoid new presentation dependencies unless justified; inspect and test the library in Bun first. Do not assume an interactive table library works correctly with terminal cleanup or colors.
- Maintain concise command help, `docs/commands.md`, and relevant examples as behavior changes. Keep README focused on purpose and entry points; put detailed instructions in `docs/`. Label placeholders and distinguish mocked tests from live verification.

## Verification

Use focused `bun test` cases for changed behavior, then run `bun test` and `bun run typecheck`; use `bun run build` when bundling matters. Add meaningful regression tests for API payloads, validation, retries, partial failures, repeat runs, JSON, and terminal behavior as relevant. Do not run real Storyblok mutations merely to validate a change unless authorized. Do not commit `dist/`, `.env`, credentials, or user-specific paths.
