# Demo space setup implementation checklist

Goal: run the [blokctl demo-space blueprint](https://github.com/Hi-Folks/blokctl/blob/main/examples/demo-space.yaml) through `unblok space setup`, using reusable actions and a repeatable, reviewable workflow. Unblok now applies a substantial supported subset through its modular customer demo; full compatibility and live repeat-run verification remain open.

## 1. Blueprint foundation

- [ ] Define and validate the complete version 1 schema, including nested fields, types, defaults, selectors, and unknown-option errors. Keep it distinct from `space-man/v1`.
- [x] Resolve declared string inputs from CLI values and defaults for plan and apply; reject missing or unknown inputs before writes.
- [x] Resolve `${{ inputs.* }}` and supported runtime references such as `${{ space.preview_token }}` without evaluating arbitrary code or exposing tokens in output.
- [ ] Extend local planning into an ordered, state-aware execution plan. The current plan validates and inventories operations without querying Storyblok; apply executes in dependency order and reports failures, partial results and JSON output.

## 2. Create the target space

- [x] Connect `space.name`, `duplicate_from`, `in_org`, and `demo` to the existing duplication action; support an explicit existing target for repeat runs without accidentally duplicating again.
- [ ] Implement bounded readiness polling using the blueprint settings, with clear timeout and failure behavior. Duplication polling is implemented; workflow availability must still be checked separately, as duplication completion alone may not mean workflows are ready.
- [x] Display the new space details and dashboard URL, with the existing post-duplication confirmation in interactive runs. Noninteractive creation requires explicit `--continue-after-duplicate`.

## 3. Configure the space

- [x] Reconcile `space.languages`, `preview.enabled`, the default preview URL and named environments using existing actions. Resolve the preview token at runtime and redact it in reports.
- [x] Apply `demo_mode.remove` and install apps by slug **and ID**, honoring `apps.continue_on_error` and reporting partial failures.
- [x] Accept an explicitly specified `ai_translation.disclaimer_id` and provision the AI Translations app, following the captured UI requests.
- [x] Configure `ai.enabled` and `ai.inherit_org_configuration` independently of AI Translations, using the captured space update.

## 4. Prepare content dependencies

- [x] Reconcile `components.fields`, including the custom SEO field and rich-text `customize_toolbar`, preserving undeclared schema properties.
- [x] Implement asset folder lookup/creation and `assets.upload_directory`, resolving sources relative to the blueprint file, honoring `include`, and reusing matching assets where safely identifiable.
- [x] Resolve story content `_find` asset references by search and folder; reject missing or ambiguous results when `require_unique` is set.

## 5. Reconcile content and workflows

- [x] Implement `stories.translated_slugs` and `stories.create`, including nested content, folders, release selection and resolved asset references. Existing stories are preserved where their state can be verified.
- [x] Support `workflow.assign_unstaged`, optional `stage_id`, and explicit story assignments by workflow and stage name. Handle delayed or missing default stages using the existing workflow action.
- [x] Integrate existing tag assignment after stories are available; preserve existing tags and report missing story selectors and partial failures.

## 6. Verify and document

- [ ] Expand fixture-based validation, planning, execution-order, retry, failure, and repeat-run tests to cover the entire representative YAML. Existing tests cover the modular customer demo schema and individual operation flows with mocked API responses.
- [ ] Test a complete setup in a disposable Storyblok space, inspect results in the UI, then rerun against that space to verify reconciliation and document any API-dependent behavior.
- [ ] Keep the documented supported subset and examples current, and mark the full blueprint supported only after end-to-end verification. Input overrides, local planning, apply commands, confirmation and partial reports are already documented.
