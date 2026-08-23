# Design: Provide situation paragraphs on interactive interview asks

**Issue**: #225
**Date**: 2026-08-23
**Status**: Approved
**Author**: NMG
**Related Spec**: specs/209-remove-draft-issue-run-total-ask-quota/

---

## Overview

Documentation-contract cutover. Add one shared interview rule: every interview or preference `ask` `question` includes a short paragraph stating the situation and the facts needed to choose among the shown options. The operator must be able to pick from that prompt alone. Do not paste the full need statement or issue body. Per-option `description` and `header` remain optional and are not the required vehicle.

No extension command, `ask` schema, controller, GitHub mutation, handoff, or interview-budget changes. Approval remains exclusively `xd://propose`.

Before editing any file under `workflows/` or `references/`, resolve and read `skill://skill-creator` and follow that editing procedure.

## Shared contract

### `references/interactive-gates.md` Interview section

Keep the existing bullets:

- 2–4 options
- recommended first
- max 3 questions per call

Add these exact normative sentences after those bullets:

```
Interview and preference `question` text includes a short paragraph stating the situation and the facts needed to choose among the shown options. The user must be able to select an option from that prompt without relying on earlier chat text. Do not paste the full need statement or issue body. Per-option `description` may still be used but is not the required vehicle for the paragraph.

Required canned gates keep their existing question and option labels and are not required to add a situation paragraph: draft-issue classification, draft-issue milestone, draft-issue split confirmation, draft-issue need-gather when `$ARGUMENTS` is absent, and write-spec continue/finish.
```

Do not change the Plan-mode entry section or the `xd://propose` finish rule.

## Interview sites that gain the paragraph rule

Add the same `short paragraph stating the situation` requirement to each interview/preference site. Do not change budgets, option counts, or recommended-first ordering.

### `workflows/draft-issue/WORKFLOW.md` step 6 only

After the existing "Use focused asks only for preferences and tradeoffs..." sentence, add:

`Each interview or preference question includes a short paragraph stating the situation and the facts needed to choose among the shown options. Do not paste the full need statement.`

Do not edit steps 1–4. Leave these canned strings byte-identical:

- `question: "What type of issue is this?"`
- `Enhancement — New capability or improvement to existing behavior (recommended for most)`
- `Bug — Something is broken or behaving incorrectly`
- milestone options `` v${major} (current) `` and `` v${major+1} (next) ``
- step 1 need-gather when `$ARGUMENTS` is absent

### `workflows/draft-issue/references/interview-depth.md`

After the existing per-call bullets, add the same `short paragraph stating the situation` sentence used in interactive-gates. Keep preference/tradeoff-only use, tool-first discovery, no-review-ask, and continue-until-gathered.

### `workflows/draft-issue/references/multi-issue.md`

Do not add a situation paragraph. Leave these strings byte-identical:

- `question: "Create separate issues for this split?"`
- `Yes — create the listed issues in dependency order (recommended)`
- `Adjust the split`
- `Keep a single issue`

### `workflows/write-spec/WORKFLOW.md` Interview section only

After the existing preference-ask sentence, add:

`Each interview or preference question includes a short paragraph stating the situation and the facts needed to choose among the shown options. The continue/finish ask stays canned and is not required to add a situation paragraph.`

Do not edit the Continue loop canned labels. Leave these strings byte-identical:

- `Finished — stop writing specs`
- `Continue — enter another issue number`
- `#M — {title}` candidate label shape

### `workflows/write-spec/references/interview.md` and `workflows/write-spec/references/discovery.md`

Add the same `short paragraph stating the situation` sentence to the preference/slug-collision ask guidance. Keep the 3-ask-per-issue budget. Keep continue/finish out of that budget.

### `workflows/onboard-project/WORKFLOW.md` and `workflows/onboard-project/references/interview.md`

Add the same sentence to the vision/personas/success, tech-stack, optional-priorities, and already-initialized delegate-or-exit asks. Keep `max 3 total qs`. Do not paste a full product vision or repository dump into `question`.

### `workflows/upgrade-project/WORKFLOW.md`

Keep `Ask ( <=3 total )`. Add the same `short paragraph stating the situation` sentence to the category-group and collision asks. Replace only the bare layout example:

from:

```text
e.g. for layout: "Relocate legacy .codex/* ? (recommended yes)"
```

to:

```text
e.g. for layout: "The detector found a legacy .codex/ layout that should move to root steering/ and specs/. Relocate legacy .codex/*?" (recommended yes)
```

Keep "Flatten this epic group?" as an example topic; if that example remains a bare label, prefix it with one short situation sentence in the same style. Do not invent new category detectors.

### `workflows/run-retro/WORKFLOW.md`

Keep `At most 3`. Add the same `short paragraph stating the situation` sentence. Replace the bare examples:

from: `"Include only defects after YYYY?" or "Force full reanalysis?"`

to: `"Defect specs can be filtered by date or re-read in full. Include only defects after YYYY?" or "Cached retrospective hashes already exist. Force full reanalysis?"`

## Preserved boundaries

- `ask` schema (`question`, `options`, `description`, `header`, max 3 questions) is unchanged
- Automated workflows listed in `scripts/__tests__/interactive-plan-contract.test.mjs` still must not invoke `ask`
- Interview budgets stay: write-spec 3 per issue, onboard `max 3 total qs`, upgrade `Ask ( <=3 total )`, run-retro at most 3, draft-issue no whole-run quota
- `specs/209-remove-draft-issue-run-total-ask-quota/` stays on disk

## Verification design

Extend `scripts/__tests__/interactive-plan-contract.test.mjs` with source-contract assertions. Do not add runtime mocks.

1. `references/interactive-gates.md` and every interview site listed above contain `short paragraph stating the situation`.
2. Canned gate strings listed above remain present and unchanged.
3. `workflows/draft-issue/references/multi-issue.md` still has the canned split question and does not need the situation-paragraph sentence.
4. Existing per-call shape and unrelated budget assertions remain.

---

## Change History

| Issue | Date | Summary |
|-------|------|---------|
| #225 | 2026-08-23 | Initial feature spec |
