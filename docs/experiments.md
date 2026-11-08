# Create a demo experiment

Use this workflow in a disposable space to create an experiment and simulate results. Storyblok Experiments is a premium Labs feature; availability depends on your plan. The experiment recipe was successfully applied and activated in a live test space; the complete new-space customer demo still needs end-to-end verification.

## One blueprint

[The experiment setup blueprint](../examples/features/setup-experiment.yaml) installs Experiments, creates a draft experiment, links `home`, creates missing variant mappings, and updates the variant story through a separate `stories.update_blocks` entry. The example uses `home-hero_demo-hero_test` as the expected full slug and updates the `eyebrow`, `text`, `background_color`, `text_alignment`, and `image_decoration` fields of a `hero-section` block, based on the demo home story. Inspect the home story and adapt these fields for your space. The selected story must have exactly one block of its declared component type.

```bash
bun run start space setup plan --config examples/features/setup-experiment.yaml
bun run start space setup apply --config examples/features/setup-experiment.yaml --space-id YOUR_SPACE_ID --yes
```

Review the disclaimer and ID before applying. The plan is local and cannot check story contents, experiment availability, or actual changes. After linking, Unblok creates missing non-control story mappings and checks them before updating the specified slug; it stops if no unique mapping matches. With `activate: true`, it publishes the variant stories, starts the experiment, and pushes simulated results if no results exist. The original story must already be published; Unblok does not publish its draft changes. Omit `activate` or set it to `false` to leave a draft and skip results. A rerun resumes a matching draft or running experiment; it stops on conflicting configuration or changed running content and preserves existing results. Changes already made are not rolled back if a later operation fails; inspect Storyblok and the report before retrying.

## Individual commands

You need Unblok, a Management API token with the required permissions, an existing home story, and a checkout containing the example files. The commands below use the installed `unblok` CLI; from a checkout, use `bun run start` instead. Export `STORYBLOK_TOKEN` and `STORYBLOK_SPACE_ID` in your shell.

Before creating an experiment, install the Experiments app if it is not already installed. Review the current disclaimer and its ID in Storyblok first; the ID observed during manual setup was `173657768407244`:

```bash
unblok app experiments enable --disclaimer-id 173657768407244 --yes --json
```

The command accepts the specified disclaimer and then installs app `173657247642152`. It skips an existing installation. If acceptance succeeds but installation fails, the report records the partial change; no rollback is performed. The request sequence was observed in the UI, but this command has not yet been verified end to end in a new space. Availability and disclaimer requirements can vary; verify them for your space before running it.

1. Inspect the home story and find its numeric ID, the hero block's `_uid`, and the actual names and values of its color and CTA fields:

   ```bash
   unblok story get --ref home --json
   ```

2. Copy [the experiment definition](../examples/features/experiment-demo.yaml) and check that `story_slugs` contains the home story's exact full slug. Create the draft experiment:

   ```bash
   unblok experiment create --file experiment-demo.yaml --yes --json
   unblok experiment get --id EXPERIMENT_ID --json
   ```

   Unblok resolves each full slug to its story ID before creating the experiment; a missing story stops creation. You can also use `story_ids` or combine both selectors. The definition creates a 50/50 control and test variant. Note the experiment ID, test variant ID, and any story mapping returned. Technical names must use lowercase letters, numbers, and underscores. A story can belong to only one experiment at a time.

3. If the test variant has no mapping for the home story, create one explicitly, then inspect the experiment again:

   ```bash
   unblok experiment mapping-create --id EXPERIMENT_ID --variant-id VARIANT_ID --story-id HOME_STORY_ID --yes --json
   unblok experiment get --id EXPERIMENT_ID --json
   ```

   The mapping identifies the variant story. Check whether linking the story generated a mapping before calling this command; creation duplicates the original and is not a repeatable ensure operation.

4. Inspect the mapped **variant story**, including its hero block UID. Create a YAML file with only the actual field names and desired values from that block. Field values are replaced in full, so include the complete value when changing a nested object such as a CTA. For example, the demo home story's `hero-section` has these text fields:

   ```yaml
   eyebrow: Discover what's possible
   text: Explore fresh ideas and bring your next project to life.
   ```

   Save it as `hero-fields.yaml` and update the variant draft, not the control:

   ```bash
   unblok story get --ref VARIANT_STORY_ID --json
   unblok story block-update --id VARIANT_STORY_ID --uid HERO_BLOCK_UID --file hero-fields.yaml --yes --json
   ```

   The selected UID must match exactly one block, and every supplied field must already exist on it. Other story content is preserved. This saves a draft without publishing; confirm the result in the Storyblok editor. Storyblok may reject updates to locked stories.

5. After starting the experiment, push the [simulated results](../examples/features/experiment-demo-results.yaml) to the demo experiment:

   ```bash
   unblok experiment results get --id EXPERIMENT_ID --json
   unblok experiment results push --id EXPERIMENT_ID --file examples/features/experiment-demo-results.yaml --yes --json
   ```

   The first command inspects the current snapshot; an experiment with no results may return an API error. **Pushing replaces any existing snapshot**, so use a disposable experiment and review before proceeding. The example charts are labeled simulated and are not analytics. Storyblok rejects results while the experiment is a draft.

The individual creation command leaves the experiment in draft. Publish its variant stories and start it in Storyblok before step 5. Selecting variants in the frontend and collecting real analytics are separate steps. See [Storyblok's Experiments documentation](https://www.storyblok.com/docs/concepts/experiments) for runtime integration.
