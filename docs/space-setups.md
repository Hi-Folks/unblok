# Repeatable space setups

Describe a Storyblok space setup in version-controlled YAML, review it, and apply it to a new or existing space. A blueprint can combine reusable files, inputs, apps, component fields, assets, stories, workflows, tags, and releases. This makes a demo or customer setup easier to review and repeat than a sequence of manual UI changes.

The [release example](../examples/features/setup-releases.yaml) installs the Releases app and creates a release scheduled seven days after creation. A rerun keeps the existing release and its schedule. The date is calculated in UTC and sent in Storyblok's timezone-free format; verify the resulting time in Storyblok before relying on it. [Release command details](commands.md#storyblok-content-releases).

## Try it step by step

The numbered [customer demo steps](../examples/customer-demo/steps/) each have one responsibility. They target the showcase source space and expect its components and stories to exist. Start by duplicating it:

```bash
bun run start space setup plan --config examples/customer-demo/steps/01-space.yaml --input 'space_name=Customer Demo'
bun run start space setup apply --config examples/customer-demo/steps/01-space.yaml --input 'space_name=Customer Demo' --yes
```

Apply shows the new space ID and dashboard URL, then asks whether to continue. Use that ID for the remaining fragments, so each step affects the same space:

```bash
bun run start space setup apply --config examples/customer-demo/steps/02-settings.yaml --space-id YOUR_SPACE_ID --yes
bun run start space setup apply --config examples/customer-demo/steps/03-apps.yaml --space-id YOUR_SPACE_ID --yes
```

Continue with files 04–10 in order. File 05 uses a remote banner; override it with `--input 'asset_url=https://…/banner.png'` if needed. Step 09 configures [space AI](../examples/customer-demo/steps/09-space-ai.yaml), and step 10 accepts a disclaimer and installs AI Translations; review its ID and terms before applying it. The [customer demo guide](../examples/customer-demo/README.md) explains each step.

To upload local images instead of using the remote URL in file 05, use [the local asset example](../examples/customer-demo/alternatives/local-assets.yaml). The directory must contain the three filenames listed in that file; the banner is used by step 06:

```bash
bun run start space setup apply --config examples/customer-demo/alternatives/local-assets.yaml \
  --space-id YOUR_SPACE_ID --input 'asset_dir=/absolute/path/to/images' --yes
```

This is an alternative to file 05 when running the steps individually. The modular blueprint still uses its remote `asset_url` input.

## Combine the steps

The [modular blueprint](../examples/customer-demo/setup.yaml) uses `extends` to combine steps 01–10 with the experiment, release, and Pipeline recipes. It enables space AI, disables inheritance of organization AI configuration, accepts AI Translations and Experiments disclaimers, publishes a variant, starts an experiment, pushes simulated results, creates a release scheduled seven days from creation, and creates a `Go Live` Pipeline stage without an explicit source. Verify Pipeline availability and the stage source, as well as the scheduled time in Storyblok. Review both disclaimer IDs and terms and the [experiment configuration](../examples/features/setup-experiment.yaml) before applying. Inputs declared in fragments are available to the main blueprint:

```bash
bun run start space setup plan --config examples/customer-demo/setup.yaml \
  --input 'space_name=Customer Demo' \
  --input 'asset_url=https://your-host.example/banner.png'

bun run start space setup apply --config examples/customer-demo/setup.yaml \
  --input 'space_name=Customer Demo' \
  --input 'asset_url=https://your-host.example/banner.png' --yes
```

Include paths are relative to the file that declares them. Files merge in order: objects merge recursively, later scalar values and configuration lists replace earlier values, and operation lists append. Each file is included once and cycles fail validation. The runner executes operations in dependency order, regardless of YAML section order. See [merge rules and all supported fields](commands.md#reusing-smaller-blueprints).

## Understand planning and repeat runs

`plan` is local: it merges files, resolves inputs, checks the schema, and displays an inventory. It does **not** read Storyblok, compare current state, check every runtime dependency, or make changes. Apply performs further checks and reports each operation; some API or dependency errors can only appear after earlier operations have succeeded.

For an experiment example, see [the experiment guide](experiments.md). Experiment creation is create-only: an existing technical name stops the operation, and partially created experiments require inspection rather than an automatic resume.

Applying without `--space-id` duplicates a new space every time. To resume or repeat against the same space, pass its explicit `--space-id`. If duplication readiness fails or you stop at the confirmation, the created space remains available; use its ID to continue.

On an existing space, behavior depends on the resource:

| Resource                     | Repeat-run behavior                                                                                                             |
| ---------------------------- | ------------------------------------------------------------------------------------------------------------------------------- |
| Languages and apps           | Add missing languages and install missing apps; existing ones are kept.                                                         |
| Preview and component fields | Update declared settings or field properties when different; preserve undeclared fields and other named environments.           |
| Assets                       | Reuse a same-named file in the target folder only if its content matches; differing content or ambiguous matches stop the step. |
| Stories                      | Leave an existing story with the same full slug untouched; update declared translated slugs separately.                         |
| Workflows and tags           | Skip matching assignments and add missing tags while preserving existing tags.                                                  |

These behaviors make many operations repeatable, but do not guarantee that two spaces become identical: source content, existing stories, external files, app availability, and API state can differ. Changes already made are not rolled back on a later failure. The report explains unchanged items, identifies failures, lists later operations that did not run, and summarizes completed, skipped, failed, and not-run counts. Fix the error and rerun with the same space ID; inputs and confirmation flags must be supplied again. `--json` includes the same reasons, `summary`, and recovery guidance. A failure returns a nonzero exit code.

In an interactive terminal, apply also shows progress as setup phases run, including individual apps, component fields, assets, and processed workflow stories. Redirected and JSON output do not include live progress.

## Schema and current boundaries

The local [JSON Schema](../space-setup.schema.json) provides editor completion and is used by the CLI after input resolution. AI Translations and [space AI settings](../examples/customer-demo/steps/09-space-ai.yaml) are separate, opt-in operations. The example enables space AI and disables inheritance of organization AI configuration. Some capabilities have mocked tests but have not yet been verified end to end in a live space. The `version: 1` blueprint format uses `space setup`; the older `space-man/v1` format uses `space plan` and `space apply` and has different capabilities.

App slugs in `apps.install` are looked up for the target space's region. To override region inference for all space-scoped requests, set `STORYBLOK_REGION` to `eu`, `us`, `ca`, `ap`, or `cn` before running the setup. Explicit numeric app IDs are used as supplied.
