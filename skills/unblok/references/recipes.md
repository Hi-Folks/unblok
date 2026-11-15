# Goal-oriented workflows

Use the installed Unblok version, the user's chosen interface, and the actual space configuration. Check relevant command help and use `--json` for supported results. The interactive `unblok guide` is for human terminal use; agents should use the underlying commands below, which work without prompts. Replace placeholders with verified values; do not type the angle brackets into a shell.

Discover version-matched local YAML with `unblok space setup examples --json` and `unblok space setup example <name>`. The current bundled names include `dimensions-country-setup`, `dimensions-sync-field`, `translation-review`, and `campaign-launch`. Check the installed list rather than assuming a newer example exists. GitHub documentation tracks the main branch and can be newer than the installed CLI.

## Find and fill missing country variants

1. Inspect configured roots with `unblok dimensions list --space-id <space-id> --json`, then run `unblok dimensions coverage --starts-with <source-folder/> --space-id <space-id> --json`. Add repeatable `--folder` to select destinations. Coverage follows linked alternates; `missing` does not rule out an unrelated story with the same slug.
2. For requested creation, run `unblok dimensions create-missing --starts-with <source-folder/> --folder <destination> --space-id <space-id> --plan --json`. This reads the space and previews individual operations. After review, apply with `--yes` only within the user's authorization. Existing links are skipped; sources need group IDs. Stop and inspect the report and any unconfirmed target before retrying after a failure.

## Compare and copy country content

1. Compare a source story with `unblok story compare-dimensions --ref <source> --space-id <space-id> --json`. It returns raw draft differences with JSON Pointer paths; arrays are compared by position, so a moved block can produce multiple differences.
2. For a requested positional copy, use `unblok story sync-path --source <source> --target <target> --path <pointer> --plan --space-id <space-id> --json`. The exact same path selects positions in both stories, not matching UIDs. Review `before` and `after`, particularly after reordering; a block copy replaces the complete target block and preserves source and nested UIDs. Missing paths and duplicate UIDs fail. For UID-selected component fields instead, use `story sync-block --help`. Apply with `--yes` only within the user's authorization.
3. For a repeatable setup, inspect `unblok space setup schema --json` for `stories.sync_paths` or `stories.sync_blocks`. The `dimensions-sync-field` bundled recipe uses field selection; it is not a positional path example. YAML plan does not preview live content.

## Prepare an AI translation

1. Find the story ID and configured space languages using `unblok story get --ref <story> --space-id <space-id> --json` and `unblok language list --space-id <space-id> --json`. Verify language and optional review-stage choices; do not infer component fields or language codes.
2. When authorized, use `unblok story ai-translate --id <story-id> --language <ai-code:space-code> --space-id <space-id> --yes --json`; repeat `--language` or use `--all-languages`. Check help for `--review-stage` and workflow options. Accepted translation requests may still be running in the background; review-stage assignment can happen on acceptance, not completion. Retrying submits new requests. Report each queued, failed, and review result separately.
3. For a webhook or repeatable YAML handoff, retrieve `translation-review` using `unblok space setup example translation-review`, inspect its inputs and local schema, then adapt it to the event. A webhook receiver is a separate integration.

## Prepare a demo space

1. Ask for or inspect the intended target, template and region if not already known. Use `unblok space setup examples --json` to discover local examples. `dimensions-country-setup` organizes country folders; `campaign-launch` prepares a campaign release and content. Retrieve the selected example using `unblok space setup example <name>` and adapt it to the actual space. Inspect component schemas and content before selecting fields.
2. For a combined Dimensions demo from a matching checkout, `examples/features/setup-dimensions-demo.yaml` extends the country-folder and missing-variant files. It is not a standalone bundled example. Its app ID `24` is confirmed for EU; verify the target region. It expects `site-config` and source stories with group IDs. Dimensions folder configuration replaces the selection; moving root content changes slugs. On rerun, newly added root entries may also move.
3. Validate with `unblok space setup plan --config <file>` and any required inputs. This is a local inventory, not a live diff or a prediction of moved content. For an authorized existing-space apply, pass `--space-id`; without it, a blueprint with a duplication source can create a new space. Inspect partial reports before retrying.

Detailed guides: [Dimensions setup](https://github.com/Hi-Folks/unblok/blob/main/docs/recipes/dimensions-country-setup.md), [compare and synchronize](https://github.com/Hi-Folks/unblok/blob/main/docs/recipes/dimensions-compare-and-sync.md), [translation and review](https://github.com/Hi-Folks/unblok/blob/main/docs/recipes/ai-translation-review.md), and [campaign launch](https://github.com/Hi-Folks/unblok/blob/main/docs/recipes/campaign-launch.md). Prefer local references matching the installed version where available.
