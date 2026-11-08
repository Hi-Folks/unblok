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
