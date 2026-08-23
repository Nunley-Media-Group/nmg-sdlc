# Design: Honor and resume selected issues from the empty /sdlc-execute picker

**Issue**: #231
**Date**: 2026-08-23
**Status**: Approved
**Author**: NMG
**Related Spec**: specs/223-apply-spec-created-after-specs-exist-and-gate-execute-selection/

---

## Overview

Fix three boundaries without moving orchestration back into the main agent. First, make `workflows/execute/references/selection.md` describe the actual built-in multi-select interaction: issue chips only, no `recommended`, no Cancel chip, empty Continue reopens the picker, and the selected ordered union is passed directly to the controller. Second, embed that reference in the packaged execute file command so a consumer repository never resolves picker behavior from its working tree or the network. Third, teach `runExecute` to consume a validated failed worker's backward `next` transition on a later invocation, invalidate completion from that target onward, and continue the same issue before any later issue.

Read and follow `skill://skill-creator` before changing the workflow bundle. Keep `workflows/execute/WORKFLOW.md` compact. `renderAutomatedCommandMarkdown` owns synchronization of the entrypoint and picker reference into `commands/sdlc-execute.md`.

## Picker interaction contract

`selection.md` remains the only empty-argument picker:

1. Call `node scripts/sdlc-execute.mjs list-specified`.
2. Stop on helper failure or an empty issue list as today.
3. Use one built-in `ask` with `multi: true`. Do not set `recommended`.
4. Put every eligible issue in the question, one per line, sorted by the helper.
5. Author the lowest-numbered eligible issues as issue chips, at most four. Do not author Cancel.
6. Normalize the answer as issue chips in displayed order followed by Other tokens in typed order, deduplicated first-occurrence-first.
7. Reopen the same picker when the union contains no valid issue number. Do not translate empty Continue to cancellation or fatal failure.
8. Invoke `node scripts/sdlc-execute.mjs run` once with the union as separate `#N` argv tokens.

OMP 18.0.3 accepted one authored option in a real multi-select `ask`: the UI rendered the sole issue plus automatic Other, remained unchecked until input, and submitted exactly `#901` after Space then Enter. No compatibility or Cancel option is needed. This observed runtime behavior supersedes the repository's conservative 2–4 authored-option guidance for this picker.

## Packaged command contract

`renderAutomatedCommandMarkdown` keeps ordinary automated commands unchanged. For `skill === \"execute\"`, it reads `workflows/execute/references/selection.md` from the supplied package root and appends it after the stripped execute workflow body. `commands/sdlc-execute.md` is regenerated from that renderer.

The execute entrypoint says to follow the packaged `# Select specified issues` section; it does not mention a relative reference path. `extension-commands.test.mjs` compares every generated command byte-for-byte, so a stale or omitted picker reference fails synchronization. A consumer-project smoke must launch OMP with `--plugin-dir` pointing at the branch and prove the prompt contains the branch picker text without GitHub or working-tree lookup.

## Explicit token transport normalization

OMP prompt actions may rewrite entered `#N` arguments before the file command sees them. The live smoke submitted `/sdlc-execute #902`, rendered `/sdlc-execute pr://902`, and invoked the controller fixture with the literal argv token `pr://902`.

`parseArgs` therefore accepts exactly four numeric forms: `N`, `#N`, `issue://N`, and `pr://N`. All forms share the existing `Number.isSafeInteger(num) && num > 0` check, first-occurrence ordering, deduplication, comma/whitespace tokenization, and 20-issue maximum. No other URI scheme, authority/path form, or nonnumeric URI value is accepted. This is transport normalization, not a new eligibility source: every resulting N still passes `spec-created`, approved-spec, dependency, and lifecycle gates.

## Remediation transition

Add a small pure transition helper in `scripts/sdlc-execute.mjs` rather than duplicating array surgery in retained-worker paths. Inputs are the current issue, expected step, completed steps, and validated handoff. A transition is accepted only when:

- the handoff issue and step match the current issue and expected step;
- `status !== 'passed'` or `intervention === true`;
- `next` is a member of `VALID_STEPS`;
- `next` is the current step or an earlier lifecycle step; and
- the target preserves the completed prefix strictly before `next`.

On the invocation that first observes a failure, keep existing behavior: write `runState.failed`, report non-delivery, retain the pane, and stop. On a later invocation, when the matching retained worker is idle or done and its handoff has an accepted remediation target:

1. Close the retained failed pane. If close fails, stop with `pane_close_failed` and keep durable state.
2. Replace `completed[String(issue)]` with the ordered prefix before the target.
3. Set `currentIssue` to the same issue, `currentStep` to the target, and clear `failed`.
4. Persist the run before starting a replacement worker.
5. Continue the normal loop from the target. Later issues remain untouched.

A null, unknown, forward, mismatched, or malformed transition follows the existing stop path and keeps the pane open. A passed non-intervention handoff still advances normally. This makes the explicit rerun the acknowledgement boundary: failure remains visible on first observation, while a later resume can consume a valid worker-authored remediation route.

## State invariants

- `runState.issues` never changes during remediation.
- `currentIssue` never advances because of a failed handoff.
- Completed steps form an ordered prefix of `VALID_STEPS` after rewind.
- Rewinding to `implement` after failed `verify` retains only `start`; both review/fix pairs and verification rerun.
- No handoff is trusted before `validateHandoff` and issue/step matching.
- No forward `next` can bypass an unpassed gate.
- Failed/intervention panes close only on a later explicit resume with a valid remediation transition.

## Verification

### Automated

Extend `scripts/__tests__/sdlc-execute.test.mjs` to prove:

- failed verify + `next: implement` first stops and preserves the queue;
- the next invocation closes the retained verify pane, truncates completion to `start`, and starts `sN-implement`;
- every downstream gate reruns before deliver and later issues remain ordered;
- unknown, null, forward, mismatched, malformed, active-worker, and pane-close-failure transitions fail closed;
- passed handoffs and ordinary resume remain unchanged.

Add executable interaction-contract coverage for the picker contract rather than source-substring assertions alone. It must cover first chip, another chip, multiple chips, chip plus Other ordering, dedupe, empty Continue, invalid Other, explicit-token bypass, and exactly one eligible issue.

### Live smoke

Use a disposable eligible issue or controlled fixture repository in a real Herdr OMP TUI. Observe all four boundaries:

1. the UI records the selected chip;
2. built-in `ask` returns that label;
3. the workflow emits the exact ordered token argv;
4. the controller starts or reaches a harmless instrumented boundary for that issue.

Also exercise a durable failed-verify handoff with `next: implement`, resume it, and observe implementation followed by downstream gates without starting a later issue early. Any newly observed `/sdlc-execute` defect is added to requirements/design/tasks and fixed before delivery.

---

## Change History

| Issue | Date | Summary |
|-------|------|---------|
| #231 | 2026-08-23 | Picker boundary and durable remediation design |