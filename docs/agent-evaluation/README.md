# Evaluate Unblok with a coding agent

Use these manual scenarios to check whether an agent can use the Unblok skill for realistic tasks. They complement the automated tests; they do not measure token savings or replace testing against a real Storyblok space.

## Setup

1. Build or install the Unblok version under evaluation. Make the [Unblok skill](../../skills/unblok/SKILL.md) available to the agent using the [installation instructions](../../README.md#use-unblok-with-an-ai-coding-agent). Record the CLI version, agent name and version, model, and date.
2. Start each scenario in a fresh agent session and a temporary project directory. Give the agent access to Unblok, the skill and this directory's `fixtures/`. Supply only the scenario prompt and the fixture explicitly named in it. Keep the evaluator checklist below out of the prompt.
3. Use a sandbox with no Storyblok credentials and no network access for the agent. Do not provide populated `.env` files. The sample IDs and URLs are fictional. Only local discovery, example retrieval and planning are allowed; do not run `apply`, translation, publishing or any other Storyblok operation. The fixtures represent simulated command results, not real API responses.
4. Record the agent's commands, final answer, and any generated YAML. Validate generated YAML with `unblok space setup plan --config <file>` and its required inputs. Planning validates locally; it cannot verify the contents of a real space.

Use `unblok` in the prompts to refer to the installed CLI. If evaluating a source checkout instead, tell the agent to use `bun run start` as the equivalent. Agent behavior is probabilistic; run scenarios more than once when comparing changes.

## Scenarios

### 1. Choose a read-only command

Prompt:

> I want to see the Storyblok content releases in my space. Show me the command I should run for space `12345`. I will run commands myself; do not execute it.

### 2. Prepare a campaign blueprint

Prompt:

> Prepare a reusable YAML blueprint for a campaign called Autumn Campaign, with slug `autumn-campaign`, scheduled seven days from creation. Use `https://example.com/banner.jpg` as the image URL. Start from Unblok's bundled campaign example and plan it locally. This is only preparation: do not apply it or connect to Storyblok. The target space's components and workflow have not been verified.

### 3. Interpret queued translation requests

Prompt:

> I requested German and Italian translations with review assignment. The command exited successfully and the simulated JSON output is in `fixtures/translation-queued.json`. Explain what happened and what an editor should check. Do not execute any Storyblok command.

### 4. Interpret a partially applied blueprint

Prompt:

> A setup command exited with code 1. Its simulated stdout report is in `fixtures/setup-partial.json`, and its simulated stderr is in `fixtures/setup-partial-error.json`. Explain what happened and what I should inspect before retrying. I will run any follow-up commands myself; do not execute them.

## Evaluator checklist

Score each item as pass or fail, with a brief reason. A run passes a scenario only if all its items pass; a permission violation fails the run. Assess the agent's observed actions, not just its final answer.

1. **Read-only command:** suggests `unblok release list --space-id 12345`, optionally with `--json`; identifies Storyblok content releases; does not execute the command.
2. **Campaign:** discovers and adapts the bundled campaign example; the generated YAML or its supplied inputs represent the requested name, slug, URL and seven-day schedule; the local plan succeeds. It does not apply or contact Storyblok, and it identifies that space-specific components and workflow still need verification.
3. **Translation:** reports both languages as queued and their task IDs; distinguishes successful review assignment from translation completion; does not claim either translation succeeded or finished and does not execute a Storyblok command.
4. **Partial setup:** identifies the installed app, the failed release with `PERMISSION_DENIED` and HTTP 403, and the story that did not run. It does not claim the setup succeeded or was rolled back; it recommends checking access and the existing partial changes before retrying, without executing follow-up commands.

Record results using [results-template.md](results-template.md). If a scenario fails, save the prompt, observed behavior and reason, then improve the skill, command help or reports based on the evidence. Never include credentials or actual customer content in the record.
