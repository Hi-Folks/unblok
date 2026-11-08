# Library API

The repository exposes an initial Bun/TypeScript library entry point. It is currently private and intended for use from this checkout or as a workspace dependency; the CLI release packages do not yet include this library. The API may change while it is being developed.

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

## Handling errors and partial results

Both assignment APIs perform validation and planning before updates. Invalid input, missing stories, workflow lookup failures, and API errors during that preparation reject the promise before any assignment is attempted. Planning methods reject on these errors and do not write.

During assignment, an individual Storyblok update failure is recorded with `status: "failed"` and an `error` message in `report.operations`; the action continues with other stories and resolves with a report. Successful changes are not rolled back. Inspect `report.summary.failed` even when the promise resolves:

```ts
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

Import `UnblokError` from `unblok` for the `instanceof` check. Its `code` is one of `INVALID_INPUT`, `NOT_FOUND`, `AMBIGUOUS`, `UNAUTHORIZED`, `PERMISSION_DENIED`, `RATE_LIMITED`, `API_ERROR`, or `UNKNOWN`. A Storyblok HTTP failure also includes `status` when available. The original exception is available as `cause` on rejected `UnblokError` instances; it may contain sensitive API details, so handle it carefully. Per-story failures contain a serializable `{ code, message, status? }` object and do not expose the original exception. Unknown errors are classified as `UNKNOWN`; codes are not guessed from error-message text. A rate-limit code alone does not guarantee that retrying a write is safe.

The workflow action also accepts `onOperation`. If that callback throws, the promise rejects and concurrent assignments may already have completed or still be in progress, so callbacks should handle their own errors. Its callback receives the same structured per-story errors as the final report.
