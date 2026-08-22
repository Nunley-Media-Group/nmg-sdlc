# Requirements: Replace execute simplify with two branch-to-main review and fix panes

**Issue**: #208
**Date**: 2026-08-22
**Status**: Approved
**Author**: NMG
**Related Spec**: specs/194-move-start-and-execute-orchestration-into-controllers-behind-sibling-workers/

---

## User Story

**As a** Herdr OMP execute operator
**I want** `/sdlc-execute` to run the host `/review` twice of the current branch against main after implementation, each followed by a sibling pane that applies findings, commits, and pushes
**So that** pre-verify cleanup uses bundled OMP review instead of the redundant simplify stage

---

## Background

`/sdlc-execute` currently finishes implementation by inlining write-code plus simplify in one `s<N>-implement` worker, then launches verify. `workerPrompt({ step: 'implement' })` inlines `workflows/write-code/WORKFLOW.md` then `workflows/simplify/WORKFLOW.md` via `STEP_EXTRA_WORKFLOWS.implement = ['simplify']`. `workflows/write-code/WORKFLOW.md` also runs simplify in-process after the last task. `agents/spec-implementer.md` repeats write-code then simplify in the same session.

Approved specs #194 and #195 still require implement to keep simplify. This issue supersedes that contract after those issues merge. `specs/106-simplify-skill/` remains the historical simplify capability record and stays in the working-tree archive. Repository default branch is `main`. There is no nmg-sdlc `/review` command; review panes invoke host OMP `/review` comparing the current issue branch to `main`. Review findings must not fail the review handoff, or the dedicated fix pane never runs.

Depends on: #194, #195.

---

## Acceptance Criteria

### AC1: two review/fix pane pairs run after implement and before verify

**Given** issue N has an approved spec and the implement worker has a passed, non-intervention handoff
**When** `/sdlc-execute` continues that issue
**Then** it opens a sibling Herdr `--kind omp` pane `s<N>-review1` that runs host `/review` of the current issue branch against `main`
**And** after that review worker settles with a passed, non-intervention handoff, it opens a different sibling pane `s<N>-fix1` that applies those findings
**And** that fix pane commits only when the worktree has review fixes and pushes those commits to the issue branch
**And** it then opens `s<N>-review2` that again runs host `/review` of the current issue branch against `main`
**And** after the second review settles passed, it opens `s<N>-fix2` that applies the second review's findings, commits only when there are fixes, and pushes
**And** verify starts only after `s<N>-fix2` has a passed, non-intervention handoff
**And** each of those four panes uses the same split, agent-name, prompt-wait, handoff, resume, and close-vs-keep rules as the existing execute steps
**And** the implement worker no longer inlines or runs simplify

### AC2: a clean review still launches its fix pane without an empty commit

**Given** a review pane completes with no findings
**When** execute advances
**Then** the matching fix pane still launches as its own sibling worker
**And** it does not create an empty commit
**And** it does not push a new commit
**And** it writes a passed, non-intervention handoff so the next review or verify can run

### AC3: a failed review or fix pane stops the queue

**Given** a review or fix worker is blocked, unknown, missing a handoff, failed, or `intervention: true`
**When** that worker settles
**Then** execute keeps that pane open
**And** it stops the queue
**And** it does not launch later review, fix, verify, or deliver panes for that issue

### AC4: simplify is removed from the plugin

**Given** this change is delivered
**When** an operator inspects execute, worker prompts, and the plugin workflow surface
**Then** `workflows/simplify/` is gone
**And** implement worker prompts do not contain the Simplify workflow
**And** public README and command tables do not list simplify as an execute or write-code stage
**And** no execute worker is named, prompted, or handed off as simplify

---

## Functional Requirements

| ID | Requirement | Priority | Notes |
|----|-------------|----------|-------|
| FR1 | After a passed implement step, execute `review1`, `fix1`, `review2`, `fix2`, then verify. | Must | `nextStep` / `VALID_STEPS` order is start, implement, review1, fix1, review2, fix2, verify, deliver. |
| FR2 | Each review pane invokes host OMP `/review` comparing the current issue branch to `main`. | Must | Findings do not fail the review handoff. |
| FR3 | Each fix pane applies only that preceding review's findings; the apply-review controller commits only when porcelain is dirty after `--applied` and pushes without force. | Must | Empty commit and empty push are forbidden. |
| FR4 | Delete `workflows/simplify/` and stop inlining or running it from write-code, implement prompts, and `agents/spec-implementer.md`. | Must | Keep `specs/106-simplify-skill/` on disk. |
| FR5 | Reuse existing execute pane launch, handoff validation, resume, notification, and close-vs-keep behavior for the new panes. | Must | Do not fork the handoff schema. |
| FR6 | Keep historical `specs/106-simplify-skill/` in the working-tree archive until a later owned rewrite or upgrade removes it. | Should | Rewrite capability `simplify` stays among the 15 capabilities. |
| FR7 | Review and apply-review handoff JSON, no-findings short-circuit, commit subject, and push run in `scripts/sdlc-review-main.mjs` and `scripts/sdlc-apply-review.mjs`. | Must | Compact workflows do not invent handoff JSON or git mutations. Same injectable `run`/`fs` pattern as `runDeliver`. |


---

## Out of Scope

- Inserting review/fix panes into standalone `/sdlc-verify-code` or `/sdlc-open-pr`
- Changing GitHub PR review, `address-pr-comments`, or verify-code architecture review
- More than two review/fix cycles, or human approval gates on review findings
- Adding a public `/sdlc-review` command

---

## Change History

| Issue | Date | Summary |
|-------|------|---------|
| #208 | 2026-08-22 | Initial feature spec |
