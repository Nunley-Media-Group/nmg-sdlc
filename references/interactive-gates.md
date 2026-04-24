# Codex Plan-Mode Input Gates

**Consumed by**: every interactive nmg-sdlc skill.

Treat every "interactive prompt", "`request_user_input` gate", "menu", "review gate", "plan approval", or "ask the user" instruction as a Plan Mode input gate. User input must be collected with `request_user_input`; after all necessary input has been received, emit one decision-complete `<proposed_plan>` and treat that accepted plan as approval to execute. Do not add a second "proceed?" confirmation gate.

## Interactive Mode

When a gate needs user input:

1. Enter or remain in Plan Mode before any mutating action tied to the decision.
2. Ask with `request_user_input`, not a handwritten markdown menu.
3. Ask only material decisions. Ask one decision at a time unless up to three questions are tightly related and can be answered together.
4. Provide meaningful mutually exclusive choices. Put the recommended option first and suffix its label with `(Recommended)` when one exists.
5. Rely on the `request_user_input` free-form `Other` affordance when the user may need to clarify, revise, or supply missing context.
6. Stop after the tool call and wait for the user's answer. Do not continue the workflow, draft artifacts, run mutating commands, or create GitHub resources until the answer is available.
7. On the next user reply, map the answer to the selected option or free-text field, summarize the decision in one sentence, and continue collecting any remaining required input.
8. When every required decision is resolved, output exactly one `<proposed_plan>` block containing a decision-complete implementation plan. Once accepted, auto-execute that plan without asking for another approval.

Good `request_user_input` shape:

```json
{
  "questions": [
    {
      "id": "issue_type",
      "header": "Issue Type",
      "question": "Which issue type should I draft?",
      "options": [
        { "label": "Bug (Recommended)", "description": "Existing behavior is broken." },
        { "label": "Enhancement", "description": "New or improved behavior." },
        { "label": "Spike", "description": "Research that should produce an ADR, not code." }
      ]
    }
  ]
}
```

For review gates, include the artifact summary in the Plan Mode discussion before calling `request_user_input` so the user can decide without opening files. If a user decision discovers new required work, keep that work in the same plan before execution.

## Unattended Mode

When `.codex/unattended-mode` exists, never call `request_user_input`, never emit text asking for a reply, and never stop for a Plan Mode input gate. Follow the consuming skill's declared unattended-mode branch:

- **Pre-approved**: proceed automatically and log the auto-decision.
- **Deterministic default**: apply the documented default and log it.
- **Escalation**: emit the documented `ESCALATION:` line and stop or skip as specified.

## Prohibited Patterns

- Do not mention or attempt to call any legacy prompt widget.
- Do not ask a long questionnaire and then keep going before the user answers.
- Do not hand-render numbered menus for decisions that can be represented with `request_user_input`.
- Do not ask for final execution approval after a `<proposed_plan>` has been accepted.
- Do not prompt in unattended mode.
