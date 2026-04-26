# Requirements: Creating PRs Skill

**Issues**: #8, #128, #108
**Date**: 2026-04-25
**Status**: Amended
**Author**: Codex (retroactive)

---

## User Story

**As a** developer ready to merge a verified feature,
**I want** a skill that creates a pull request with a summary automatically derived from my specs and verification results, and optionally stays with me to monitor CI and merge once green,
**So that** PR reviewers get full context linking the issue, specs, and implementation evidence without manual write-up, and I get the same hands-off ship experience the unattended runner already provides.

---

## Background

The `/open-pr` skill creates a GitHub pull request using `gh pr create` with a body that references the originating GitHub issue, links to the spec files in `specs/{feature-name}/`, and summarizes the implementation based on the tasks spec and verification report. The PR title and body are structured to give reviewers immediate context about what was built and why. In unattended mode, the skill outputs a completion signal for the orchestrator instead of suggesting next steps.

Issue #128 extends the interactive branch so the skill can optionally monitor CI and auto-merge after the PR is created. The unattended path (driven by `scripts/sdlc-runner.mjs`) already polls `gh pr checks` and runs `gh pr merge`; this enhancement closes the parity gap so interactive users who opt in get the same hands-off result. The unattended branch is unchanged — the runner retains ownership of CI monitoring and merging when the sentinel file is present.

---

## Acceptance Criteria

### AC1: PR Links to Originating Issue

**Given** I invoke `/open-pr` after verification
**When** the PR is created
**Then** the PR body contains a reference to the originating GitHub issue (e.g., `Closes #N`)

### AC2: PR References Spec Files

**Given** specs exist in `specs/{feature-name}/`
**When** the PR is created
**Then** the PR body links to the requirements, design, and tasks spec files

### AC3: PR Summary Reflects Implementation

**Given** the implementation and verification are complete
**When** the PR body is generated
**Then** it summarizes what was built, key decisions, and verification status

### AC4: Unattended Mode Outputs Completion Signal

**Given** unattended mode is active
**When** the PR is created
**Then** the skill outputs `Done. Awaiting orchestrator.` instead of suggesting next steps

### AC5: Interactive CI Monitor Opt-In — Happy Path

**Given** `/open-pr` has created a PR in interactive mode (the `.codex/unattended-mode` sentinel does NOT exist)
**When** the skill prompts the user and the user selects "Yes, monitor CI and auto-merge"
**Then** the skill polls PR checks until all required checks complete, squash-merges the PR via `gh pr merge --squash --delete-branch`, deletes the local feature branch, and returns the user to a clean state on `main`

### AC6: Interactive CI Monitor Opt-Out

**Given** `/open-pr` has created a PR in interactive mode
**When** the skill prompts the user and the user selects "No, I'll handle it"
**Then** the skill exits with the existing Step 6 "Next step: Wait for CI to pass..." output unchanged

### AC7: CI Failure During Monitoring — Report and Stop

**Given** the user opted in to monitoring
**When** any required check concludes in a non-success state (failure, timed_out, cancelled) or the PR is not mergeable
**Then** the skill prints each failing check's name and details URL, does NOT merge, does NOT delete the branch, and exits so the user can investigate

### AC8: Unattended-Mode Parity — No Interactive Prompt

**Given** the `.codex/unattended-mode` sentinel file exists
**When** `/open-pr` completes Step 6
**Then** no CI-monitor prompt is shown and the skill outputs `Done. Awaiting orchestrator.` so the runner retains ownership of CI monitoring and merging

### AC9: Active Suppression Regardless of Opt-In Default

**Given** the `.codex/unattended-mode` sentinel file exists
**When** `/open-pr` completes Step 6
**Then** the new CI-monitor prompt is actively suppressed — the skill MUST NOT attempt `interactive prompt`, MUST NOT poll checks, and MUST NOT invoke `gh pr merge`

*Retrospective-derived defensive check (see `steering/retrospective.md` → "Missing Acceptance Criteria" on explicitly excluded automation modes).*

### AC10: Open-pr Commits Pending Work Before PR Creation

