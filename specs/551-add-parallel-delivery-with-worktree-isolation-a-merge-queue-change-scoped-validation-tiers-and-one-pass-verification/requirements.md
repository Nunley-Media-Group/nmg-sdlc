# Requirements: Add parallel delivery with worktree isolation, a merge queue, change-scoped validation tiers, and one-pass verification

**Issue**: #551
**Date**: 2026-11-13
**Status**: Approved
**Author**: Claude Code (write-spec)
**Related Spec**: specs/546-sdlc-execute-stop-losing-time-to-idle-workers-restarts-and-truncated-gate-evidence/

## User Story

**As a** developer running several `/sdlc-write-spec` and `/sdlc-execute` sessions at once, in one repository or across several on one machine
**I want** each issue to work in its own worktree, merge through a per-repository queue, run only the tests its change needs before merge, and get every verify finding in one pass
**So that** parallel issues deliver without checkout collisions, merge-and-revalidate races, version conflicts, or repeated full-suite gate cycles

## Background

Today every run works in the checkout that invoked it:

- `scripts/start-issue.mjs` checks out the issue branch `{N}-{slug}` there.
- `scripts/publish-approved-spec.mjs` publishes the spec on the same `{N}-{slug}` branch name, then checks out the default branch, which fails with `default_checkout_failed` when another worktree owns it. Its `merge` subcommand finds the PR with `gh pr list --head {N}-{slug}`, so it can squash-merge an open code PR on that branch.
- Controller state (`.nmg-sdlc/controller.lock`, handoffs, verification records) lives under the invoking checkout's `.nmg-sdlc/`.
- `scripts/sdlc-execute.mjs` runs `sdlc-deliver.mjs prepare-version` before every verify and deliver dispatch. Each in-flight branch therefore claims a version and edits `CHANGELOG.md` independently.
- `steering/manifest.json` validations have no tier, selection, fallback, or heavy marker. Every required validation runs on every verify, and nothing limits concurrent heavy jobs on one machine.
- `workflows/verify-code/WORKFLOW.md` runs the full steering gate before the inline review. A review may hand back without a verdict for every criterion.

## Acceptance Criteria

### AC1: Concurrent runs use separate worktrees and leave the primary checkout untouched

**Given** a repository whose primary checkout is on the default branch with uncommitted changes
**When** two `/sdlc-execute` runs for different issues and one `/sdlc-write-spec` publication start at the same time
**Then** each run creates, or reuses, its own worktree under `<primary-parent>/<repo-name>-wt/`, created from the remote default branch
**And** none of them reports `default_checkout_failed`, `issue_branch_unreadable`, or `branch_checkout_failed`
**And** the primary checkout's branch, HEAD, and `git status --porcelain` output are unchanged

### AC2: Spec and code branches never collide

**Given** issue N with an open code PR whose head branch is `{N}-{slug}`
**When** `/sdlc-write-spec #N` publishes a spec
**Then** publication uses branch `spec/{N}-{slug}`, and the spec PR and the code PR are open together on different branches
**And** the publish helper's `merge` never merges the code PR

### AC3: Queue head integrates alone and validates once

**Given** two branches whose verification review passed and that entered the repository merge queue in order A, B
**When** the queue processes them
**Then** B starts no pre-merge validation until A has merged
**And** each branch runs its pre-merge validations exactly once, after merging the default branch it then merges into

### AC4: Queued branches never share a version or conflict on the changelog

**Given** two queued branches in a project whose steering opts into changelog fragments, each with a fragment for its own issue
**When** both merge through the queue
**Then** version preparation runs at queue-head time, the two merges produce different versions, each issue's fragment bullets are assembled into `CHANGELOG.md` and its fragment file is removed, and neither integration has a changelog conflict

### AC5: A failing queue head leaves the queue

**Given** a queue head whose pre-merge validations fail after it integrates the current default branch
**When** the failure is recorded
**Then** the branch leaves the queue, its version preparation commit (if any) is reverted, and it returns to implement with a failed handoff carrying `reasonCode` `queue_gate_failed` and the verification record as an artifact
**And** the next queue entry proceeds

### AC6: Overlapping in-flight issues are reported at start

**Given** an in-flight issue M whose spec `tasks.md` declares a file in `**File(s)**` that a newly started issue N's spec also declares
**When** the controller starts issue N
**Then** the start stage report's `overlaps` field lists issue M and the overlapping files

### AC7: Heavy jobs share a host-wide pool

