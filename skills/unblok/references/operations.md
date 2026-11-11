# CLI and library operations

Start with `unblok --version` and `unblok --help`, then inspect the relevant command's `--help`. Use the installed command, or the invocation the user specifies. Command availability and options depend on the installed version. The [command reference](https://github.com/Hi-Folks/unblok/blob/main/docs/commands.md) describes the current source; verify it against that version.

Help is plain text, even when `--json` is also supplied. Use it to discover options and examples; use JSON for supported operation results.

Inspect the target space before adapting a recipe when its details are missing. Depending on the task, use `unblok space list --json`, `unblok story get --ref <id-or-full-slug> --space-id <id> --json`, `unblok component get <name-or-id> --space-id <id> --json`, `unblok language list --space-id <id> --json`, or `unblok workflow list --space-id <id> --json`. Inspect the relevant command's help for further options. Use the returned story content and component schema to choose actual components, fields and block identifiers; do not infer them from a generic example.

Prefer `--json` when the relevant command supports it. Inspect the exit status and both streams: a failure can include a partial-results report on stdout and a JSON error on stderr. Do not claim that a queued background task has completed. Only execute changes the user has authorized, respecting any instructions about who runs commands.

For application or integration code, consult the [library guide](https://github.com/Hi-Folks/unblok/blob/main/docs/library.md) for exports, arguments, errors, and return values. The library takes credentials through application configuration; do not embed or print tokens. Use the installed library's version and types as the final authority.
