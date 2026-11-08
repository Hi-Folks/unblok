# Command Roadmap

This roadmap turns the operations needed by a representative demo-space setup into focused commands and reusable actions. Names are directional, not a frozen public interface.

For the ordered implementation checklist for the full demo YAML, see [Demo space setup implementation checklist](space-setup-todo.md).

## Suggested next implementations

This is a prioritized backlog, not a promise that every operation will be exposed through all three interfaces. Confirm the use case and API behavior before implementation. A shared action should serve the CLI, YAML runner, and library wherever the operation is exposed.

1. **[ ] Create a story from the CLI.** Add `story create` using the existing story creation action, accepting a JSON definition and an explicit `--yes`. The library and YAML already create root-level drafts and preserve an existing story with the same slug. Document the input and test validation, existing stories, errors, and JSON output.
2. **[ ] Create a Storyblok release.** Add a shared operation, CLI command, and library API for creating a release; consider YAML provisioning for repeatable demo setups. Inspect installed-app requirements and available release fields before implementation. Review matching and conflict rules before claiming repeat-run safety; do not implicitly schedule or publish a release. This is a Storyblok content release, separate from an Unblok npm or GitHub release. [Storyblok create-release API](https://www.storyblok.com/docs/api/management/releases/create-a-release).
3. **[ ] Create a Pipeline branch.** Add a shared operation, CLI command, and library API; evaluate YAML support for repeatable environment setups. Verify Pipeline availability, source branch selection, branch URL, position, required fields, and behavior across regions. Define how to resolve existing branches and conflicts before enabling reconciliation. A Pipeline branch is a Storyblok resource, not a Git branch. [Storyblok create-branch API](https://www.storyblok.com/docs/api/management/pipelines/create-a-branch).
4. **[ ] Inspect releases and Pipeline branches.** Add list/get capabilities as needed to choose existing resources, support the creation workflows, and make failures easier to diagnose. Determine whether these are prerequisites for safe reconciliation in items 2 and 3.
5. **[ ] Create stories in folders.** Extend story creation beyond the current root-level limitation when needed. Define parent-folder selection and full-slug matching, and preserve existing stories on repeat runs. Evaluate CLI, YAML, and library support together.
6. **[ ] Manage assets from the CLI and library.** Evaluate read-only asset listing and explicit folder operations to complement uploads. Keep exact matching and content-based upload reconciliation consistent with YAML.

For each item, keep the action independent of terminal I/O, validate inputs before writes, document side effects and repeat-run behavior, and cover relevant entry points with mocked tests. Verify live Storyblok behavior only when authorized.

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