**Given** `~/.nmg-sdlc/config.json` sets `heavyJobSlots` to 1, and two processes, in the same or different projects, each start a validation that steering marks `heavy: true`
**When** both start
**Then** the heavy validations run one after the other, the second's validation result records `heavy.waitedMs` greater than zero, and a slot held by a process that no longer exists is reclaimed

### AC8: Status shows queue and pool state

**Given** in-flight issue worktrees, queued branches, and heavy-job slot holders
**When** `/sdlc-status --json` runs
**Then** its `parallel` object lists each in-flight issue with its stage and queue position, the queue entries, the host heavy-job slot holders, and leftover worktrees whose run holds no live controller lease

### AC9: Change tier runs selected tests outside fallback paths

**Given** a `change`-tier `builtin.command` validation with a selection provider and declared `fallbackPaths`
**When** a change touches only files outside the fallback paths and the provider returns a fresh test selection
**Then** the validation runs its command with the selected tests appended
**And** the verification record shows the tier, the provider, the selection reason `selected`, the count selected, and the age of the selection data

### AC10: Fallback paths and stale selection data run the full command

**Given** a `change`-tier validation with a selection provider and declared `fallbackPaths`
**When** a change touches a fallback path, or the provider reports its data `missing` or `stale`
**Then** the validation runs its full command
**And** the verification record's selection reason is `fallback_path` (naming the path), `selection_data_missing`, or `selection_data_stale`

### AC11: Full tier runs on demand and reports regressions

**Given** a `full`-tier validation
**When** `/sdlc-verify-full <ref>` runs
**Then** it records the result for the commit that `<ref>` resolves to
**And** when the result fails, it lists the first-parent commits merged since the last green full record

### AC12: Downstream actions can require a full-green commit

**Given** steering declares a full-green action `deploy`
**When** `sdlc-verify-full.mjs check --action deploy --commit <sha>` runs
**Then** it exits 0 with `green: true` only when a passed full record exists for that commit or for a descendant of it
**And** otherwise it exits 1 with `green: false`

### AC13: Projects without tiers keep today's behaviour

**Given** a project whose validations declare no tier
**When** the pre-merge gate runs
**Then** every required validation runs its full command, exactly as today, and the record shows `tier: null` and `selection: null`

### AC14: One verify pass reports every finding without running validations

**Given** a change with two independent blocking defects
**When** verify runs once
**Then** its single failed handoff reports both findings
**And** no pre-merge validation runs and no `.nmg-sdlc/verification/<N>.json` gate record is written

### AC15: Unevaluated checklist rows block the handoff

**Given** a verify review checklist with a row (acceptance criterion, functional requirement, design error or state path, or consumer of a new or extended identifier, job name, or contract) that has no verdict
**When** the finalizer receives the review
**Then** it refuses with `reasonCode` `review_checklist_incomplete` and names every unevaluated row

### AC16: Repair re-verification is scoped

**Given** a prior verify review that returned findings at head H and a repair commit after H
**When** verify runs after the repair
**Then** the review scope helper returns `mode: "scoped"` with the prior findings and the repair diff when every repaired path is within the findings' files
**And** it returns `mode: "full"` naming the outside paths when the repair touches files outside the findings' scope

## Functional Requirements

