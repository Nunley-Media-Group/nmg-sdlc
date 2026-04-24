# Codex Interactive Gates

**Consumed by**: every interactive nmg-sdlc skill.

Codex does not expose a generally available question-widget during normal skill execution. Treat every "interactive prompt", "Codex interactive gate", "menu", "review gate", or "ask the user" instruction as a conversational gate in the chat.

## Interactive Mode

When a gate needs user input:

1. Render a concise markdown prompt in the current conversation.
2. Ask one decision at a time unless the questions are tightly related and can be answered together.
3. Use numbered choices for menus. Put the recommended option first and label it `(recommended)` when one exists.
4. Include a free-text escape hatch when the user may need to clarify, revise, or supply missing context.
5. End the assistant turn immediately after the question. Do not continue the workflow, draft artifacts, run mutating commands, or create GitHub resources until the user answers.
6. On the next user reply, map the answer to the menu choice or free-text field, summarize the decision in one sentence, and continue the workflow.

Good prompt shape:

```markdown
Which issue type should I draft?

1. Bug (recommended) - Existing behavior is broken.
2. Enhancement - New or improved behavior.
3. Spike - Research that should produce an ADR, not code.

Reply with a number, or describe a different classification.
```

For review gates, include the artifact summary before the menu so the user can decide without opening files.

## Unattended Mode

When `.codex/unattended-mode` exists, never stop for a conversational gate. Follow the consuming skill's declared unattended-mode branch:

- **Pre-approved**: proceed automatically and log the auto-decision.
- **Deterministic default**: apply the documented default and log it.
- **Escalation**: emit the documented `ESCALATION:` line and stop or skip as specified.

## Prohibited Patterns

- Do not mention or attempt to call any legacy prompt widget.
- Do not ask a long questionnaire and then keep going before the user answers.
- Do not hide all options in prose. Menus must be scannable.
- Do not prompt in unattended mode.
