# Command Reference

All examples use `bun run start` from a checkout. The published CLI is `unblok`. Add `--json` to data commands that support it for machine-readable output.

## Storyblok pipeline stages

```bash
bun run start pipeline list --space-id 123456 --json
bun run start pipeline create --name "Go Live" --space-id 123456 --yes
```

The Pipelines app (`branches`) must be installed. Creation requires `--yes` and uses exact, case-sensitive stage names. The optional `--source` resolves an existing stage returned by the API by name. An existing target is skipped if its requested source matches; missing or ambiguous names and mismatched sources stop the operation. When no source is specified, Unblok leaves source selection to Storyblok and does not verify an existing stage's source. No deployment is triggered. The [pipeline YAML recipe](../examples/features/setup-pipeline.yaml) installs the app and creates `Go Live` without an explicit source. Storyblok documents the API as [branches](https://www.storyblok.com/docs/api/management/pipelines/create-a-branch).

## Storyblok content releases

```bash
bun run start release list --space-id 123456 --json
bun run start release create --name "Summer campaign" --space-id 123456 --yes
bun run start release create --name "Autumn campaign" --release-at "2027-10-01 09:00" --space-id 123456 --yes
bun run start release create --name "Demo campaign" --in-days 7 --space-id 123456 --yes
```

These commands manage Storyblok content releases, not npm or GitHub releases. The Releases app must be installed and enabled in the space. Unblok checks installed app slugs `releases_only` and `releases`; installation does not prove it is enabled. `STORYBLOK_SPACE_ID` supplies the space if `--space-id` is omitted.

