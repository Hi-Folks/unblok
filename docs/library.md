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

## List, inspect and create Pipeline stages

```ts
import {
  listPipelineBranches,
  getPipelineBranch,
  ensurePipelineBranch,
} from "unblok";

const stages = await listPipelineBranches(gateway, { spaceId: 123456 });
const result = await ensurePipelineBranch(gateway, {
  spaceId: 123456,
  name: "Go Live",
});
console.log(result.status, result.branch.id); // "created" or "unchanged"
const stage = await getPipelineBranch(gateway, {
  spaceId: 123456,
  reference: "Go Live",
});
```

The Pipelines app (`branches`) must be installed. Names match exactly, with surrounding spaces removed. The optional `source` must identify one stage returned by the API; an existing target with a different or missing source reports `CONFLICT`. If omitted, Unblok leaves source selection to Storyblok and does not verify the source of an existing stage. Missing or ambiguous stages reject with `UnblokError`. It does not change existing stages or deploy content. The CLI and YAML use the same action; concurrent operations and incomplete API pagination can still result in duplicates.

`getPipelineBranch` accepts a numeric ID as a string or an exact, unique stage name. Numeric-only references are interpreted as IDs. It returns only the ID, name and optional source ID, without URLs. Missing or ambiguous names and API failures reject with `UnblokError`.

## List, inspect and create Storyblok releases

```ts
import { listReleases, getRelease, createRelease } from "unblok";

const releases = await listReleases(gateway, { spaceId: 123456 });
const result = await createRelease(gateway, {
  spaceId: 123456,
  name: "Summer campaign",
  releaseAt: "2027-10-01 09:00", // Optional; omit for an unscheduled release.
});
console.log(result.status, result.release.id); // "created" or "unchanged"
const release = await getRelease(gateway, {
  spaceId: 123456,
  reference: "Summer campaign",
});
```

The Releases app must be installed and enabled. The action checks installed app slugs `releases_only` and `releases`; it cannot confirm whether the app is enabled. Creation checks for an exact, case-sensitive name and returns the existing release as `unchanged`; multiple matches cause an `AMBIGUOUS` error. The optional `releaseAt` is sent unchanged in Storyblok's `YYYY-MM-DD HH:mm` format. Storyblok says it stores schedules in UTC and displays them in the account timezone, but does not specify how the API interprets timezone-free input; verify the time in Storyblok. For an existing name, a requested schedule must exactly match the returned `release_at` string or the action reports a conflict; equivalent times formatted differently may also conflict. It never reschedules an existing release. Requested names are trimmed. Concurrent creations or incomplete API pagination could still produce duplicates. Inputs and API failures reject with `UnblokError`. These functions use the gateway's region selection and do not install the app.

`getRelease` accepts a numeric ID as a string or an exact, unique release name. Numeric-only references are interpreted as IDs. Missing or ambiguous names and API failures reject with `UnblokError`.

Alternatively, use `releaseInDays: 7` instead of `releaseAt`. The integer must be between 1 and 36500. At creation time, Unblok adds that many 24-hour days to the current UTC time, rounds down to the minute, and sends the resulting timezone-free value to Storyblok. An existing release keeps its schedule on reruns; the relative date is calculated only for a new release. Verify the resulting time in Storyblok.

## Publish a Storyblok release

```ts
import { publishRelease } from "unblok";

const result = await publishRelease(gateway, {
  spaceId: 123456,
  reference: "Summer campaign", // Exact name or numeric ID as a string.
});
console.log(result.status, result.releaseId); // "published" or "unchanged"
```

This requests immediate publication. The action checks the release's `released` flag, skips an already published release and refuses to publish if the flag is missing. It reports success only when Storyblok confirms publication. If a request was sent but the result cannot be confirmed, inspect the release before retrying. The API update includes the previously read release name, so concurrent renames can race the request. The CLI and YAML use the same action. It has not yet been verified against a live space.

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

## Create content folders

```ts
import { ensureStoryFolder } from "unblok";

const result = await ensureStoryFolder(gateway, {
  spaceId: 123456,
  path: "articles/news",
});
console.log(result.status, result.folderId, result.created);
```

