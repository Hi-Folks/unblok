# AI usage improvements

This list tracks improvements to using Unblok with coding agents. Prefer changes that also help CLI, YAML, and library users.

- [x] Provide local, version-matched campaign and translation blueprint examples.
- [x] Explain how to inspect spaces, stories, component schemas, languages and workflows before adapting a recipe.
- [x] Add structured error codes and optional HTTP status to individual YAML apply operation failures, using the shared error model. Preserve useful partial results and document the report contract.
- [x] Add explicit project-local skill installation for Codex and Claude Code without overwriting existing guidance.
- [x] Create a small [repeatable agent evaluation](agent-evaluation/README.md) using realistic prompts, including a campaign and translation workflow. Check interface selection, valid inputs, execution permissions, and interpretation of queued and partial results using local or mocked resources.
- [ ] Run the agent evaluation with Codex and Claude Code, record results, and address observed gaps.
