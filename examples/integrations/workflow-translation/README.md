# Example: start translation from a workflow change

This small local receiver connects an editor's Storyblok workflow change to the [translation and review YAML recipe](../../features/setup-translation-from-event.yaml). When a story enters `Translating` in the `Default` workflow, the receiver verifies the webhook, runs Unblok for the configured language, and assigns that language to `Reviewing`.

```text
Storyblok stage.changed → local webhook receiver → Unblok YAML → translation request + review assignment
```

The receiver checks Storyblok's HMAC-SHA1 signature against the original request bytes, then filters by space, workflow and stage. It uses the event's story ID and a **configured** language: Storyblok's [published workflow webhook example](https://www.storyblok.com/docs/concepts/webhooks) does not include a language. Its [signature guide](https://www.storyblok.com/tp/webhook-secret-with-different-technologies) describes the header and signing method.

## Prepare the space

1. Choose a test space with Storyblok AI Translations enabled, a target language configured, and translatable story fields.
2. Ensure the workflow has a `Translating` stage and a `Reviewing` stage. The YAML recipe enables language-based workflow stages on that workflow if needed.
3. Create a Storyblok webhook with a secret and subscribe to `stage.changed`. Storyblok documents webhook secrets as a paid-plan feature.

## Run the receiver

From the Unblok checkout, install dependencies and build the Node.js CLI:

```bash
bun install --frozen-lockfile
bun run build
```

Set these environment variables in your shell; use your own values and keep the token and secret private:

```bash
export STORYBLOK_TOKEN='YOUR_MANAGEMENT_API_TOKEN'
export STORYBLOK_WEBHOOK_SECRET='YOUR_WEBHOOK_SECRET'
export STORYBLOK_SPACE_ID='YOUR_SPACE_ID'
export TRANSLATION_LANGUAGE='de'
```

`TRANSLATION_LANGUAGE` is a shared AI and space language code such as `de` or `it`. Optional settings are `TRANSLATION_WORKFLOW` (default `Default`), `TRANSLATION_TRIGGER_STAGE` (default `Translating`), `TRANSLATION_REVIEW_STAGE` (default `Reviewing`) and `PORT` (default `8787`). The trigger and review stages must differ.

Start the receiver with Node.js 22.21.0 or newer:

```bash
node examples/integrations/workflow-translation/server.mjs
```

It listens on `127.0.0.1:8787/webhooks/storyblok` by default. Expose that local endpoint through an HTTPS tunnel you trust and enter its public URL as the Storyblok webhook endpoint. Keep the receiver running, then move a test story to `Translating` in Storyblok.

The receiver runs the built CLI with the story ID and language as separate YAML inputs. A successful JSON response with `status: "submitted"` means the setup request completed and Storyblok accepted the translation request; translation itself can continue in the background. Inspect the language version and its review stage in Storyblok.

## Behavior and next steps

- Requests with an invalid signature are rejected; unrelated spaces, workflows or stages are ignored. This also prevents the `Reviewing` assignment from triggering another translation.
- The sample waits for the Unblok process and returns a JSON response. Failures return HTTP 500; the local log identifies the story without logging the token or webhook body. Storyblok documents that webhooks are not automatically retried, so investigate failures using its webhook logs and the story state.
- The receiver is a local demonstration, not a durable job queue. It does not deduplicate or prevent replayed events, persist work across restarts, or monitor background-task completion. Repeated valid events can issue new AI translation requests and may incur charges. A production deployment needs appropriate replay handling, durable execution, observability and access controls.
- The stage is assigned as soon as the request is accepted, so the editor should verify that translation has finished. See the [translation recipe](../../../docs/recipes/ai-translation-review.md) and [command reference](../../../docs/commands.md#story-ai-translate) for details.

To test the example without contacting Storyblok:

```bash
bun test examples/integrations/workflow-translation/handler.test.js
```
