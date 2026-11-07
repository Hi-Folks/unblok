# Project Direction

## The goal

Individual commands solve immediate tasks and establish reliable Management API operations. Versioned setup blueprints compose reusable operations into repeatable space setups stored as YAML or JSON.

The current blueprint workflow starts with:

```bash
unblok space setup plan --config customer.yaml
unblok space setup apply --config customer.yaml --space-id 123456 --yes
```

The older `space-man/v1` format uses `space plan` and `space apply` and has different capabilities. Additional resources should evolve from reusable actions rather than duplicated API logic.

## Design principles

- **One operation, multiple callers.** CLI commands and setup execution must call the same reusable action, not duplicate API logic.
- **Desired state over scripts.** Repeated runs should skip matching state, update declared differences, and preserve unmanaged resources.
- **Validate before mutation.** Parse and schema errors, missing dependencies, and content-shape problems should be reported together before writes begin.
- **Plan before apply.** Every setup should support a readable dry-run plan without creating or modifying a space.
- **Explicit removals.** Nothing is deleted because it is absent from a config. Requested removals run last and are clearly identified.
- **Safe composition.** Setups support reusable base files and declared inputs; do not assume conditional sections or environment-backed secrets are implemented.
- **Stable reports.** Human output may be expressive; JSON plans and results need versioned, predictable shapes.
- **Recoverable failures.** Partial execution must report created, updated, skipped, and failed operations without hiding external state.

## Architectural consequences

Command modules should parse arguments and present results. Reusable application actions should own orchestration and return structured results. The Storyblok gateway should remain the only layer that understands the API client. Core actions must not depend on prompts, colors, or terminal streams, allowing them to run from commands, setup files, tests, and future integrations.

Space duplication also needs a readiness step before dependent setup actions begin. A successful create response does not necessarily mean the copied space is ready for further mutations.

## Staged roadmap

1. Build and verify focused resource commands.
2. Extract reusable actions and structured operation results.
3. Introduce a versioned setup schema and local validation.
4. Add planning and dry-run output.
5. Add idempotent reconcile execution and JSON reports.
6. Add composition, inputs, secret masking, assertions, and export workflows.

The resource-by-resource sequence is tracked in the [command roadmap](command-roadmap.md).
