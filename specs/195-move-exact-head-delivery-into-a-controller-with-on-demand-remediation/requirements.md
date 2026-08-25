# Requirements: Move exact-head delivery into a controller with on-demand remediation

**Issue**: #195
**Date**: 2026-08-21
**Status**: Approved
**Author**: NMG
**Related Spec**: specs/194-move-start-and-execute-orchestration-into-controllers-behind-sibling-workers/

---

## User Story

**As a** deliver worker
**I want** version bump, PR create/resume, CI/thread classification, exact-head merge, and merge+close proof to run in code
**So that** a model is prompted only when a bot thread or CI failure needs a code change

---

## Background

Every deliver worker currently inlines `workflows/open-pr/WORKFLOW.md` plus `workflows/address-pr-comments/WORKFLOW.md`, even when a PR is already green. `scripts/pr-delivery-state.mjs` already owns delivery-readiness classification. The new controller must wrap that classifier and preserve the current terminal delivery gates rather than fork its rules.

Issue #194 keeps delivery in a sibling `s<N>-deliver` Herdr OMP worker. This issue changes what that worker runs; it does not move PR operations into the execute pane.

---

## Acceptance Criteria

### AC1: delivery controller preserves terminal delivery

**Given** a sibling deliver worker for issue N
**When** the compact open-pr workflow runs
**Then** it invokes `node scripts/sdlc-deliver.mjs --issue N`
**And** the controller performs approved-spec and verification gates, automatic version bump, synchronized version-file and changelog updates, delivery commit, push, exact-branch PR create or resume, polling, exact-head squash merge, merge-and-close proof, safe local branch deletion, and deliver handoff writing
**And** it reuses `classifyPrDeliveryState` and existing verification-readiness logic rather than creating a second readiness classifier
**And** a leftover `spike` label does not skip the version bump
**And** BREAKING work without an approved `**Version bump**: major` spec line fails with `reasonCode: major_bump_required`
**And** success requires the PR to be `MERGED` at the expected head and the issue to be `CLOSED`

### AC2: remediation is requested only on demand

**Given** unresolved automated-review threads or failing in-scope checks that require a code edit
**When** the controller cannot continue deterministically
**Then** it prints one `NMG_SDLC_REMEDIATION: <json>` line and exits 3 without writing a passed deliver handoff
**And** the packet contains schema version, issue, PR number, observed head SHA, failing check names, unresolved bot thread file/line/comment details, and required handoff path
**And** the compact workflow applies only clear, local, safe fixes in the same deliver worker, verifies and pushes them, then reruns the controller
**And** the workflow never resends or launches a nested OMP worker
**And** green PRs with no unresolved bot threads never inline or load `address-pr-comments`

### AC3: human and ambiguous review stop safely

**Given** an unresolved human thread, CHANGES_REQUESTED review, or a bot request the worker cannot classify as a clear safe fix
**When** delivery classifies the review
**Then** the controller writes a failed deliver handoff with `reasonCode: human_review`, `intervention: true`, and `next: null`
**And** it does not merge or resolve the thread
**And** the compact workflow reports an ambiguous remediation back through `--remediation-result human_review` so handoff creation remains controller-owned

### AC4: pending delivery is bounded

**Given** required checks or automated review are still pending without an actionable failure
**When** one hour has elapsed since the initial observation
**Then** the controller writes a failed deliver handoff with `reasonCode: delivery_pending` and `intervention: true`
**And** observations are at least 30 seconds apart
**And** the controller does not merge while readiness remains pending

### AC5: exact-head proof is not reduced

**Given** a ready PR at observed head H
**When** the controller merges
**Then** it runs the repository-policy merge command with `--match-head-commit H`
**And** any head change forces reclassification before merge
**And** missing merge proof, mismatched head proof, or an open issue produces `reasonCode: merge_failed`
**And** local branch deletion occurs only after MERGED+CLOSED proof

### AC6: verification proves two real issue lifecycles

**Given** the issue #195 implementation is ready for verification
**When** the verification worker exercises delivery
**Then** it runs two distinct issues end to end against the real GitHub repository `nmg-sdlc-smoke`
**And** both issues produce PR creation, exact-head merge, and issue closure evidence
**And** the verification handoff preserves fresh issue URLs, PR URLs, observed head SHAs, merged states, and closed issue states as artifacts
**And** injected tests or fixture-only exercises do not substitute for this GitHub smoke evidence

---

## Functional Requirements

| ID | Requirement | Priority | Notes |
|----|-------------|----------|-------|
| FR1 | Add `scripts/sdlc-deliver.mjs` exporting an injectable delivery controller and CLI `--issue N`. | Must | Invalid CLI exits 2 with usage and no handoff. |
| FR2 | Emit deterministic remediation JSON on stdout with exit 3; rerun the same controller after the same worker edits and pushes. | Must | No nested OMP invocation. |
| FR3 | Support `--remediation-result human_review` so ambiguous packets become controller-written intervention handoffs. | Must | Human review never auto-merges. |
| FR4 | Reuse `classifyPrDeliveryState` and verification-readiness contracts. | Must | Do not fork delivery or handoff schemas. |
| FR5 | Poll pending checks/review every 30 seconds for at most 60 minutes, then fail `delivery_pending`. | Must | Inject sleep/time for deterministic tests. |
| FR6 | Remove unconditional deliver `address-pr-comments` from `STEP_EXTRA_WORKFLOWS`; keep implement `simplify`. | Must | On-demand remediation packet replaces unconditional prompt weight. |
| FR7 | Compact `workflows/open-pr/WORKFLOW.md`; retain `workflows/address-pr-comments/WORKFLOW.md` only as on-demand remediation guidance. | Must | Keep frontmatter stable where applicable. |
| FR8 | Preserve current versioning, PR, bot identity, exact-head merge, merge proof, and handoff behavior. | Must | No function reduction. |
| FR9 | Verification must run two real issue lifecycles against `nmg-sdlc-smoke` and preserve fresh GitHub evidence in the verification handoff. | Must | Fail verification if auth, repository, Herdr, merge, or closure proof is unavailable. |

---

## Change History

| Issue | Date | Summary |
|-------|------|---------|
| #195 | 2026-08-21 | Initial feature spec |