`release list` returns releases from Storyblok. `release create` requires `--yes` and creates a release only when no release with the exact, case-sensitive name exists. `--release-at` optionally sets its scheduled date and time in Storyblok's `YYYY-MM-DD HH:mm` format; omit it for an unscheduled release. The value is sent unchanged. Storyblok says schedule times are stored in UTC and displayed using the account timezone; its API reference does not specify how timezone-free input is interpreted, so verify the resulting time in Storyblok before relying on it. See [Storyblok's scheduling guide](https://www.storyblok.com/faq/how-to-schedule-stories-for-releases).

`--in-days` accepts a whole number from 1 to 36500. On creation, Unblok adds that many 24-hour days to the current UTC time, rounds down to the minute, and sends the result as `release_at`. Use either `--in-days` or `--release-at`, not both. As with a fixed schedule, verify the displayed time in Storyblok because the API does not specify how it interprets timezone-free input.

An existing name is preserved and reported as `unchanged`; multiple matches cause an error. For a relative schedule, the existing schedule is preserved on reruns and is not compared to a newly calculated date. If a fixed schedule was requested, the existing `release_at` must exactly match the supplied value or the command reports a conflict; it never reschedules an existing release. Storyblok may return an equivalent time in a different format, which also produces a conflict. Leading and trailing spaces in the requested name are removed. JSON creation output contains `status` (`created` or `unchanged`) and `release`. Concurrent creations or incomplete API pagination could still result in duplicates; inspect releases after an uncertain failure. The commands do not add stories or immediately publish a release. See [Storyblok's Releases guide](https://www.storyblok.com/docs/apps/releases).

The [release setup example](../examples/features/setup-releases.yaml) installs the Releases app and creates a release using `release_in_days: 7`; use `release_at` for a fixed date instead. `space setup plan` validates locally, while `space setup apply` performs the installation and creation.

## `asset upload`

```bash
bun run start asset upload --file ./images/banner.png --space-id 123456 --yes
bun run start asset upload --file ./images/banner.png --folder "Demo/Images" --space-id 123456 --yes --json
```

The file path is relative to the current directory. Omit `--folder` to use the asset root; otherwise missing folders are created. `STORYBLOK_SPACE_ID` supplies the space when `--space-id` is omitted. A file with the same name in the target folder is read and compared: identical content is unchanged, while different content or multiple matching assets causes an error. The command does not replace existing assets. `--yes` confirms the upload and any folder creation. Folders already created remain if the upload fails. JSON output reports `created` or `unchanged` with the filename and optional folder.

Use `/` to separate nested folder names. For example, `--folder "Demo/Images"` creates `Demo` and its child `Images` if needed. Existing folders are reused on later runs; if a folder name is ambiguous within the same parent, the upload stops.

## `story folder create`

```bash
bun run start story folder create --path folder1/subfolder2 --space-id 123456 --yes
```

The command creates missing content folders in order and reuses existing folders. Each path segment becomes both the folder name and slug. `--yes` is required. JSON output includes the final `folderId`, overall `status` and paths created. It stops if a story occupies a requested folder path or a folder lookup is ambiguous. If a later segment fails, earlier created folders remain; review the result and rerun. Concurrent operations can still race.

## `story create`

```bash
bun run start story create --file examples/features/story-create.json --space-id 123456 --yes
```

The JSON file contains `name`, a full story `slug`, and a `content` object with a `component`; see the [example definition](../examples/features/story-create.json). A slug like `articles/news/welcome` creates `welcome` in the existing `articles/news` folder. The folder must already exist and resolve uniquely; create it with `story folder create` or declare `stories.ensure_folders` in YAML. Adjust component names and fields to match the target space. Missing component `_uid` values are generated. The command creates a draft and requires `--yes`; use `story publish` separately to publish it. An existing story with the same full slug is preserved without comparing its contents. `STORYBLOK_SPACE_ID` supplies the space when `--space-id` is omitted. With `--json`, the result has status `created` or `unchanged`. YAML asset directives are specific to YAML setup; use resolved asset objects in JSON content. See the [nested-story YAML example](../examples/features/setup-story-in-folder.yaml).

For example, after reviewing the draft in Storyblok, publish the example story with:

```bash
bun run start story publish --slug welcome --space-id 123456 --yes
```

If creation reported `unchanged`, review the existing story before publishing: the publish command publishes its current draft, including any pending edits.

To create a new story in an existing release, add `--release-id 123456` to `story create`. To edit a block in a release version, add the same option to `story block-update`. The CLI uses the release ID on the Management API request and does not publish the story. If the story already exists, creation skips it only when its returned release membership confirms that release; otherwise it reports a conflict.

In YAML, story creation and block updates can use `release: Campaign` instead of `release_id`. The name must match exactly one existing release or a release declared under `releases.create`; Unblok creates or finds declared releases before processing stories and resolves the ID during apply. Use either `release` or `release_id`, not both. Plan validates the configuration without looking up releases. See the [release story YAML example](../examples/features/setup-release-stories.yaml), and adapt its component fields to your space. Release-scoped behavior has been tested with mocks, not a live release.

## `story publish`

```bash
bun run start story publish --slug pages/welcome --space-id 123456 --yes
bun run start story publish --slug pages/welcome --space-id 123456 --yes --json
```

Publishes the current draft, including pending changes to an already published story. A story confirmed published with no pending changes is left unchanged. Provide one exact full slug without a leading or trailing slash; `STORYBLOK_SPACE_ID` supplies the space if `--space-id` is omitted. `--yes` is required. JSON output contains `status` (`published` or `unchanged`) and `storyId`. The command fails if the story cannot be found or its identity and publication state cannot be verified. It does not select individual languages or releases. Another editor may change the draft between the state check and publication.

## `space list`

List the spaces accessible to the authenticated user.

```bash
bun run start space list [options]
```

| Option                    | Description                                                               |
| ------------------------- | ------------------------------------------------------------------------- |
| `--search <text>`         | Filter spaces by name.                                                    |
| `--owned-only`            | Show only spaces owned by the authenticated user.                         |
| `--updated-before <days>` | Show spaces not updated within the given positive number of days.         |
| `--limit <n>`             | Show the N most recently created spaces after applying the other filters. |
| `--solo-only`             | Show owned spaces without collaborators. Implies `--owned-only`.          |

```bash
bun run start space list --search demo
bun run start space list --owned-only --updated-before 90
bun run start space list --solo-only
bun run start space list --limit 5
```

`--solo-only` requires one additional detail request per candidate space. Interactive terminals show progressive inspection results with bounded concurrency.

## `space get`

Retrieve details for one space. The ID must be a positive integer and may be positional, passed as an option, or read from `STORYBLOK_SPACE_ID`.

```bash
bun run start space get <space-id>
bun run start space get --space-id <space-id>
bun run start space get
```

Human output presents the plan, current role, content counts, domain, and creation date in a compact box. JSON output contains the complete API object.

## `space delete`

Delete one space after reviewing its details and confirming interactively:

```bash
bun run start space delete 123456
bun run start space delete
```

When the ID is omitted, the command prompts for it; it does not use the default space ID. Confirming deletion removes the space. Declining or cancelling leaves it unchanged. The command requires an interactive terminal and does not support `--json` or unattended deletion.

## `space duplicate`

Duplicate a source space into a new space.

```bash
bun run start space duplicate <source-space-id> <name> [options]
bun run start space duplicate <source-space-id> --name <name> [options]
```

| Option                | Description                                                |
| --------------------- | ---------------------------------------------------------- |
| `--name <name>`       | Provide the new name instead of the positional argument.   |
| `--in-org`            | Create the space inside the current organization.          |
| `--space-type <type>` | Set the organization space type when required by the plan. |
| `--assign-partner`    | Associate the current user's partner.                      |
| `--demo`              | Mark the new space as a demo space.                        |
| `--only-id`           | Print only the new space ID.                               |

```bash
bun run start space duplicate 123456 "Customer Demo"
bun run start space duplicate 123456 --name "Customer Demo" --in-org --demo
bun run start space duplicate 123456 "Customer Demo" --only-id
```

Storyblok duplicates content entries and components. Assets are not copied and continue referencing the source space. Duplication may continue asynchronously after the API returns.

## Space preview configuration

Retrieve the first preview token for use in scripts, set the default preview URL, and disable demo mode:

```bash
TOKEN=$(bun run start space token --space-id 123456 --only-token)
bun run start space preview-set "https://example.com/?token=${TOKEN}&path=" \
  --environment "Local Development=http://localhost:3000/?token=${TOKEN}&path=" \
  --space-id 123456
bun run start space demo-remove --space-id 123456
```

`space token` prints a sensitive credential; avoid displaying it in logs. `preview-set` accepts repeatable `--environment` (or `-e`) options. When present, these replace the additional environment list; when omitted, the list is preserved. URLs and tokens are not repeated in status output. All three commands use `STORYBLOK_SPACE_ID` when `--space-id` is omitted.

## Version 1 setup blueprints

Inspect a blokctl-style `version: 1` YAML file locally:

```bash
bun run start space setup plan --config path/to/demo-space.yaml
bun run start space setup plan --config path/to/demo-space.yaml --input 'space_name=Customer Demo'
bun run start space setup plan --config path/to/demo-space.yaml --json
```

The plan validates the supported blueprint shape and resolves declared string inputs from defaults or repeatable `--input name=value` overrides. It shows the resolved blueprint; runtime references such as `${{ space.preview_token }}` remain placeholders. Story content is application-specific and is not fully schema-validated. The plan does not read Storyblok state or make changes, and is not a remote diff. Unsupported sections are rejected by the schema. The `version: 1` format is separate from the existing `space-man/v1` format used by `space plan` and `space apply`.

| Option                       | `plan`                                                | `apply`                                                                    |
| ---------------------------- | ----------------------------------------------------- | -------------------------------------------------------------------------- |
| `--config <path>`            | Required YAML or JSON blueprint.                      | Required YAML or JSON blueprint.                                           |
| `--input <name=value>`       | Override a declared input; repeatable.                | Override a declared input; repeatable.                                     |
| `--space-id <id>`            | Not supported; the plan is local.                     | Use an existing space instead of duplicating.                              |
| `--yes`                      | Not needed.                                           | Required to authorize changes.                                             |
| `--continue-after-duplicate` | Not applicable.                                       | Skip the post-duplication prompt; required for noninteractive duplication. |
| `--json`                     | Emit the capability inventory and resolved blueprint. | Emit a per-operation report.                                               |

### Supported YAML sections

The bundled examples reference the local [JSON Schema](../space-setup.schema.json) for editor completion and validation. Add `# yaml-language-server: $schema=../space-setup.schema.json` at the top of a YAML file in `examples/`; adjust the relative path for files elsewhere. The CLI validates resolved blueprints against the same schema and performs additional runtime checks. The `ai` section supports explicit space AI and organization inheritance settings.

| Section                                                                                         | Fields and behavior                                                                                                              | Example                                                                                                             |
| ----------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------- |
| `version`, `template`, `execution`                                                              | Set `version: 1`; `template` holds descriptive metadata and `execution.mode` accepts `reconcile`.                                | [Apps and tags](../examples/features/setup-apps-tags.yaml)                                                          |
| `extends`                                                                                       | Merge a blueprint file or an ordered list of files before the current file.                                                      | [Modular customer demo](../examples/customer-demo/setup.yaml)                                                       |
| `inputs`                                                                                        | String values use `default` or `--input` and are referenced as `${{ inputs.name }}`.                                             | [Duplicate](../examples/features/setup-duplicate.yaml)                                                              |
| `space`                                                                                         | `name`, `duplicate_from`, `in_org`, `demo`, `readiness`, and `languages`.                                                        | [Duplicate](../examples/features/setup-duplicate.yaml), [configuration](../examples/features/setup-configure.yaml)  |
| `preview`, `demo_mode`                                                                          | Configure the default URL, named environments, and `demo_mode.remove`; preview URLs can reference `${{ space.preview_token }}`.  | [Configuration](../examples/features/setup-configure.yaml)                                                          |
| `apps`                                                                                          | Install slugs or `{ id: 123 }`; `continue_on_error` controls whether setup continues after an app failure.                       | [Configuration](../examples/features/setup-configure.yaml)                                                          |
| `ai_translation`                                                                                | Accept a specified `disclaimer_id`, then install AI Translations (app `29942`).                                                  | [AI Translations](../examples/customer-demo/steps/10-ai-translation.yaml)                                           |
| `experiments`                                                                                   | Install Experiments, reconcile variants and test content, and optionally publish, activate, and push simulated results.          | [Experiment](../examples/features/setup-experiment.yaml)                                                            |
| `releases.create`                                                                               | Create content releases with fixed or relative schedules.                                                                        | [Releases](../examples/features/setup-releases.yaml)                                                                |
| `pipelines.create`                                                                              | Create Pipeline stages using an optional existing source stage.                                                                  | [Pipeline](../examples/features/setup-pipeline.yaml)                                                                |
| `ai`                                                                                            | Configure space AI and organization configuration inheritance using explicit booleans `enabled` and `inherit_org_configuration`. | [Space AI](../examples/customer-demo/steps/09-space-ai.yaml)                                                        |
| `components.fields`                                                                             | Reconcile declared fields, including custom `field_type`, tabs, and rich-text `customize_toolbar`.                               | [Component fields](../examples/features/setup-component-fields.yaml)                                                |
| `assets.upload_directory`                                                                       | Upload selected files from a local directory.                                                                                    | [Local assets](../examples/features/setup-assets.yaml)                                                              |
| `assets.upload_url`                                                                             | Download and upload remote files; use `name` as a story asset reference.                                                         | [Remote asset](../examples/features/setup-remote-asset.yaml)                                                        |
| `stories.ensure_folders`, `stories.create`, `stories.translated_slugs`, `stories.update_blocks` | Ensure folders, create stories, reconcile translated slugs, and update selected blocks by story slug.                            | [Nested story](../examples/features/setup-story-in-folder.yaml), [Stories](../examples/features/setup-stories.yaml) |
| `workflow`                                                                                      | Assign unstaged stories and exact story slugs to stages.                                                                         | [Workflow](../examples/features/setup-workflow.yaml)                                                                |
| `tags`                                                                                          | Add tags to stories selected by exact full slug.                                                                                 | [Apps and tags](../examples/features/setup-apps-tags.yaml)                                                          |

These are YAML setup operations, not all standalone commands: in particular, space AI configuration is currently available through the setup runner. Unsupported fields are rejected before changes.

### Reusing smaller blueprints

The [modular customer demo](../examples/customer-demo/setup.yaml) combines the numbered files in [customer-demo/steps](../examples/customer-demo/steps/). Each file can also be planned or applied separately. For example, first create the space and note its ID, then use that ID for each subsequent step:

```bash
bun run start space setup apply --config examples/customer-demo/steps/01-space.yaml --input 'space_name=Customer Demo' --yes
bun run start space setup apply --config examples/customer-demo/steps/02-settings.yaml --space-id 123456 --yes
bun run start space setup apply --config examples/customer-demo/steps/05-assets.yaml --space-id 123456 --input 'asset_url=https://your-host.example/banner.png' --yes
```

Run files 03–08 with `--space-id` in order; the story, workflow, and tag steps depend on earlier steps and the source space's content. The modular blueprint also includes [space AI settings](../examples/customer-demo/steps/09-space-ai.yaml), AI Translations, the [experiment setup](../examples/features/setup-experiment.yaml), the [release setup](../examples/features/setup-releases.yaml), and the [Pipeline setup](../examples/features/setup-pipeline.yaml). Review the disclaimer IDs and terms before applying. The combined setup publishes the experiment variant, starts the experiment, pushes simulated results, creates a release scheduled seven days after creation, and creates a `Go Live` Pipeline stage without an explicit source. Verify Pipeline availability, its source and the scheduled time in Storyblok. To run it, use `--config examples/customer-demo/setup.yaml` and provide the same input overrides. The runner always executes resource operations in dependency order, regardless of the order of sections in YAML.

`extends` accepts one path or an array of paths, relative to the file declaring it. Included files are merged in order and then the including file is merged. Objects merge recursively, later scalar values and configuration lists replace earlier ones, and operation lists (apps, component fields, assets, stories, workflow assignments, and tags) are appended. A file shared through multiple paths is included once; cycles are rejected. Inputs are merged before substitution, so `--input` overrides work across files. Include paths are literal, not input expressions. Local asset source paths are relative to the file declaring them; use relative input values when interpolating paths in included fragments.

### Applying a blueprint

The executable subset supports space duplication, languages, preview URLs, demo mode removal, apps by slug or ID, component fields, asset uploads, stories, translated slugs, workflow assignments, and story tags. To create a space, copy [the duplication example](../examples/features/setup-duplicate.yaml), set its source space ID, and run:

```bash
bun run start space setup apply --config path/to/setup.yaml --input 'space_name=Customer Demo' --yes
```

For a combined example, see [customer-demo/setup.yaml](../examples/customer-demo/setup.yaml). It targets the showcase space and expects its components and stories to exist. Override `asset_url` with another reachable image URL if needed. You can also override `space_name`, `frontend_host`, and `review_stage`:

```bash
bun run start space setup plan --config examples/customer-demo/setup.yaml --input 'asset_url=https://your-host.example/banner.png'
bun run start space setup apply --config examples/customer-demo/setup.yaml --input 'asset_url=https://your-host.example/banner.png' --input 'space_name=Customer Demo' --yes
```

The command shows the created space and asks whether to continue, then polls until duplication completes. `space.readiness` controls the timeout and interval; defaults are 60 and 5 seconds. If you stop or readiness fails, the space remains in Storyblok and can be resumed using its ID. Noninteractive creation requires `--continue-after-duplicate` in addition to `--yes`.

To apply to an existing space without duplicating:

```bash
bun run start space setup apply --config examples/features/setup-apps-tags.yaml --space-id 123456 --yes
bun run start space setup apply --config examples/features/setup-configure.yaml --space-id 123456 --input 'frontend_host=example.com' --yes
bun run start space setup apply --config examples/features/setup-component-fields.yaml --space-id 123456 --yes
```

`--yes` is required. Preview token references are resolved only during preview configuration and are not printed. Named environments are merged with existing environments; matching names are updated. Languages are added by code without changing existing entries. App failures are reported and `continue_on_error` controls whether later operations run. Unsupported sections, runtime expressions outside preview, or tag selectors are rejected before any writes; the complete blokctl demo blueprint is not yet executable. Results are emitted as `unblok/blueprint-apply-v1` with `--json`, including per-operation reasons, `summary` counts, `not_run` entries after a stopping failure, and recovery guidance. Asset preparation failures are reported before a space is created.

Component fields run after app installation. Existing fields retain undeclared properties; a declared tab moves the field to that tab, and omitting `tab` preserves its current placement. Field type conflicts stop the apply. Install the relevant plugin before configuring a custom field.

### AI Translations

Review the current disclaimer and its ID in Storyblok, then explicitly accept it and install the app:

```bash
bun run start app ai-translation enable --space-id 123456 --disclaimer-id 35 --yes
bun run start space setup apply --config examples/customer-demo/steps/10-ai-translation.yaml --space-id 123456 --yes
```

The YAML example uses disclaimer ID `35` from a captured UI request; check that it is the right current disclaimer for your space. Enabling sends the captured `space.disclaimer_id` update first, then provisions app `29942`. If the space already lists the disclaimer as accepted or the app as installed, that step is skipped. If acceptance fails, the app is not installed. The operation uses the observed UI requests and has not been verified against a live space by the test suite. `--yes` authorizes accepting the specified disclaimer. Space AI settings are configured separately through the YAML `ai` section.

Asset directories are relative to the YAML file. `include` accepts filename patterns in the source directory (not recursive paths); each pattern must match. Use a path such as `target_folder: Demo/Images` to create or reuse nested target folders. An existing filename is reused only when its downloaded content matches the local file; ambiguous names or differing content stop the apply. [Example asset setup](../examples/features/setup-assets.yaml).

Use `assets.upload_url` to download remote files before applying changes. Each entry requires a `name`, HTTP(S) `url`, and `target_folder`; `filename` is optional if the URL path has a filename with an extension. Files are limited to 100 MiB and a 30-second download. Reference one in story content with `asset: { _ref: name }`. The same content comparison applies on repeat runs. See [the remote asset example](../examples/features/setup-remote-asset.yaml).

Stories can be created at the space root with nested component content and asset `_find` references; existing stories with the same full slug are left unchanged. Translated slugs require the Translatable Slugs app and an enabled language. Only declared translations are updated, and a leading slash is removed from story and translated slug selectors. See [the story example](../examples/features/setup-stories.yaml).

The [workflow example](../examples/features/setup-workflow.yaml) assigns unstaged stories first, then assigns exact story slugs to a named workflow and stage. If `stage_id` is null, the runner uses the default workflow's default stage, or its first stage by position. It checks workflow stages once and, when necessary, ensures the standard default stages Drafting, Reviewing, and Ready to Publish exist. Custom stages are not created automatically. Already matching stories are skipped; assignment failures are reported and stop later setup steps.

## `space plan`

Validate a versioned setup file and preview its declared operations. Planning is always read-only; remote comparison is optional.

```bash
bun run start space plan --config examples/features/demo-space.yaml
bun run start space plan --config examples/features/demo-space.yaml --json
bun run start space plan --config examples/features/demo-space.yaml --space-id 123456
```

| Option            | Description                                                     |
| ----------------- | --------------------------------------------------------------- |
| `--config <path>` | Required YAML or JSON setup document.                           |
| `--space-id <id>` | Read the target space and compare supported resources remotely. |

The v1 document uses `apiVersion: space-man/v1`, `kind: SpaceSetup`, a non-empty `metadata.name`, and a `resources` object. Supported collections and their required stable identities are:

| Collection    | Identity |
| ------------- | -------- |
| `languages`   | `code`   |
| `components`  | `name`   |
| `datasources` | `name`   |
| `stories`     | `path`   |
| `assets`      | `path`   |
| `tags`        | `name`   |

Each collection must be an array. Identities must be non-empty and unique within a collection; languages also require `name` and may declare `aiTranslationCode`. Additional item fields are preserved for future reconcilers.

Without `--space-id`, all operations have `planned` status and no token is required. With `--space-id`, the command requires `STORYBLOK_TOKEN` and compares languages and components as `create`, `update`, or `unchanged`; unsupported reconcilers remain `planned`. Component comparison uses exact field names but ignores API-generated properties inside field definitions. JSON output uses `space-man/plan-v1` and contains `config`, `operations`, and `summary` fields.

## `space apply`

Reconcile supported setup resources with a target space. Review `space plan` first; mutation requires explicit `--yes` confirmation.

```bash
bun run start space plan --config examples/features/demo-space.yaml --space-id 123456
bun run start space apply --config examples/features/demo-space.yaml --space-id 123456 --yes
bun run start space apply --config examples/features/demo-space.yaml --space-id 123456 --yes --json
```

| Option            | Description                                              |
| ----------------- | -------------------------------------------------------- |
| `--config <path>` | Required YAML or JSON setup document.                    |
| `--space-id <id>` | Target space; defaults to `STORYBLOK_SPACE_ID`.          |
| `--yes`           | Required acknowledgement that API mutations may be made. |

The first apply version supports languages and components. It creates missing declarations, updates differences, and skips matches. Assets, datasources, stories, and tags are reported as `unsupported` and remain untouched. Existing resources absent from the setup are never deleted.

The `space-man/apply-v1` report counts `created`, `updated`, `unchanged`, `unsupported`, and `failed` operations. Independent operations continue after a failure; any failure produces a non-zero exit code after the full report is emitted.

## `language list`

List the additional languages configured for a space.

```bash
bun run start language list
bun run start language list --space-id 123456 --json
```

`--space-id` defaults to `STORYBLOK_SPACE_ID`.

## `language add`

Idempotently ensure a language exists. Existing languages not named by the command are preserved; a matching language is updated only when its declared values differ.

```bash
bun run start language add it Italian
bun run start language add de German --ai-translation-code de --space-id 123456
```

| Option                         | Description                                              |
| ------------------------------ | -------------------------------------------------------- |
| `--space-id <id>`              | Target space; defaults to `STORYBLOK_SPACE_ID`.          |
| `--ai-translation-code <code>` | Optional language code used by Storyblok AI translation. |

## `component list`

List component schemas, optionally filtering by name.

```bash
bun run start component list --space-id 123456
bun run start component list --search page --json
```

Options are `--search <text>` and `--space-id <id>`; the space ID defaults to `STORYBLOK_SPACE_ID`.

## `component get`

Retrieve one component by numeric ID or exact technical name.

```bash
bun run start component get page
bun run start component get 123456 --space-id 987654 --json
```

## `component create`

Create a component from a YAML or JSON definition.

```bash
bun run start component create --file examples/features/page.component.yaml
```

Definitions use setup-style camel-case fields such as `displayName`, `isRoot`, `isNestable`, `previewField`, and `previewTemplate`. The `name` field is required; `schema` maps field names to Storyblok field definitions.

## `component update`

Update the declared properties of an existing component. Undeclared top-level properties are not sent.

```bash
bun run start component update page --file examples/features/page.component.yaml
```

Renaming is rejected because the installed API client cannot yet request safe reference updates in existing stories. Use the same `name` in the definition and target component.

## `component field-add`

Add a field to an existing component tab. The command creates the tab if needed and preserves existing schema fields. A matching field is skipped; a conflicting definition or tab is reported without an update.

```bash
bun run start component field-add --component article-page --field SEO \
  --type custom --field-type sb-ai-seo --tab SEO --space-id 123456
```

`--component`, `--field`, and `--tab` are required. `--type` defaults to `custom`, which requires `--field-type`. Optional flags include `--display-name`, `--required`, and `--translatable`. The target defaults to `STORYBLOK_SPACE_ID`. Install the plugin app before adding its custom field.

## Workflow stage assignment

To ensure the standard stages exist in the default workflow:

```bash
bun run start workflow ensure-default --space-id 123456 --yes
```

The command creates missing `Drafting`, `Reviewing`, and `Ready to Publish` stages and leaves existing stages unchanged. If no default workflow is visible, it attempts to create the first stage without a workflow ID, which Storyblok documents as targeting the default workflow, and verifies the result. Storyblok's workflow creation API does not document a way to create a default workflow explicitly; if initialization fails, inspect the space in the UI. The command may require permissions or a plan that permits workflow changes.

Inspect workflows and stages before selecting stories:

```bash
bun run start workflow list --space-id 123456
bun run start workflow stage list --workflow Default --space-id 123456
bun run start workflow stage get Reviewing --workflow Default --space-id 123456
```

Preview and then assign a stage to explicit story IDs or a filtered selection:

```bash
bun run start story workflow plan --stage Reviewing --story 123 --story 456 --space-id 123456
bun run start story workflow assign --stage Reviewing --story 123 --story 456 --space-id 123456 --yes
bun run start story workflow plan --stage Reviewing --starts-with articles/ --space-id 123456
bun run start story workflow plan --stage Reviewing --without-stage --space-id 123456
bun run start story workflow assign --stage Reviewing --without-stage --space-id 123456 --yes
```

Use `--stories-from <path>` for a whitespace- or comma-separated ID file, or `--search`, `--starts-with`, and `--component` filters. Explicit IDs cannot be combined with filters. Use `--workflow <name-or-id>` to disambiguate stage names. Assignment accepts `--due-date`, `--comment`, `--notify`, repeated `--user-id` and `--role-id`, `--release-id`, and `--concurrency` (1–10). It requires `--yes`; run the matching plan first. `--json` provides a versioned per-story report, and failures produce a non-zero exit code.

`--without-stage` selects stories with no workflow stage, including no per-language stages. It may be combined with selectors to narrow the result, but not with `--release-id`. If Storyblok omits stage data, the command fails instead of guessing. The assignment fetches the selection again, so review the plan immediately before applying.

## Stories and experiments

Use `unblok story get --ref <id-or-full-slug> --json` to inspect a story. `unblok story block-update --id <id> --uid <block-uid> --file <yaml-or-json> --yes` replaces existing fields on exactly one block and saves the story without publishing. Supply complete field values, including nested objects. See [the demo experiment guide](experiments.md) for a complete example.

`unblok app experiments enable --disclaimer-id <id> --yes` accepts the specified disclaimer and installs the Experiments app; review its terms and ID first. `unblok experiment list`, `get`, and `create` inspect or create experiments. `link-story` links an existing story to a draft experiment; `mapping-create` duplicates a story for a variant. `experiment results get` reads a snapshot and `experiment results push --id <id> --file <yaml-or-json> --yes` replaces it. Use `--help` for each command. Creation and mapping are not idempotent; inspect existing experiments and mappings before retrying. The experiment recipe was applied and activated in a live test space; the complete new-space customer demo still needs end-to-end verification.

## Story tag assignment

Preview tag additions, then apply them to exact story full slugs:

```bash
bun run start story tags plan --slug home --slug contact --tag Landing --tag Marketing --space-id 123456
bun run start story tags assign --slug home --slug contact --tag Landing --tag Marketing --space-id 123456 --yes
```

Repeat `--slug` and `--tag` (or `-t`) for multiple values. Existing tags are preserved and matching tags are skipped. Missing slugs stop the operation before writes. Assignment fetches stories again before updating; independent failures appear in the report and produce a non-zero exit code. `--json` emits a versioned report. The target defaults to `STORYBLOK_SPACE_ID`.

The human assignment summary identifies updated and unchanged stories, explains failures, and shows the counts for each outcome.

## App provisioning

```bash
bun run start app list --space-id 123456
bun run start app install --slug import --space-id 123456
bun run start app install --by-slug=storyblok-gmbh@ai-seo --space-id 123456 --json
```

`app list` shows installed apps. `app install` resolves the exact slug against available apps and skips apps already installed. The target defaults to `STORYBLOK_SPACE_ID`. Installation can fail if the app is unavailable to the space or requires additional approval, permissions, or configuration.

App slugs in CLI commands and YAML `apps.install` are resolved using the target space's regional API; no app ID is hard-coded for a slug. Unblok infers the region from the space ID and falls back to EU when it cannot infer one. If the inferred region is incorrect, set `STORYBLOK_REGION` to `eu`, `us`, `ca`, `ap`, or `cn`; this overrides the region for all space-scoped operations in the command, including YAML setup. App availability may differ by region. An explicit numeric app ID in YAML is used as supplied.

For multiple apps, call the command in a shell loop; each invocation returns a non-zero exit code on failure:

```bash
for slug in releases_only storyblok-gmbh@ai-seo replace_asset export import backups; do
  bun run start app install --slug "$slug" --space-id "$SPACE_ID" || echo "Could not install $slug" >&2
done
```

## Common options

| Option         | Description                                      |
| -------------- | ------------------------------------------------ |
| `--json`       | Emit JSON without spinners or decorative output. |
| `-h`, `--help` | Show help without making an API request.         |

Errors are written to stderr. Invalid usage returns exit code `2`; configuration and API failures return exit code `1`.