**Given** a developer runs `$nmg-sdlc:open-pr #N` on a feature branch with uncommitted tracked or untracked non-runner-artifact changes
**When** the skill starts its PR workflow
**Then** it stages all eligible non-runner-artifact changes, applies the project version bump when applicable, creates a conventional commit, reconciles with `origin/main`, pushes the branch, and then creates the PR

### AC11: Open-pr Preserves Safe Rebase and Push Behavior

**Given** local work is behind `origin/main`
**When** `$nmg-sdlc:open-pr #N` prepares the branch for PR creation
**Then** it uses the same rebase plus safe force-with-lease envelope that `$nmg-sdlc:commit-push` currently documents, including unattended-mode behavior and conflict escalation

### AC12: Commit-push Removed From Public Workflow

**Given** the plugin is installed
**When** a user reads the README, skill descriptions, integration diagrams, runner steps, or plugin skill inventory
**Then** `$nmg-sdlc:commit-push` is no longer presented as a required or available workflow step, and the standard cycle is simplified to `verify-code` → `open-pr` → `address-pr-comments`

### AC13: Runner Uses Open-pr as Delivery Handoff

**Given** the unattended runner completes verification for an issue
**When** it advances to PR creation
**Then** it invokes `$nmg-sdlc:open-pr` to commit, version, push, and create the PR in one step, with no separate `commitPush` step or bounce-back sentinel to `$nmg-sdlc:commit-push`

### AC14: Clean Branch Does Not Create a Redundant Commit

**Given** a branch is already committed and pushed with no dirty work
**When** `$nmg-sdlc:open-pr #N` runs
**Then** it skips unnecessary commits, verifies branch ancestry, creates the PR normally, and reports that no additional commit was needed

### AC15: Docs and Tests Cover the Simplified Workflow

**Given** the change is complete
**When** repository checks run
**Then** tests or contract checks cover the new runner step order and `$nmg-sdlc:open-pr` commit/push responsibility, and README plus skill integration diagrams no longer reference `$nmg-sdlc:commit-push` as a separate step

---

## Functional Requirements

| ID | Requirement | Priority | Notes |
|----|-------------|----------|-------|
| FR1 | PR creation via `gh pr create` with structured body | Must | |
| FR2 | Issue reference in PR body (e.g., `Closes #N`) | Must | Auto-closes issue on merge |
| FR3 | Links to spec files in the PR body | Must | requirements, design, tasks |
| FR4 | Implementation summary derived from specs and verification | Must | |
| FR5 | Automation mode support with completion signal | Must | `Done. Awaiting orchestrator.` |
| FR6 | After PR creation in interactive mode, prompt the user via `interactive prompt` with two options: monitor+merge, or skip | Must | Issue #128 |
| FR7 | On opt-in, poll the PR's checks (`gh pr checks <num>`) until all required checks reach a terminal state | Must | Issue #128 — mirror runner semantics |
| FR8 | On all-success, merge the PR with `gh pr merge --squash --delete-branch` and delete the local feature branch, returning to `main` | Must | Issue #128 — squash is hardcoded this iteration |
| FR9 | On any check failure, non-mergeable state, or integration absent (no checks configured), print check name(s) + details URL(s) and exit without merging or deleting the branch | Must | Issue #128 — covers CI failure + "no CI configured" graceful skip |
| FR10 | When `.codex/unattended-mode` exists, actively suppress the new prompt, polling, and merge invocation — preserve current unattended output | Must | Issue #128 |
| FR11 | Use a sensible polling cadence and timeout (30-second interval matching the runner, configurable constants documented in the skill) | Should | Issue #128 |
| FR12 | Move stage, commit, version-bump, rebase, and push responsibility into `$nmg-sdlc:open-pr` before PR creation | Must | Issue #108 |
| FR13 | Remove or deprecate `$nmg-sdlc:commit-push` from the shipped public skill surface | Must | Issue #108 |
| FR14 | Update `scripts/sdlc-runner.mjs` so the deterministic pipeline no longer has a separate `commitPush` step | Must | Issue #108 |
| FR15 | Preserve safe unattended-mode force-with-lease behavior after rebases | Must | Issue #108 |
| FR16 | Update README, skill descriptions, integration diagrams, and references that mention `$nmg-sdlc:commit-push` | Must | Issue #108 |
| FR17 | Add or update tests for runner step numbering, preconditions, state hydration, and `$nmg-sdlc:open-pr` delivery behavior | Must | Issue #108 |

