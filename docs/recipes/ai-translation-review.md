# From story to multilingual review with Unblok

Your content team has a story ready for an international audience. With Unblok, one operation can request AI translations and put each language version into the editorial workflow your team already uses in Storyblok.

Run it from the command line, describe it in YAML, or call it from JavaScript. The result is a clear handoff: Storyblok processes the translation requests, and editors can find the language versions in their review workflow.

## The scenario

1. An editor prepares a story, such as `home`.
2. An operator or an external automation invokes Unblok.
3. Unblok finds the story, ensures the chosen workflow supports language-based stages, and requests AI translation for each selected language.
4. After each request is accepted, Unblok assigns that language to the existing review stage and reports the outcome.
5. An editor checks the translation and takes the next editorial step in Storyblok.

Storyblok processes translation requests in the background. Unblok reports each queued task and review assignment, giving your team visibility into the handoff.

## Before you start

Set up Unblok with a Storyblok Management API token, then prepare a space with AI Translations, your target languages and an editorial review stage. The examples use the `home` story and the `Reviewing` stage in the `Default` workflow.

See [Getting started](../getting-started.md), [Storyblok AI Assistance](https://www.storyblok.com/docs/manuals/ai-assistance) and [Storyblok workflows](https://www.storyblok.com/docs/manuals/workflows) for setup details.

## Run it from the CLI

The examples use the installed `unblok` command. From a source checkout, run them with `bun run start` in place of `unblok`.

Find the story ID and check the languages configured in your space. Use the ID of the story you want to translate in place of the placeholder:

```bash
unblok language list --space-id YOUR_SPACE_ID
unblok story get --ref home --space-id YOUR_SPACE_ID --json
```

Then request translation and review assignment:

```bash
unblok story ai-translate \
  --id YOUR_STORY_ID \
  --language de \
  --language it \
  --review-stage Reviewing \
  --workflow Default \
  --space-id YOUR_SPACE_ID \
  --yes
```

Each language is reported separately. For a background task, `queued` means Storyblok accepted the request; the report includes its task ID. The review assignment has its own result. Use `--json` for a machine-readable report and a nonzero exit code when a request or assignment fails.

Use `--all-languages` instead of the repeated `--language` options to select all **additional** languages configured in the space. Each needs an AI translation code. When a space language has a custom identifier, use `--language <ai-code>:<space-code>`, such as `--language fr:fr-be`.

## Describe the handoff in YAML

For a repeatable setup, use an exact story slug so the recipe can find the story in each target space:

```yaml
version: 1

workflow:
  edit:
    - workflow: Default
      per_language_stages: true

stories:
  ai_translate:
    - story_slug: home
      languages:
        - lang: de
          code: de
        - lang: it
          code: it
      review_stage: Reviewing
      workflow: Default
      overwrite: false
```

Save this as `translation-review.yaml`, then review and apply it:

```bash
unblok space setup plan --config translation-review.yaml
unblok space setup apply --config translation-review.yaml --space-id YOUR_SPACE_ID --yes
```

The plan lets you review the configuration locally. During apply, Unblok resolves the slug in the target space and enables language-based stages before requesting translations. You can use `story_id` instead of `story_slug`, or `all_languages: true` instead of the `languages` list.

The [customer demo recipe](../../examples/customer-demo/steps/11-translate-home.yaml) uses the same pattern to request an Italian translation of `home`. It is included in the [main customer demo setup](../../examples/customer-demo/setup.yaml).

### Pass a story and language from an editorial event

Imagine an editor changes a story's workflow stage to `Translating`. Your webhook integration receives the event, chooses the target language and runs the same YAML recipe for that specific story. The story and language become inputs rather than values hard-coded in the file:

```yaml
version: 1

inputs:
  story_id: {}
  language: {}

workflow:
  edit:
    - workflow: Default
      per_language_stages: true

stories:
  ai_translate:
    - story_id: "${{ inputs.story_id }}"
      languages:
        - lang: "${{ inputs.language }}"
          code: "${{ inputs.language }}"
      review_stage: Reviewing
      workflow: Default
      overwrite: false
```

This is available as [setup-translation-from-event.yaml](../../examples/features/setup-translation-from-event.yaml). For example, the integration can run it with a story ID and `de` as the language:

```bash
unblok space setup apply \
  --config examples/features/setup-translation-from-event.yaml \
  --space-id YOUR_SPACE_ID \
  --input 'story_id=123456' \
  --input 'language=de' \
  --yes
```

In an automation, substitute the validated event values for the example inputs. The example uses the same code for the AI language and the space language; an integration can provide separate inputs when those codes differ. Storyblok's published [`stage.changed` example](https://www.storyblok.com/docs/concepts/webhooks) includes the story ID; the integration can supply the target language from the event when available or from its own configuration. The webhook receiver and its connection to Unblok are separate integrations.

## Use the operation in JavaScript

```js
import { createStoryblokGateway, translateStoryWithAi } from "unblok";

const gateway = createStoryblokGateway(process.env.STORYBLOK_TOKEN);
const report = await translateStoryWithAi(gateway, {
  spaceId: YOUR_SPACE_ID,
  storyId: YOUR_STORY_ID,
  languages: [
    { lang: "de", code: "de" },
    { lang: "it", code: "it" },
  ],
  review: { stage: "Reviewing", workflow: "Default" },
  overwrite: false,
});

for (const result of report.results) {
  console.log(result.language.code, result.status, result.backgroundTaskId);
  console.log("Review assignment:", result.review?.status);
}
if (report.failed) {
  // Inspect each result before deciding what to retry.
}
```

Replace the numeric placeholders with your own IDs and supply the token through your application's configuration. The library returns per-language results; it does not prompt or write terminal output. See the [library guide](../library.md#translate-story-content-with-ai) for the contract and error handling.

## Connect it to an editorial event

A possible next step is to let an editor move a story to a `Translating` stage and use that change to invoke Unblok. Storyblok emits a [`stage.changed` webhook](https://www.storyblok.com/docs/concepts/webhooks) containing the story, space, workflow and stage information. An external receiver or automation service can verify the webhook, filter for the intended workflow and stage, and invoke the CLI or library with the story ID—for example, through a GitHub Actions workflow.

The webhook receiver and GitHub Actions dispatch are separate integrations; Unblok provides the reusable content operation they can invoke. Try the [local webhook example](../../examples/integrations/workflow-translation/README.md) to connect a Storyblok workflow-stage change to this recipe.

For operation details, background-task behavior and repeat runs, see the [command reference](../commands.md#story-ai-translate) and [library guide](../library.md#translate-story-content-with-ai).
