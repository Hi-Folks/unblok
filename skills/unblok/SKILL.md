---
name: unblok
description: Use Unblok to manage Storyblok content and spaces through CLI commands, YAML blueprints, or the JavaScript library. Use when a user wants to perform or automate Storyblok operations with Unblok.
---

# Use Unblok

Choose the interface that fits the user's goal: the CLI for individual operations, a YAML blueprint for a repeatable multi-step setup, or the JavaScript library when integrating operations into application code. Prefer an existing Unblok operation to assembling raw Storyblok API calls. Follow the user's choice when specified.

Check the installed version and relevant command help before choosing flags; capabilities may differ from the latest documentation. Use `--json` where supported for machine-readable results. For details, read only the relevant reference:

- [CLI and library](references/operations.md): discover operations, interpret results, and use the library.
- [YAML blueprints](references/blueprints.md): compose, plan, apply, and repeat setups.
- [Recipes](references/recipes.md): translation and review, and campaign preparation.

Use the user's intended space and region; do not invent IDs, component schemas, language codes, or settings. Obtain missing information from available configuration or read-only commands, or ask the user. Never expose tokens in output or put them in generated files.

Respect the user's instructions and authorization for execution. A plan is local validation and an inventory, not a comparison against the live space. Apply and other write commands change Storyblok; report completed, unchanged, failed, and not-run work based on their actual output. Check operation-specific repeat behavior before retrying. A queued background task is not a completed translation.