---

## Non-Functional Requirements

| Aspect | Requirement |
|--------|-------------|
| **Performance** | Single `gh pr create` call; polling uses 30s cadence to avoid rate-limit churn |
| **Security** | Uses authenticated `gh` CLI; no tokens in PR body |
| **Reliability** | Ensures branch is pushed before creating PR; failure path never merges or deletes the branch |
| **Idempotency** | Re-running `/open-pr` on an already-created PR must not double-post or double-merge |

---

## UI/UX Requirements

Reference `structure.md` and `product.md` for project-specific design standards.

| Element | Requirement |
|---------|-------------|
| **Interaction** | Two-option `interactive prompt` after PR creation (monitor+merge / skip) |
| **Loading States** | Poll progress output (e.g., "Checks pending: 3/5 complete") during monitoring |
| **Error States** | Failing check names + details URLs printed; terminal state reached, skill exits |
| **Empty States** | "No CI configured — nothing to monitor" message when `gh pr checks` reports no checks |

---

## Data Requirements

### Input Data

| Field | Type | Validation | Required |
|-------|------|------------|----------|
| Issue number | integer | positive | Yes |
| `.codex/unattended-mode` sentinel | file | presence/absence | Yes (controls branch) |
| User selection | enum | {monitor, skip} | Yes (interactive branch only) |

### Output Data

| Field | Type | Description |
|-------|------|-------------|
| PR URL | string | Printed after `gh pr create` |
| Merge status | enum | {merged, failed, skipped} — interactive branch only |

---

## Dependencies

### Internal Dependencies
- [x] Writing specs skill (#5) for spec files to reference
- [x] Implementing specs skill (#6) for code to include
- [x] Verifying specs skill (#7) for verification status

### External Dependencies
- [x] `gh` CLI for PR creation, `gh pr checks`, `gh pr merge`
- [x] Git for branch management (`git branch -D`)

---

## Out of Scope

- Automatic PR review assignment
- Auto-retry or re-queueing of failed CI checks
- A merge-strategy picker (squash/rebase/merge commit) — squash is hardcoded for this iteration
- Post-merge `git checkout main && git pull` step
- Changes to the unattended orchestrator path in `scripts/sdlc-runner.mjs`
- Pre-merge conflict resolution (if the PR is not mergeable, treat it like a failure and stop)
- Changing how `$nmg-sdlc:draft-issue`, `$nmg-sdlc:start-issue`, `$nmg-sdlc:write-spec`, `$nmg-sdlc:write-code`, `$nmg-sdlc:simplify`, `$nmg-sdlc:verify-code`, or `$nmg-sdlc:address-pr-comments` perform their core responsibilities
- Removing git safety checks around rebases, force-with-lease, dirty runner artifacts, or version-file conflicts
- Changing the version bump classification matrix itself

---

## Success Metrics

| Metric | Target | Measurement |
|--------|--------|-------------|
| Interactive ship completeness | Developer returns to a clean `main` without manual merge steps when opting in | Exercise test: opt-in path ends on `main` with branch gone |
| Unattended branch untouched | Runner-driven cycles still output `Done. Awaiting orchestrator.` at Step 6 | Dry-run eval of `/open-pr` with sentinel present shows no new prompt |

---

## Open Questions

- [ ] Should the polling timeout surface to config (e.g., steering docs) or stay as a skill-level constant? *(Decision: skill-level constant for this iteration; revisit if runner and skill diverge.)*

---

## Change History

| Issue | Date | Summary |
|-------|------|---------|
| #8 | 2026-02-15 | Initial feature spec |
| #128 | 2026-04-18 | Add interactive opt-in CI monitor + auto-merge path; preserve unattended branch behavior |
| #108 | 2026-04-25 | Fold commit, version, rebase, and push responsibility into open-pr; remove commit-push as a separate workflow step |

---

## Validation Checklist

- [x] User story follows "As a / I want / So that" format
- [x] All acceptance criteria use Given/When/Then format
- [x] No implementation details in requirements
- [x] All criteria are testable and unambiguous
- [x] Dependencies are identified
- [x] Out of scope is defined
