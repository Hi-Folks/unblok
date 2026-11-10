# CLI and library operations

Start with `unblok --version` and `unblok --help`, then inspect the relevant command's `--help`. Use the installed command, or the invocation the user specifies. Command availability and options depend on the installed version. The [command reference](https://github.com/Hi-Folks/unblok/blob/main/docs/commands.md) describes the current source; verify it against that version.

Prefer `--json` when the relevant command supports it. Inspect the exit status and the result: a report can contain partial successes and failures. Do not claim that a queued background task has completed. Only execute changes the user has authorized, respecting any instructions about who runs commands.

For application or integration code, consult the [library guide](https://github.com/Hi-Folks/unblok/blob/main/docs/library.md) for exports, arguments, errors, and return values. The library takes credentials through application configuration; do not embed or print tokens. Use the installed library's version and types as the final authority.
