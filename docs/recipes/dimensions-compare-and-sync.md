# Compare and synchronize country content

A shared campaign can start on a global home page and appear in several country experiences. The teams managing those experiences may have translated the text, changed the call to action, or selected a local image. When the global team updates a banner, how can they see what differs and share just the new image without replacing those local changes?

Unblok provides two complementary operations:

- **Compare linked variants** to see differences in their stored content.
- **Synchronize selected block fields** to copy a chosen value, such as the hero image, into another story.

For example, an editor can compare `global/home` with `germany/home`, preview an image change, and then apply it while keeping the German text and other fields. The comparison is available in the terminal and as structured JSON, so an AI agent or automation can use the same workflow.

## How this complements the Dimensions UI

Storyblok's Dimensions UI gives editors actions such as Clone, Merge and Overwrite. Unblok adds a focused way to **inspect differences before acting** and **choose individual fields to carry across**:

| Need                                     | Operation                  | Result                                                           |
| ---------------------------------------- | -------------------------- | ---------------------------------------------------------------- |
| See what differs across linked stories   | `story compare-dimensions` | A per-folder summary and content changes.                        |
| Review a proposed image change           | `story sync-block --plan`  | The target's current field value and the source value.           |
| Share only that image                    | `story sync-block --yes`   | The selected field is copied; other target fields are preserved. |
| Apply Storyblok's broader merge behavior | `story merge`              | A Dimensions merge request is sent to Storyblok.                 |

Comparison and selected-field synchronization also work in scripts and JavaScript integrations. This makes them useful for content audits, demos and editorial workflows where teams need to decide exactly what to share between markets.

## Before you begin

You need a Storyblok Management API token, access to the space, and a working Unblok installation. See [getting started](../getting-started.md). Examples use the installed `unblok` command; from this repository use `bun run start` in its place. Replace `YOUR_SPACE_ID` with your space ID.

The example assumes Dimensions folders named `global`, `germany`, and `italy`, with linked home stories. It also assumes that both stories have a `hero-section` block with an `image` field. **Use the actual paths, components and fields from your space.** You can inspect them with:

```bash
unblok dimensions list --space-id YOUR_SPACE_ID
unblok story get --ref global/home --space-id YOUR_SPACE_ID --json
unblok story get --ref germany/home --space-id YOUR_SPACE_ID --json
unblok component get hero-section --space-id YOUR_SPACE_ID --json
```

Story contents can include unpublished or sensitive information; handle JSON output accordingly.

## Compare the variants

```bash
unblok story compare-dimensions \
  --ref global/home \
  --folder germany \
  --folder italy \
  --space-id YOUR_SPACE_ID
```

The summary lists each requested folder, its linked story and the number of differences. Changed values appear beneath it. For example:

```text
Source: global/home

FOLDER   STORY         STATUS    CHANGES
───────  ────────────  ────────  ───────
germany  germany/home  compared  1
italy    italy/home    compared  0

Content differences
germany — germany/home
  changed /body/0/image/filename
    source: "https://example.com/global-banner.jpg"
    variant: "https://example.com/german-banner.jpg"
```

The example URLs are placeholders. Unblok identifies variants from Storyblok's linked alternates, so their slugs may differ. `not linked` means no linked alternate was returned for that folder; it does not prove that no similarly named story exists. Use `--json` for the versioned report and JSON Pointer paths. This is a read-only comparison of raw draft content, including block IDs; arrays are compared by position, and differences do not assess translation quality.

## Cherry-pick the global image

First preview the selected field without changing either story:

```bash
unblok story sync-block \
  --source global/home \
  --target germany/home \
  --component hero-section \
  --field image \
  --space-id YOUR_SPACE_ID \
  --plan
```

The plan shows the resolved stories and the complete target and source values for each field that differs. Inspect it to confirm that you selected the intended block and image. Add `--json` for an agent or script to inspect `status`, resolved story and block IDs, and `changes`.

