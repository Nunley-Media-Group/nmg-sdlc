# Design: Remove draft-issue run-total ask quota

**Issue**: #209
**Date**: 2026-08-22
**Status**: Approved
**Author**: NMG
**Related Spec**: specs/4-draft-issue-skill/

---

## Overview

This is a documentation-contract cutover inside the bundled draft-issue workflow. Remove the shared run-total counter from the core flow and its two private references. Preserve every required gate and every per-call shape rule. Interview termination changes from “no ask slots remain” to “investigation and answers cover every material preference, acceptance criterion, and scope boundary.”

No extension command, controller, GitHub mutation, or handoff schema changes. The workflow still discovers repository facts before asking, synthesizes after the interview, writes the structured issue plan, and uses `xd://propose` as the only approval mechanism.

## Affected contracts

### `workflows/draft-issue/WORKFLOW.md`

- Remove `Max questions budget: 3 total across whole run` from split detection.
- Replace the interview heading and remaining-slot instruction with an adaptive completion rule.
- Keep the core probes: persona/outcome, acceptance criteria, scope in/out, and bug reproduction/expected behavior.
- Ask additional focused probes whenever a material preference or tradeoff remains unresolved.
- Stop interviewing when all material undiscoverable decisions are covered, not at an invocation count.
- Keep the prohibition on final approval or draft-review asks.

### `workflows/draft-issue/references/interview-depth.md`

Replace the run-total budget contract with the retained interaction contract:

- `ask()` is only for preferences and tradeoffs.
- Repository facts come from tools.
- Each call has 2–4 options, recommended first, and at most three questions.
- Probes continue until material missing decisions are gathered.
- Depth signals may be logged but never suppress a necessary probe.
- Final approval remains exclusively `xd://propose`.

The reference must not recommend direct synthesis while a material acceptance criterion or scope decision remains missing.

### `workflows/draft-issue/references/multi-issue.md`

Remove only the phrase that makes split confirmation share a skill-wide total budget. Keep one split-confirm ask, its 2–4 options, recommended-first ordering, adjustment behavior, and dependency-body rules.

## Preserved boundaries

`references/interactive-gates.md` remains unchanged and continues to require at most three questions per call. `workflows/write-spec/WORKFLOW.md`, `workflows/onboard-project/WORKFLOW.md`, and `workflows/upgrade-project/WORKFLOW.md` keep their independent budgets. `specs/4-draft-issue-skill/` remains on disk.

## Verification design

Add focused source-contract coverage in `scripts/__tests__/interactive-plan-contract.test.mjs`:

1. Draft-issue and its private references contain no skill-wide three-ask quota, remaining-slot instruction, or probe-skipping rule.
2. Draft-issue still contains the exact Enhancement/Bug classification gate, semver milestone gate, single split-confirm gate, tool-first discovery, and no-review-ask rule.
3. The per-call contract still states 2–4 options, recommended first, and at most three questions.
4. Write-spec, onboard-project, and upgrade-project retain their existing independent budget text.

Use behavioral source assertions already established by this contract suite; do not add runtime mocks for a markdown-only workflow change.

---

## Change History

| Issue | Date | Summary |
|-------|------|---------|
| #209 | 2026-08-22 | Initial feature spec |
