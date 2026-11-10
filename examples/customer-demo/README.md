# Customer demo setup

This demo turns a showcase space into a repeatable customer demo. The YAML files describe the desired setup, so you can review it, reuse individual pieces, and run the same process for another customer instead of repeating the steps in the Storyblok UI.

The demo duplicates the source space specified in [step 01](steps/01-space.yaml). It expects access to that space and its existing components and stories. Configure `STORYBLOK_TOKEN` as described in [Getting started](../../docs/getting-started.md). Creating a space may be subject to your organization's limits and plan.

## The main blueprint

[setup.yaml](setup.yaml) uses `extends` to combine the numbered files in `steps/`, the [experiment recipe](../features/setup-experiment.yaml), the [release stories recipe](../features/setup-release-stories.yaml), and the [pipeline recipe](../features/setup-pipeline.yaml). The release stories recipe includes the [releases recipe](../features/setup-releases.yaml). Inputs declared in a step can be overridden when running the main blueprint. The runner orders operations by dependency, which may differ from the order of the files.

Check the combined recipe locally:

```bash
bun run start space setup plan --config examples/customer-demo/setup.yaml \
  --input 'space_name=Customer Demo'
```

`plan` validates and displays the resolved blueprint; it does not read or change Storyblok. To create and configure a space, run:

```bash
bun run start space setup apply --config examples/customer-demo/setup.yaml \
  --input 'space_name=Customer Demo' --yes
```

The command shows the new space and asks whether to continue. Review the AI Translations and Experiments disclaimers and their IDs before applying. The complete setup enables space AI, disables inheritance of organization AI configuration, queues an Italian translation of `home` and assigns that language to the configured review stage, publishes the experiment variant, starts the experiment, pushes simulated results, creates a `Demo campaign` release scheduled seven days from creation, and creates a `Go Live` Pipeline stage without an explicit source. The Pipeline operation requires the app to be available; verify the stage source in your space. Verify the resulting release time in Storyblok: the UTC calculation is sent in the API's timezone-free format. See the [experiment guide](../../docs/experiments.md) for prerequisites and partial-failure behavior. Override `asset_url`, `frontend_host`, or `review_stage` with additional `--input 'name=value'` options when needed.

## Reusable steps

Run a step by itself to test or reuse only that capability. Steps 02–11 accept an existing space with `--space-id YOUR_SPACE_ID --yes`; some need resources from earlier steps or the source space.

| Step                                                      | Purpose and reuse                                                                                                                      |
| --------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------- |
| [01 Space](steps/01-space.yaml)                           | Duplicates the showcase space into the organization; reuse it to create a fresh starting point with a chosen name.                     |
| [02 Settings](steps/02-settings.yaml)                     | Sets Italian, preview URLs, and demo mode; reuse it to configure a compatible space and frontend.                                      |
| [03 Apps](steps/03-apps.yaml)                             | Installs the demo's supporting apps; reuse it before steps that depend on those apps.                                                  |
| [04 Components](steps/04-components.yaml)                 | Configures SEO and rich-text fields on `article-page`; reuse it when those component settings are needed.                              |
| [05 Assets](steps/05-assets.yaml)                         | Uploads a remote banner to `Provisioned`; reuse it with another URL or choose the local alternative below.                             |
| [06 Stories](steps/06-stories.yaml)                       | Creates a story using the banner and sets an Italian slug for `/about`; it depends on the asset, language, app, and source components. |
| [07 Workflow](steps/07-workflow.yaml)                     | Assigns stages to unstaged and selected stories; reuse it with a different `review_stage`.                                             |
| [08 Tags](steps/08-tags.yaml)                             | Adds tags to selected stories; reuse it to apply the same organization to compatible content.                                          |
| [09 Space AI](steps/09-space-ai.yaml)                     | Enables space AI with space-specific configuration; reuse independently of any particular AI app.                                      |
| [10 AI Translations](steps/10-ai-translation.yaml)        | Accepts the specified disclaimer and installs AI Translations; reuse only when that feature and disclaimer are appropriate.            |
| [11 Translate home](steps/11-translate-home.yaml)         | Enables language-based workflow stages, queues Italian translation of `home`, and assigns its Italian version to review.               |
| [Experiment](../features/setup-experiment.yaml)           | Creates and activates a demo experiment with a modified hero variant and simulated results.                                            |
| [Releases](../features/setup-releases.yaml)               | Creates a demo release scheduled seven days from creation; existing releases retain their schedules on rerun.                          |
| [Release stories](../features/setup-release-stories.yaml) | Creates a story and updates the home hero in the demo release; includes the release recipe.                                            |
| [Pipeline](../features/setup-pipeline.yaml)               | Installs Pipelines and creates the `Go Live` stage without an explicit source.                                                         |

For local images, apply [alternatives/local-assets.yaml](alternatives/local-assets.yaml) **instead of step 05** when running steps individually. Supply `--input 'asset_dir=/absolute/path/to/images'`; the directory must contain the three filenames listed in that file. The main blueprint continues to use the remote asset step.

## Repeat and recover

Applying the main blueprint without `--space-id` creates a new space each time. To repeat or resume against the same space, pass its ID; matching resources are skipped where supported. AI translation sends a new request on every apply, including retries, and may incur charges. Queued tasks can overlap; review their results in Storyblok. A failed run can leave earlier changes in place. Read the report, fix the failure, and rerun with that same ID. See the [setup guide](../../docs/space-setups.md) for repeat-run behavior and composition rules.
