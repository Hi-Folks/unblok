# Organize a space into Dimensions folders

A space may begin with all its stories and folders at the root. As a team grows into new markets, it can use Storyblok's Dimensions app to work with independent country versions of those stories.

This recipe prepares a starting structure with a shared `global` folder and separate country folders. It installs and configures Dimensions, moves existing root content into `global`, and restores a root `site-config` copy for a site that expects one there. The combined demo example also creates linked article variants in Italy and Germany, ready for teams to adapt and compare.

```text
Before                     After
home                       global/home
articles/...               global/articles/...
site-config                global/site-config
                           site-config          (draft copy)
                           uk/
                           germany/
                           italy/
```

This is an example structure. Adapt the folder names, app installation and `site-config` handling to the target space before applying it.

## Prepare and review the recipe

You need Unblok and a Storyblok Management API token with access to the space. See [getting started](../getting-started.md). Examples use the installed `unblok` command; from this repository use `bun run start` instead. Replace `YOUR_SPACE_ID` with your own space ID.

Export the YAML bundled with your installed version:

```bash
unblok space setup examples --json
unblok space setup example dimensions-country-setup > dimensions-country-setup.yaml
```

Review the exported file. The sample installs Dimensions using app ID `24`, confirmed for the EU example space; app IDs may differ in other regions. The `apps.dimensions.folders` list **replaces** the current Dimensions folder selection. Update it and the folder lists to match your requirements.

The example's `stories.copy` entry requires a story at `global/site-config` after organization. If the space doesn't have a `site-config`, or your site doesn't need a root copy, remove or adapt that entry. An existing root target is preserved; it is not overwritten or kept in sync with the global story.

## Plan and apply

```bash
unblok space setup plan --config dimensions-country-setup.yaml
```

Plan validates the YAML locally and lists operations. It does not inspect the space or enumerate which stories will move. Inspect the space's current content and any integrations that rely on full slugs before applying: moving content changes its paths.

When the configuration is ready, apply it to your chosen space:

```bash
unblok space setup apply \
  --config dimensions-country-setup.yaml \
  --space-id YOUR_SPACE_ID \
  --yes
```

Unblok ensures the folders, selects them for Dimensions, and moves other root-level stories and folders to `global`. It checks destination conflicts before moving and reports confirmed moves. It then creates the missing root `site-config` as a **draft** copy of the global story's current draft content. Story-level metadata and publication state are not copied.

On a repeat run, `global` and the folders in `organize_root.keep` stay at the root. Once both `global/site-config` and the root copy exist, the copy also stays at the root. Other newly added root entries are selected for movement on later runs. If a step fails, earlier changes remain; inspect the report and space before retrying.

## Create linked variants for a demo

For a demo that also creates the missing linked variants under `global/articles/` in Italy and Germany, use [setup-dimensions-demo.yaml](../../examples/features/setup-dimensions-demo.yaml) from the checkout. It includes both [the country-folder setup](../../examples/features/setup-country-folders.yaml) and [the bulk variant setup](../../examples/features/setup-missing-dimension-variants.yaml):

```bash
bun run start space setup plan --config examples/features/setup-dimensions-demo.yaml
bun run start space setup apply --config examples/features/setup-dimensions-demo.yaml --space-id YOUR_SPACE_ID --yes
```

Review both included files before applying. The example uses EU Dimensions app ID `24`; replace it with a verified regional slug or ID as needed. It expects `site-config` and selects all stories under `global/articles/`; each source needs a group ID before its missing variant can be created. The local plan cannot enumerate the live content. On repeat runs, existing linked variants are preserved, while newly added root content and source stories can be included. If any operation fails, earlier changes remain; inspect the report and any unconfirmed destination before retrying. Because the combined file uses relative `extends`, keep its two included files alongside it if copying it elsewhere.

## Check coverage and fill gaps

After setup, see which source stories have linked variants in each configured country:

```bash
unblok dimensions coverage \
  --starts-with global/articles/ \
  --space-id YOUR_SPACE_ID
```

To preview variants that could be created for specific countries, run:

```bash
unblok dimensions create-missing \
  --starts-with global/articles/ \
  --folder italy \
  --folder germany \
  --space-id YOUR_SPACE_ID \
  --plan
```

Review the live plan, then replace `--plan` with `--yes` to create the missing links. Omit `--folder` to select all other configured Dimensions folders. These commands show progress as stories are checked; add `--json` for a single machine-readable report. Coverage uses Storyblok's linked alternates, so a similarly named but unlinked story is reported as missing. You can also create a single linked variant with `story create-variant` or use the [single-variant YAML example](../../examples/features/setup-dimension-variants.yaml).

When teams begin editing country versions, the [comparison and synchronization recipe](dimensions-compare-and-sync.md) shows how to inspect differences and share selected block fields while preserving other local content.

Dimensions folder installation and configuration have been exercised in a test space. The root-copy behavior has mock test coverage; inspect the resulting stories and nested folders in your test space before using the recipe elsewhere.
