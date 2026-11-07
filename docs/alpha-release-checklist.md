# Alpha release checklist

The goal is an initial release that other people can install, try, and report issues against. Keep the scope focused on the documented commands and the version 1 space setup workflow.

## Current verification

- [x] Automated tests: `bun test` (181 passed on 2026-11-07).
- [x] Type check: `bun run typecheck` (2026-11-07).
- [x] Bundle: `bun run build` (2026-11-07).
- [ ] Complete the live setup and repeat-run checks below. The AI Translations app was installed successfully during manual testing; the complete workflow and its repeat behavior still need verification.
- [ ] Make the configured repository accessible and test a fresh clone and dependency download. A source copy without `.env` or `node_modules` passed frozen-lockfile installation, version, and help checks using the local Bun cache; the package remains private.
- [x] Add a CLI version display (`bun run start --version`).
- [x] Add the MIT license.
- [ ] Prepare release notes.
- [ ] Run tests, type checking, and a build in CI; add binary smoke tests if distributing executables.
- [ ] Review the supported scope, limitations, command help, and documentation links. Remove unused release dependencies if appropriate.

## Live setup verification

Use a disposable space duplicated from the demo source, a token with appropriate access, and the [customer demo guide](../examples/customer-demo/README.md). The examples depend on the source space's components and stories. Review the AI disclaimer and organization inheritance settings before applying them.

1. Plan [the combined blueprint](../examples/customer-demo/setup.yaml) locally. Confirm the resolved inputs and operations; planning does not inspect Storyblok or predict changes.
2. Create a test space with step 01, or reuse the disposable space already created for this test. Record its ID privately. Never rerun step 01 without `--space-id` unless you intend to create another space.
3. Apply steps 02–10 to that same ID one at a time. After each step, compare the report with the Storyblok UI. Step 05 uses a remote image; [the local-assets alternative](../examples/customer-demo/alternatives/local-assets.yaml) can replace it for individual testing. Step 06 requires the banner and compatible source content. Step 10 accepts the specified AI Translations disclaimer.
4. Repeat each applicable step on the same space and check that already matching resources are skipped or unchanged. Record exceptions rather than assuming every operation is idempotent.
5. Apply the combined blueprint to a fresh disposable space, inspect the results, and repeat it with that space's explicit ID. The combined blueprint uses the remote asset step; supply a reachable `asset_url` if its default is unsuitable. Confirm that success, skipped items, failures, and not-run operations match what happened.
6. Inspect JSON output and exit codes, including a controlled failure. Confirm a failed run reports the cause and any partial changes, then resume with the same space ID.

Changes from earlier steps are not rolled back if a later step fails. Never put tokens or personal space IDs in this checklist; keep any detailed test record private.

## Release decision

Publish an alpha only after the chosen installation works, its supported behavior and known limitations are documented, and the live results are understood. Release notes should distinguish verified capabilities from those covered only by mocked tests. Additional resource commands and interactive tables can follow the alpha.
