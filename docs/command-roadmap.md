# Command Roadmap

This roadmap turns the operations needed by a representative demo-space setup into focused commands and reusable actions. Names are directional, not a frozen public interface.

For the ordered implementation checklist for the full demo YAML, see [Demo space setup implementation checklist](space-setup-todo.md).

## Command pattern

Resources should use predictable verbs:

```text
<resource> list
<resource> get <id-or-name>
<resource> create ...
<resource> update <id-or-name> ...
<resource> delete <id-or-name> ...
```

Domain verbs such as `publish`, `install`, `assign`, and `upload` are appropriate when CRUD would hide intent. A setup runner will call application actions directly; it will never invoke CLI commands as subprocesses.

## Capability backlog

| Area                  | Standalone operations                                                  | Setup responsibility                                                               |
| --------------------- | ---------------------------------------------------------------------- | ---------------------------------------------------------------------------------- |
| Spaces                | create, duplicate, get, update settings, inspect readiness             | Select an existing target or create/duplicate one, then wait until ready.          |
| Languages             | list, add, remove                                                      | Ensure additions before content changes; run explicit removals last.               |
| Components            | list, get, create, update, manage folders and fields                   | Reconcile component definitions by stable name and preserve undeclared properties. |
| Datasources           | list, create, update, manage dimensions and entries                    | Ensure datasources and reconcile declared entries, including file imports.         |
| Stories               | list, get, create, update fields, insert components, publish/unpublish | Validate content against component schemas before mutation.                        |
| Assets                | list, manage folders, upload local files or URLs                       | Reuse matching assets and resolve symbolic references in story content.            |
| Internal tags         | list, create, update, assign                                           | Ensure tags before assigning them to content or components.                        |
| Workflows             | list, inspect, create/update stages, assign stories                    | Reconcile stages and assignments by name rather than transient IDs.                |
| Roles                 | list, get, create/update permissions                                   | Resolve paths, languages, workflows, and other references before applying roles.   |
| Apps and integrations | list, install, configure, uninstall                                    | Install dependencies before applying settings; mask secret values.                 |
| Preview and hooks     | inspect/update preview URLs, routes, and webhooks                      | Reconcile declared endpoints without exposing credentials.                         |

## Implementation order

1. Add read-only list/get commands for each resource.
2. Add reusable actions for safe create and update operations.
3. Return structured `planned`, `created`, `updated`, `skipped`, and `failed` results.
4. Add local validation and dependency resolution between resources.
5. Compose proven actions through `space setup validate`, dry-run, and apply workflows.
6. Add explicitly requested removal actions after reconciliation is reliable.

## Definition of done for an operation

An operation is ready for setup composition when it has typed input and output, validation before API calls, deterministic lookup rules, human and JSON presentation, mocked unit tests, documented failure behavior, and no dependency on terminal prompts inside its core action.
