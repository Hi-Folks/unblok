# Copy story content by path

`story sync-path` copies one selected value from a source story draft to the **same JSON Pointer path** in a target story draft. It can replace a single component field, an entire block, or a blocks field. The operation is useful after comparing country variants: take a path from the comparison, preview the copy, and apply it when the selected positions are correct.

For example, copy a global headline to its Italian variant while leaving the rest of the Italian story in place. The stories do not have to be linked Dimensions variants; they must be distinct stories in the same space.

## Choose what to copy

Paths start at the story's `content` object. Array indices are zero-based. For example:

| Path                      | Selected value                                   | Result in the target                                                                              |
| ------------------------- | ------------------------------------------------ | ------------------------------------------------------------------------------------------------- |
| `/body/0/headline/0/text` | `text` field on a headline component             | Replaces the entire `text` value. Other headline fields remain unchanged.                         |
| `/body/0/headline/0`      | First block in the `headline` array              | Replaces the complete target block with the source block, including its fields and nested blocks. |
| `/body/0/headline`        | The `headline` field on the first body component | Replaces the complete field value, including its blocks and their order.                          |

Array indices select **positions**, not block identities. If the stories have been reordered, `/body/0/headline/0` can refer to different blocks. Unblok does not search for a matching `_uid` or insert a missing block. Review the source and target values in the plan, including component names and IDs, before applying.

A block selection must identify an existing component block in both stories. A field selection must identify an existing direct field on a component in both stories, and the parent components must have the same component name. The command copies the complete selected field value, including objects and arrays; it does not select a nested property inside an asset or rich-text object. The path must exist on both sides, so a difference reported as an addition or removal cannot necessarily be copied directly.

The path uses JSON Pointer escaping: write `~1` for `/` and `~0` for `~` inside a field name. For example, the field `a/b~c` is addressed as `/a~1b~0c`. Empty segments and reserved segments (`_uid`, `component`, `__proto__`, `prototype`, and `constructor`) cannot be selected directly.

## Compare and preview

Inspect the source and the linked target variants:

```bash
unblok story compare-dimensions \
  --ref global/home \
  --folder italy \
  --space-id YOUR_SPACE_ID
```

The comparison uses paths relative to `content` and compares arrays by position. Once you have selected a path, preview its copy:

```bash
unblok story sync-path \
  --source global/home \
  --target italy/home \
  --path /body/0/headline/0 \
  --space-id YOUR_SPACE_ID \
  --plan
```

The preview displays `Before`, the target's current value, and `After`, the complete source value that would replace it. Source and target accept exact full slugs or numeric story IDs. `--plan` reads the stories and checks the proposed result without writing. When the selected values already match, the result is `unchanged` and no write is needed.

Add `--json` for a single structured report. Its `apiVersion` is `unblok/story-sync-path-v1`, with `status`, source and target identity, `path`, `before`, and `after`. Status is `planned`, `updated`, or `unchanged`. The values may contain story content, so handle the report accordingly.

## Apply the change

After reviewing the preview, run the same command with `--yes` instead of `--plan`:

```bash
unblok story sync-path \
  --source global/home \
  --target italy/home \
  --path /body/0/headline/0 \
  --space-id YOUR_SPACE_ID \
  --yes
```

Unblok replaces the selected value in the target draft and does not publish it. Copying a block or blocks field preserves the source `_uid` values, including those of nested blocks. It checks the resulting story for missing or duplicate block UIDs before sending an update.

Apply calculates a new plan; it does not reuse or lock the earlier preview. It re-reads both drafts before writing and stops if their content or identity changed during that run. A change can still occur between the last read and the write. After writing, Unblok checks that Storyblok returned the selected value. If the write cannot be confirmed, inspect the target before retrying.

## Use a YAML setup

The same operation is available in a setup file:

```yaml
version: 1
stories:
  sync_paths:
    - source: global/home
      target: italy/home
      path: /body/0/headline/0
```

See [setup-sync-story-path.yaml](../examples/features/setup-sync-story-path.yaml). A setup plan validates the YAML locally and lists operations; it does **not** read the stories or preview their values. Use `story sync-path --plan` to inspect the live change, then apply the setup with `space setup apply --config YOUR_FILE --space-id YOUR_SPACE_ID --yes`. Repeating an unchanged operation skips the write. Setup stops on failure; earlier completed operations remain in place.

## Use the JavaScript library

```ts
import { createStoryblokGateway, syncStoryPath } from "unblok";

const token = process.env.STORYBLOK_TOKEN;
if (!token) throw new Error("Set STORYBLOK_TOKEN");
const gateway = createStoryblokGateway(token);
const selection = {
  spaceId: 123456,
  source: "global/home",
  target: "italy/home",
  path: "/body/0/headline/0",
};

const plan = await syncStoryPath(gateway, selection);
console.log(plan.before, plan.after);

// Apply only after reviewing and authorizing the change.
const result = await syncStoryPath(gateway, { ...selection, apply: true });
console.log(result.status);
```

The action defaults to preview and returns the same report shape as the CLI. It throws an `UnblokError` for invalid selections, missing paths, conflicts and API failures. It accepts a custom `SyncPathGateway` and does not read credentials, prompt, or print output itself.

For selecting component fields by block UID rather than by position, use [`story sync-block`](commands.md#story-sync-block).
