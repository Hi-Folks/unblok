# YAML blueprints

Use a `version: 1` blueprint for repeatable setups. Adapt a maintained [example](https://github.com/Hi-Folks/unblok/tree/main/examples), using only fields supported by the installed version; consult the [blueprint guide](https://github.com/Hi-Folks/unblok/blob/main/docs/space-setups.md) and [schema](https://github.com/Hi-Folks/unblok/blob/main/space-setup.schema.json). Match story content to the target space's actual component schema. Parameterize values that change between runs with blueprint inputs.

Review locally with `unblok space setup plan --config setup.yaml` and provide required `--input` values. Planning validates and inventories the configuration; it does not query the target space, predict changes, or check all runtime dependencies.

For an authorized apply to an existing space, pass its explicit `--space-id` and required inputs. An apply without `--space-id` can duplicate a new space when the blueprint specifies a source. `--yes` bypasses interactive confirmation; use it only when consistent with the user's authorization and instructions.

Apply can partially succeed and does not roll back earlier operations. Check the report before retrying against the same space. Repeat behavior varies by operation: for example, existing releases may be preserved, while applying AI translation again submits new requests. Queued translations are not finished translations, and later operations must not assume completion. See the blueprint guide for details.
