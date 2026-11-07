---
name: unblok-blueprint
description: Extend or fix Unblok version 1 space setup blueprints, including YAML schema, composition, reconciliation, and execution reports. Use when implementing or changing space setup behavior.
---

# Space setup changes

Use the existing blueprint workflow; distinguish `space setup` (`version: 1`) from the older `space plan` / `space apply` (`space-man/v1`). Read `docs/space-setups.md` for current behavior and `docs/commands.md` for the contract.

1. Inspect related actions in `src/actions/` and the gateway in `src/storyblok/gateway.ts`; reuse or extract an action without terminal I/O. Keep API details in the gateway. Do not infer API behavior from an unrelated endpoint; verify official documentation or a captured request, and note when behavior lacks live verification.
2. Update `space-setup.schema.json`, `src/setup/blueprint.ts` inventory, validation/compilation in `src/setup/blueprint-apply.ts`, and execution together. Preserve accepted configs and existing output contracts unless the user requests a breaking change. Reject unsupported fields before writes.
3. Reconcile only declared state, preserve unmanaged resources, and skip matching state when the API provides enough information. Never claim idempotency when the state cannot be verified. Make potentially significant settings explicit; space AI and AI Translations are separate capabilities.
4. Register all planned operations in the report, including failures and work not run after a stop. Preserve accurate exit codes and JSON; partial changes are not rolled back. Verify failure and repeat-run behavior.
5. Preserve `extends` and input semantics in `src/setup/blueprint-loader.ts` and `blueprint-validation.ts`. Includes are relative to the declaring file; operation lists append, other lists replace, repeated includes are visited once, and cycles fail. Asset paths are rebased; runtime preview-token references resolve only during apply. `plan` is local validation/inventory, not a remote diff.
6. Add a small example where useful under `examples/features/` or a customer-demo step under `examples/customer-demo/steps/`. Keep `examples/customer-demo/setup.yaml` the single combined demo; update its guide if the demo changes. Update `docs/commands.md`, `docs/space-setups.md`, and schema examples when applicable.

Run focused tests for schema/validation, action behavior, reporting and API payloads as appropriate; then `bun test` and `bun run typecheck`. Use mocked requests by default and report whether live Storyblok behavior has been verified. Do not launch a live apply just to test a change without user authorization.