When ready, rerun with `--yes` in place of `--plan`:

```bash
unblok story sync-block \
  --source global/home \
  --target germany/home \
  --component hero-section \
  --field image \
  --space-id YOUR_SPACE_ID \
  --yes
```

Unblok copies the **complete selected field value**, including the asset object, to the target draft. The target's hero text and other unselected fields remain as they were. The operation does not publish the story. Repeat `--field` to select additional fields; an unchanged target produces `unchanged` and no write. One invocation targets one story; run it separately for another country.

If either story contains more than one `hero-section`, use `--source-uid` and/or `--target-uid` to select the intended blocks. Unblok does not guess or create a missing story or block. It validates the component schema and fields, checks for duplicate block IDs, and re-reads both stories before saving. A change can still occur between that check and the write. The apply invocation recalculates its own plan; it does not lock or reuse a previous preview. If the saved result cannot be confirmed, inspect the target before retrying.

## Make the operation repeatable with YAML

The [bundled Dimensions recipe](../../examples/recipes/dimensions-sync-field.yaml) expresses the same operation with inputs for the source, target, component and field. From an installed CLI, export the example that matches your installed version:

```bash
unblok space setup examples --json
unblok space setup example dimensions-sync-field > dimensions-sync-field.yaml
```

Its defaults are `global/home`, `germany/home`, `hero-section` and `image`. The underlying operation looks like this:

```yaml
version: 1
stories:
  sync_blocks:
    - source: global/home
      target: germany/home
      component: hero-section
      fields:
        - image
```

Inspect the live values with `story sync-block --plan` first. A YAML plan validates the configuration locally and lists operations; it **does not** retrieve the stories or show their current differences. After review:

```bash
unblok space setup plan --config dimensions-sync-field.yaml \
  --input 'target=italy/home'
unblok space setup apply \
  --config dimensions-sync-field.yaml \
  --input 'target=italy/home' \
  --space-id YOUR_SPACE_ID \
  --yes
```

Pass matching `--input` values to both commands. This example targets `italy/home`; override `source`, `component` and `field` too when needed. Use the CLI's `story sync-block --plan` with the same choices to preview the actual field values before applying. The bundled YAML performs synchronization; comparison is the separate read-only CLI or library step described above.

YAML can declare multiple entries, one per target. Apply processes them in order and stops on failure; earlier successful changes remain. Inspect its report before retrying. For repeated components, edit the exported recipe to add `source_uid` and `target_uid` to an entry.

## Use the same action in JavaScript

```js
import { createStoryblokGateway, syncBlockFields } from "unblok";

const gateway = createStoryblokGateway(process.env.STORYBLOK_TOKEN);
const selection = {
  spaceId: YOUR_SPACE_ID,
  source: "global/home",
  target: "germany/home",
  component: "hero-section",
  fields: ["image"],
};

const preview = await syncBlockFields(gateway, selection);
console.log(preview.changes); // Review before applying.

// After the application has authorized the change:
const result = await syncBlockFields(gateway, { ...selection, apply: true });
```

The library does not prompt or load credentials for you. It returns `planned`, `updated`, or `unchanged`; errors use `UnblokError` codes. An application should make its own authorization decision between preview and apply. As with the CLI, applying re-reads the stories and recomputes the changes.

## Set up or extend the workflow

If your space needs the folders first, the [Dimensions country setup recipe](dimensions-country-setup.md) demonstrates configuring Dimensions, organizing root content and restoring a root `site-config`.

To prepare linked variants, use `story create-variant` or [setup-dimension-variants.yaml](../../examples/features/setup-dimension-variants.yaml). To request a broader Dimensions merge, use `story merge`; it is a separate operation with Storyblok's merge rules. See the [command reference](../commands.md#story-create-variant) for prerequisites and result semantics.

The Dimensions folder setup and comparison have been exercised in a test space. Selected-field synchronization and variant creation requests have automated mock coverage and should be verified in your own test space before incorporating them into a production workflow.