Missing path segments are created in order and existing folders are reused. Each segment is used as its name and slug. The result reports `created` or `unchanged`, the final folder ID, and created paths. The action rejects story collisions and ambiguous folder matches. If a later request fails, already created folders remain; inspect and retry. Concurrent creation can still race. CLI and YAML use the same action.

## Create a story

```ts
import { ensureStoryCreated } from "unblok";

const result = await ensureStoryCreated(gateway, {
  spaceId: 123456,
  name: "Welcome",
  slug: "welcome",
  content: {
    component: "default-page",
    body: [],
  },
});
console.log(result.status); // "created" or "unchanged"
```

This creates an unpublished story at the space root. To create one in an existing folder, pass a full slug such as `articles/news/welcome`; Unblok resolves `articles/news` to its folder ID and creates `welcome` inside it. The folder must already exist and resolve uniquely; missing or ambiguous folders cause an error and are not created. Custom gateways must implement `findStoryFolderBySlug` for nested creation. The content's component names and fields must match components in the space. Missing `_uid` values are generated for component blocks, including nested blocks; supplied IDs are preserved and the input is not modified.

If a story already exists at that slug, the action reports `unchanged` and preserves its content without comparing or updating it. Errors use `UnblokError`. YAML `stories.create` shares this behavior and additionally resolves its YAML-specific asset directives; library callers should provide resolved asset objects in their content. Concurrent creation by another process can still cause an API conflict.

Pass `releaseId: 123456` to `ensureStoryCreated` to create the new story in an existing release. If a story with that full slug already exists, Unblok skips it only when the returned `release_ids` confirms it belongs to the selected release; otherwise it reports a conflict. Pass the same `releaseId` to `updateStoryBlock` to read and update the selected release version. Without it, both operations target the ordinary draft. The API integration is covered by mocked tests and has not been verified against a live release.

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

## Translate story content with AI

```ts
import { translateStoryWithAi } from "unblok";

const report = await translateStoryWithAi(gateway, {
  spaceId: 123456,
  storyId: 789012,
  languages: [
    { lang: "de", code: "de" },
    { lang: "fr", code: "fr" },
  ],
});
```

`lang` is Storyblok's AI language code; `code` is the configured space language identifier. `overwrite` defaults to `false`. The result contains `updated`, `unchanged`, `queued`, `failed`, or `not_run` for each language, including classified error information. When Storyblok returns translated content directly, the action checks and saves it before continuing. When it returns a background task, the action reports `queued` and its `backgroundTaskId` without polling, then requests the next language. Queued tasks for the same story can overlap and may interfere; check each resulting translation. A queued status only confirms acceptance, not successful completion. Invalid input rejects with `UnblokError`. A translation request is made on every run and may incur usage charges. For direct responses, the action rejects unrelated content changes and checks for intervening edits before saving; another edit can still occur between the check and update.

Use `allLanguages: true` instead of `languages` to select all additional languages in the space. The gateway must implement `listLanguages`. Every language must have a nonempty AI translation code; missing mappings and empty language lists fail before translation. The default language is excluded.

Pass `review: { stage: "Review translation", workflow: "Default" }` to enable language-based stages on the stage's workflow and assign each accepted language to that existing stage. The workflow reference is optional when the stage is unique. `results[].review` reports `assigned`, `unchanged` or `failed` independently of translation; a failed review assignment makes the report fail but does not undo a queued task. Assignment happens immediately after the request is accepted, while the task may still be running. Custom gateways need the workflow methods in `TranslationReviewGateway`. This behavior uses captured Storyblok UI payloads and has not yet been tested live through Unblok.

## Edit a workflow

```ts
import { editWorkflow } from "unblok";

const result = await editWorkflow(gateway, {
  spaceId: 123456,
  workflow: "Default",
  perLanguageStages: true,
});
```

The optional fields are `name`, `contentTypes` and `perLanguageStages`. Only supplied fields are updated; `contentTypes` replaces the entire list. Renaming requires a numeric workflow ID as a string to keep retries safe. The result has `updated` or `unchanged` and the workflow ID; validation, missing data and unverifiable updates reject with `UnblokError`. Concurrent edits may race the update. This API uses the same action as the CLI, YAML and translation review setup.
