# Library API

The repository exposes an initial JavaScript/TypeScript library entry point for Node.js 22.21.0 or newer and Bun. The release packaging includes the library in the same npm package as the CLI. The lower Node.js requirement takes effect in the next release. The API may change while it is being developed.

After a release containing the library is published, install it in a Bun project with `bun add unblok`.

For example, preview and assign a workflow stage to specific story full slugs:

```ts
import {
  createStoryblokGateway,
  planStoryWorkflow,
  assignStoryWorkflow,
} from "unblok";

const token = process.env.STORYBLOK_TOKEN;
if (!token) throw new Error("Set STORYBLOK_TOKEN");
const gateway = createStoryblokGateway(token);
const selection = {
  spaceId: 123456,
  workflow: "Editorial",
  stage: "Review",
  stories: ["home", "about"],
};

const plan = await planStoryWorkflow(gateway, selection);
console.log(plan.summary); // No changes have been made.

// Call only when ready to apply the changes.
const report = await assignStoryWorkflow(gateway, selection);
console.log(report.summary);
```

The story list must contain exact, nonempty full slugs. Every slug is resolved before assignment; a missing story or a failure to resolve the workflow rejects the call without assigning stories. Assignment failures for individual stories are returned in `report.operations` and counted in `report.summary.failed`; callers should inspect that count. Stories already in the stage are reported as unchanged. Pass `{ concurrency: 1 }` as the third argument to assign sequentially, or provide `onOperation` to observe results. The default concurrency is four, with a maximum of ten.

The gateway is supplied explicitly, so the same operations work with a custom implementation of the exported `WorkflowStoryGateway` type. No action reads credentials, prompts, or writes terminal output. The client factory accepts the token explicitly; do not hard-code or log it.

## Publish a story

```ts
import { publishStory } from "unblok";

const result = await publishStory(gateway, {
  spaceId: 123456,
  story: "pages/welcome", // Exact full slug, without a leading slash.
});
console.log(result.status, result.storyId); // "published" or "unchanged"
```

This explicitly publishes the current draft, including unpublished changes to a story that is already published. A story confirmed published with no pending changes is left unchanged. The action checks the story's current details before publishing and fails if its identity or publication state cannot be verified. Missing stories and API failures reject with `UnblokError`. As with any read followed by a write, another editor could change the draft between the check and publication. This function does not select individual languages or releases. Storyblok describes the endpoint in its [publish API reference](https://www.storyblok.com/docs/api/management/stories/publish-a-story).

## Create a story

```ts
import { ensureStoryCreated } from "unblok";

const result = await ensureStoryCreated(gateway, {
  spaceId: 123456,
  name: "Welcome",
  slug: "welcome",
  content: {
    component: "page",
    body: [{ component: "hero", headline: "Hello" }],
  },
});
console.log(result.status); // "created" or "unchanged"
```

This creates an unpublished story at the space root. The slug must be root-level; creating stories inside folders is not supported. The content's component names and fields must match components in the space. Missing `_uid` values are generated for component blocks, including nested blocks; supplied IDs are preserved and the input is not modified.

If a story already exists at that slug, the action reports `unchanged` and preserves its content without comparing or updating it. Errors use `UnblokError`. YAML `stories.create` shares this behavior and additionally resolves its YAML-specific asset directives; library callers should provide resolved asset objects in their content. Concurrent creation by another process can still cause an API conflict.

## Upload an asset

```ts
import { readFile } from "node:fs/promises";
import { ensureAssetUploaded } from "unblok";

const result = await ensureAssetUploaded(gateway, {
  spaceId: 123456,
  filename: "banner.png",
  data: await readFile("./banner.png"),
  folder: "Demo/Images", // Omit for the asset root.
});
console.log(result.status); // "created" or "unchanged"
```

The `folder` path uses `/` between levels: `Demo/Images` creates or reuses `Demo` and its child `Images`. The action compares an existing exact filename's content and leaves identical assets unchanged. It rejects ambiguous folder or asset matches and different content with `UnblokError`; it never replaces an asset. Folders created before a later upload failure remain in the space. The YAML asset setup uses the same comparison and upload logic. The caller supplies bytes, so the library does not read local files itself.

## Install an app by slug

```ts
import { createStoryblokGateway, ensureAppInstalled } from "unblok";

const gateway = createStoryblokGateway(token); // The target space ID selects the region.
const result = await ensureAppInstalled(gateway, {
  spaceId: 1500000,
  slug: "import",
});
console.log(result.status); // "installed" or "unchanged"
```

The action uses the same slug lookup as CLI and YAML app installation, checks existing installations, and resolves the app ID from the target space's regional catalog. It rejects missing or ambiguous slugs with `UnblokError`. For an ID whose region cannot be inferred correctly, create the gateway with an explicit override, for example `createStoryblokGateway(token, { region: "us" })`. Supported region codes are `eu`, `us`, `ca`, `ap`, and `cn`; the override applies to all space-scoped requests made through that gateway. Otherwise Unblok infers the region from the ID and falls back to EU if it cannot infer one. The availability of a particular app and its regional identifiers depend on Storyblok.