| ID | Requirement | Priority |
|----|-------------|----------|
| FR1 | `/sdlc-execute #N` and `/sdlc-write-spec #N` publication each create, or reuse, a dedicated git worktree created from `origin/<default>` under `<primary-parent>/<repo-name>-wt/` (`<N>` for code, `spec-<N>` for spec). The primary checkout is never switched to an issue or spec branch and need not be clean. | Must |
| FR2 | Spec publication uses branch `spec/{N}-{slug}`; the code branch stays `{N}-{slug}`. Spec PR lookup uses only the spec branch, and merge refuses a PR whose changed files fall outside `specs/{N}-{slug}/`. | Must |
| FR3 | Per-issue controller state (lease, handoffs, verification records) lives in the issue worktree's `.nmg-sdlc/`. Repository-wide state (merge queue, full-verification records) lives in `<git-common-dir>/nmg-sdlc/`. | Must |
| FR4 | The steering manifest may declare `worktree.setup` and `worktree.teardown` commands (same shape as `builtin.command` config). Setup runs once when a worktree is created; teardown runs before removal. | Must |
| FR5 | After delivery, the code worktree and its local branch are removed. After spec merge, the spec worktree and local spec branch are removed. A crashed or abandoned run's worktree is reused by a later run for the same issue and listed by status. | Must |
| FR6 | No step checks out the default branch in any worktree. Fast-forwarding the primary checkout is best-effort, runs only when it is on the default branch, and its failure is reported, never fatal. | Must |
| FR7 | Each repository has one merge queue in `<git-common-dir>/nmg-sdlc/merge-queue.json`, guarded by an exclusive lock file. A branch enters the queue when its verify review passes. Entries whose owner process is dead are removed. | Must |
| FR8 | Only the queue head integrates: it merges `origin/<default>` into its branch, prepares the version, runs the pre-merge validations once on the merged result, finalizes verification, and delivers. Other entries wait. | Must |
| FR9 | Version preparation runs only at queue-head time, not before verify dispatch. | Must |
| FR10 | Steering may opt into changelog fragments (`changelog.fragments.dir`). Implement then writes `<dir>/<N>.md` instead of editing `[Unreleased]`, and `prepare-version` assembles the fragment into the new version section and deletes it. | Must |
| FR11 | When a queue head's integration conflicts or its pre-merge validations fail, the head leaves the queue, any version commit it made is reverted, it returns to implement with that evidence, and the next entry proceeds. | Must |
| FR12 | At start, the controller compares the new issue's spec `**File(s)**` declarations with those of other in-flight code worktrees and reports overlaps in the start stage report. | Must |
| FR13 | Validations marked `heavy: true`, and worker-run commands launched through the pool CLI, take a slot from a host-wide pool in `~/.nmg-sdlc/heavy-jobs/`. Its size is `heavyJobSlots` from `~/.nmg-sdlc/config.json` (default 1). Waits are recorded and a dead holder's slot is reclaimed. | Must |
| FR14 | `sdlc-status.mjs` reports a `parallel` object with repository in-flight issues, stage, queue position, queue entries, leftover worktrees, and host heavy-job holders, in JSON and text. | Must |
| FR15 | A validation may declare `tier`: `change` (runs in the pre-merge gate) or `full` (runs only through `/sdlc-verify-full`). | Must |
| FR16 | A `change` validation may declare a `selection` command. It receives the base ref and changed paths as JSON on stdin and returns tests to run, or a signal to run everything. The plugin implements no language-specific selection. | Must |
| FR17 | A `change` validation may declare `fallbackPaths` globs. When a changed path matches one, or the provider reports missing or stale data, fails, or returns malformed output, the full command runs. | Must |
| FR18 | Each validation result in the verification record stores `tier`, and `selection: {provider, reason, fallbackPath, selectedCount, dataAgeSeconds}` or null. | Must |
| FR19 | `/sdlc-verify-full [ref]` runs `full` validations in a temporary detached worktree at the ref and records the result per commit. On failure it lists the first-parent commits since the last green full record. | Must |
| FR20 | Steering may declare `fullGreen.actions`. `sdlc-verify-full.mjs check --action <id> --commit <sha>` answers green only when a passed full record exists at that commit or a descendant. | Must |
| FR21 | Validations without `tier` keep today's behaviour: every required one runs with its full command in the pre-merge gate. | Must |
| FR22 | Verify reviews first and runs no validation. A review with blocking findings hands back to implement without any gate run. | Must |
| FR23 | The review writes a checklist with a row for each AC, each FR, each design error or state path, and each consumer of an identifier, job name, or contract the change introduces or extends. The finalizer refuses a review with any row lacking a verdict, or missing an AC or FR row. | Must |
| FR24 | The review exercises each AC through its real entry point where the project allows it, and the report names every AC whose tests mock the path the AC is about. | Must |
| FR25 | The review runs parallel lenses (acceptance walk-through, failure and state paths, test quality) and merges their findings into one checklist. | Must |
| FR26 | All findings, of every severity, go back to implement in one failed handoff. | Must |
| FR27 | After a repair, verify re-checks the listed findings and the repair diff, and repeats the full review only when the repair touches files outside the findings' files. | Must |

## Out of Scope

- Language-specific test selection; each project supplies its own selection command
- GitHub's hosted merge queue
- Idle workers without a handoff, resume after restart, and truncated gate evidence (#546)
- Opting this repository's own `steering/manifest.json` into tiers, fragments, or heavy markers

## Change History

| Issue | Date | Summary |
|-------|------|---------|
| #551 | 2026-11-13 | Initial feature spec |
