---
name: unblok-operations
description: Design, implement, or test reusable Storyblok operations exposed through the Unblok CLI, YAML provisioning, and JavaScript or TypeScript library.
---

# Unblok operations

When adding or changing an operation, consider all three ways consumers use the project: CLI commands, YAML provisioning, and the JavaScript/TypeScript library. Check which entry points already expose the operation and whether the request calls for adding it to others; do not assume every operation must be exposed everywhere.

Apply this guidance across resources, including workflow stage assignment, story tag assignment, story content updates, components, apps, and experiments. For example, tag assignment should use the same reusable action wherever it is exposed and should preserve consistent validation, tag merging, and partial-failure behavior unless an entry point documents an intentional difference.

Keep reusable, terminal-independent business logic in `src/actions/<resource>/` and Storyblok API calls behind the gateway. Commands parse arguments and present output; YAML code validates configuration and orchestrates actions; the library exposes documented functions and types without reading credentials, prompting, or writing terminal output. Prefer having entry points call the same actions rather than duplicating API sequences or validation.

Make differences in intent explicit. For example, an imperative command may replace a resource while YAML reconciliation preserves existing state. Document such differences and keep public library contracts clear about selections, side effects, idempotency, errors, and partial failures.

When behavior is shared, test the action's meaningful outcomes and add entry-point coverage appropriate to the change. Verify that equivalent CLI, YAML, and library requests reach compatible behavior, including invalid input, relevant API failures, partial results, and repeat runs where applicable. Test deliberate differences as well; do not require identical output formatting or add redundant tests merely to mirror implementation.