## Assign story tags

Use the same gateway to preview or add tags to exact story full slugs:

```ts
import { planStoryTags, assignStoryTags } from "unblok";

const selection = {
  spaceId: 123456,
  stories: ["home", "about"],
  tags: ["Marketing", "Landing"],
};
const plan = await planStoryTags(gateway, selection);
const report = await assignStoryTags(gateway, selection);
console.log(report.summary); // Inspect failed as well as updated and unchanged.
```

Planning makes no changes. Assignment adds the requested tags and preserves existing tags; repeated inputs are deduplicated, and a repeat run skips stories that already have the tags. Missing stories stop the operation before any update. Individual update failures are returned in `report.operations` and counted in `report.summary.failed`, while other stories continue. The library uses the same action as CLI and YAML tag assignment. Custom gateways can implement the exported `StoryTagGateway` type.

## Ensure translated story slugs

```ts
import { ensureTranslatedSlugs } from "unblok";

const result = await ensureTranslatedSlugs(gateway, {
  spaceId: 123456,
  story: "about",
  translations: [
    { language: "it", slug: "chi-siamo", name: "Chi siamo" },
    { language: "fr", slug: "a-propos" },
  ],
});
console.log(result.status); // "updated" or "unchanged"
```

The Translatable Slugs app must be installed and each requested language enabled in the space. The action creates or updates only the requested translations; other languages are preserved. When `name` is omitted, an existing translated name is left unchanged. A repeat call skips matching values. Missing prerequisites, invalid inputs, ambiguous translations, and API errors reject with `UnblokError`; see the error section below. YAML `stories.translated_slugs` uses the same reconciliation logic. This operation does not publish the story.

## Update a story block

```ts
import { updateStoryBlock } from "unblok";

const result = await updateStoryBlock(gateway, {
  spaceId: 123456,
  story: "home",
  component: "hero-section",
  fields: { text: "Welcome to our site" },
});
console.log(result.status); // "updated" or "unchanged"
```

The story must have exactly one block of the specified component; missing or multiple matches fail before saving. Only existing fields can be changed. Nested field values are replaced in full, and other story content is preserved. The update is saved as a draft and is not published. YAML block updates use the same reconciliation action; the CLI also supports selecting a block by UID.

## Ensure a component field

```ts
import { ensureComponentField } from "unblok";

const result = await ensureComponentField(gateway, {
  spaceId: 123456,
  component: "article-page",
  field: "SEO",
  type: "custom",
  field_type: "sb-ai-seo",
  tab: "SEO",
});
console.log(result.status); // "created", "updated", or "unchanged"
```

The action preserves unrelated schema and creates or updates the specified field and tab. An existing field of a different type is rejected. It uses the same reconciliation action as YAML component-field setup; CLI `component field-add` has its own add-only behavior.

## Handling errors and partial results

Both assignment APIs perform validation and planning before updates. Invalid input, missing stories, workflow lookup failures, and API errors during that preparation reject the promise before any assignment is attempted. Planning methods reject on these errors and do not write.

During assignment, an individual Storyblok update failure is recorded with `status: "failed"` and an `error` message in `report.operations`; the action continues with other stories and resolves with a report. Successful changes are not rolled back. Inspect `report.summary.failed` even when the promise resolves:

```ts
import { UnblokError } from "unblok";

try {
  const report = await assignStoryTags(gateway, selection);
  if (report.summary.failed > 0) {
    for (const operation of report.operations) {
      if (operation.status === "failed") {
        console.error(operation.slug, operation.error?.code);
      }
    }
    // Decide whether and how to retry the failed stories.
  }
} catch (error) {
  // Validation or preparation failed; inspect the error before retrying.
  if (error instanceof UnblokError) console.error(error.code, error.message);
  else console.error("Unexpected error");
}
```

Import `UnblokError` from `unblok` for the `instanceof` check. Its `code` is one of `INVALID_INPUT`, `NOT_FOUND`, `AMBIGUOUS`, `CONFLICT`, `UNAUTHORIZED`, `PERMISSION_DENIED`, `RATE_LIMITED`, `API_ERROR`, or `UNKNOWN`. A Storyblok HTTP failure also includes `status` when available. The original exception is available as `cause` on rejected `UnblokError` instances; it may contain sensitive API details, so handle it carefully. Per-story failures contain a serializable `{ code, message, status? }` object and do not expose the original exception. Unknown errors are classified as `UNKNOWN`; codes are not guessed from error-message text. A rate-limit code alone does not guarantee that retrying a write is safe.

The workflow action also accepts `onOperation`. If that callback throws, the promise rejects and concurrent assignments may already have completed or still be in progress, so callbacks should handle their own errors. Its callback receives the same structured per-story errors as the final report.
