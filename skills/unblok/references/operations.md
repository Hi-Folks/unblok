# CLI and library operations

Start with `unblok --version` and `unblok --help`, then inspect the relevant command's `--help`. Use the installed command, or the invocation the user specifies. Command availability and options depend on the installed version. The [command reference](https://github.com/Hi-Folks/unblok/blob/main/docs/commands.md) describes the current source; verify it against that version.

Help is plain text, even when `--json` is also supplied. Use it to discover options and examples; use JSON for supported operation results.

Inspect the target space before adapting a recipe when its details are missing. Depending on the task, use `unblok space list --json`, `unblok story get --ref <id-or-full-slug> --space-id <id> --json`, `unblok component get <name-or-id> --space-id <id> --json`, `unblok language list --space-id <id> --json`, or `unblok workflow list --space-id <id> --json`. Inspect the relevant command's help for further options. Use the returned story content and component schema to choose actual components, fields and block identifiers; do not infer them from a generic example.

To discover stories, use `unblok story list --help` for filters such as `--starts-with`, `--search`, `--text-search`, `--component`, `--tag`, and publication state. The list is metadata; retrieve individual stories to inspect content.

Use `unblok story compare-languages --ref <story-id-or-full-slug> --language <space-language-code> --json` to compare stored field-level values for fields marked translatable in the component schema. Repeat `--language` for multiple configured additional languages. Missing stored values may use a fallback; equality does not determine translation quality. This does not compare separate folder-level stories.

Use `unblok story versions --ref <id-or-full-slug> --json` to inspect history metadata, then `unblok story compare-versions --ref <id-or-full-slug> --from <version-id> --to <version-id> --json` to compare stored content. The current endpoint excludes versions created on or before August 28, 2024. Comparison fetches paginated history with content and compares arrays by index, so moved blocks can appear as several changes.

For the latest change against the current draft, use `unblok story compare-versions --ref <id-or-full-slug> --previous --json`. The command identifies preceding non-release history using timestamps and whether the newest stored content matches the draft; inspect `from` and `selection` in the result. It includes workflow-stage snapshots, which may have identical content, and fails when the relevant order cannot be determined. It does not compare unsaved editor state.

Prefer `--json` when the relevant command supports it. Inspect the exit status and both streams: a failure can include a partial-results report on stdout and a JSON error on stderr. Do not claim that a queued background task has completed. Only execute changes the user has authorized, respecting any instructions about who runs commands.

For application or integration code, consult the [library guide](https://github.com/Hi-Folks/unblok/blob/main/docs/library.md) for exports, arguments, errors, and return values. The library takes credentials through application configuration; do not embed or print tokens. Use the installed library's version and types as the final authority.
