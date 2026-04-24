# Defect Report: Unattended SDLC Runner Cascade Failure on Diverged Remote Branch

**Issue**: #102
**Date**: 2026-04-23
**Status**: Draft
**Author**: Rich Nunley
**Severity**: High
**Related Spec**: `specs/feature-add-skill-to-run-full-sdlc-pipeline-loop-from-within-claude-code/`

---

## Reproduction

### Steps to Reproduce

1. Run the unattended SDLC runner on an issue whose remote branch was pushed in an earlier cycle against an older `main`.
2. Let `main` advance (merge another PR) while the runner is working.
3. Observe `commitPush` (Step 7) succeeds, then `createPR` (Step 8) detects advanced `main`, runs `git reset --hard HEAD~1` + `git pull --rebase origin main`, re-bumps the version, and issues a plain `git push`.
4. The remote rejects the push non-fast-forward.
5. `createPR` hits the per-step turn cap and exits with `subtype: error_max_turns`.
6. The runner logs `"Rate limited. Waiting 60s before retry..."` and bounces to `commitPush`.
7. `commitPush`'s subagent diagnoses divergence and refuses to force-push without user confirmation (which unattended mode cannot provide).
8. The runner's push validator counts "unpushed commits remain" as failure and retries.
9. Steps 7–8 repeat until the retry budget is exhausted; the runner escalates. No PR exists.

### Environment

| Factor | Value |
|--------|-------|
| **OS / Platform** | macOS (Darwin 25.3.0) |
| **Version / Commit** | nmg-sdlc plugin 1.58.0; runner log timestamped 2026-04-22 02:51–02:58 |
| **Runtime** | SDLC runner (`scripts/sdlc-runner.mjs`), Claude Code unattended mode |

### Frequency

Always — reproduces deterministically whenever the remote feature branch has diverged from local (either from a stale earlier-cycle push or a concurrent `main` advance during the run). Confirmed across three sequential `commitPush` attempts on issue #249 with identical "won't force-push without confirmation" output.

---

## Expected vs Actual

| | Description |
|---|-------------|
| **Expected** | Under unattended mode, the `createPR → commitPush` handoff completes without human input when the remote has diverged. History reconciliation lives outside `createPR`; `commitPush` may `git push --force-with-lease` automatically when the lease check is safe; the runner distinguishes `error_max_turns` from rate-limiting; bounce transitions carry a structured reason so the receiving step does not re-investigate from scratch; `startIssue` reconciles stale remote branches before a re-picked cycle rebuilds local. |
| **Actual** | `createPR` rewrites history and non-force-pushes; the resulting `error_max_turns` is misclassified as rate-limiting; `commitPush` refuses the force-push three times in a row; the runner exhausts its retry budget and escalates. The branch is left diverged, no PR exists, and operator-facing logs claim `"Rate limited"` when the real failure was `error_max_turns` plus force-push-confirmation-in-headless-mode. |

### Error Output

```
[commitPush session excerpt — repeated identically across three retry attempts]
A plain git push will be rejected … I won't force-push without your confirmation.

[runner log excerpt]
Rate limited. Waiting 60s before retry...
[STATUS] Rate limited on Step 8. Waiting 60s...
```

---

## Acceptance Criteria

**IMPORTANT: Each criterion becomes a Gherkin BDD test scenario.**

### AC1: createPR does not non-force-push after rewriting history

**Given** `createPR` runs on a branch whose remote has diverged from local (stale remote commits or `main` advanced mid-run)
**When** the step completes its push
**Then** either the step does not rewrite history at all (delegating to `commitPush` or a dedicated rebase step), or its push uses `git push --force-with-lease` paired with the rewrite

### AC2: commitPush force-pushes with lease in unattended mode when safe

**Given** the runner is in unattended mode and local history has been rebased such that the remote tip is no longer in local history
**And** the remote tip matches what was last fetched (the `--force-with-lease` safety check holds)
**When** `commitPush`'s subagent evaluates the push
**Then** it issues `git push --force-with-lease` without asking for user confirmation

### AC3: Runner distinguishes error_max_turns from rate-limiting

**Given** a step session exits with `subtype: "error_max_turns"`
**When** `handleFailure` inspects the result
**Then** the runner does NOT log `"Rate limited. Waiting 60s before retry..."` and does NOT sleep on the rate-limit path
**And** takes an `error_max_turns`-specific recovery action with an accurate status message

### AC4: createPR is scoped to its name

**Given** `createPR` is invoked after `commitPush`
**When** it runs
**Then** its responsibilities are limited to preconditions check + `gh pr create` (plus post-create artifact linking such as labels)
**And** version bumping, changelog updates, rebase, and history reconciliation live in `implement` / `commitPush` / a dedicated step — never inside `createPR`

### AC5: Bounce transitions carry structured state

**Given** step N fails its precondition check and bounces to step N-1
**When** step N-1 runs
**Then** its prompt includes a structured bounce reason (at minimum: `from`, `reason`, `detected_divergence`, `remote_commits_superseded`) so the receiving subagent does not re-investigate from scratch

### AC6: createPR budget fits its responsibilities

**Given** AC4 has scoped `createPR` to preconditions + PR creation
**When** `createPR` executes
**Then** its `maxTurns` budget is sufficient for that scope under normal conditions
**And** the budget is re-evaluated post-FR1 and raised only if still insufficient

### AC7: startIssue reconciles stale remote branches

**Given** the runner picks an issue that already has a remote feature branch whose tip is not reachable from `main`
**When** `startIssue` runs at the top of the cycle
**Then** it detects the stale branch and either deletes it or hard-resets it to the fresh base **before** the runner rebuilds local
**And** the action is logged

### AC8: No regression for the green-path cycle

**Given** a fresh unattended cycle on an issue with no pre-existing remote branch and no concurrent `main` advance
**When** the runner executes all steps end-to-end
**Then** the cycle completes without invoking any of the new force-push / stale-branch / bounce-reason paths, and the PR is created normally

---

## Functional Requirements

| ID  | Requirement | Priority |
|-----|-------------|----------|
| FR1 | `createPR` skill no longer runs `git reset --hard` + rebase + non-force push; history reconciliation moves out of the skill (scope creep removed) | Must |
| FR2 | `commitPush` skill instructions allow `git push --force-with-lease` without user confirmation when unattended-mode is active and the lease check is safe | Must |
| FR3 | `sdlc-runner.mjs` `matchErrorPattern` / `handleFailure` branches on result `subtype === 'error_max_turns'` before the rate-limit path runs | Must |
| FR4 | `sdlc-runner.mjs` passes a structured bounce-reason object (at minimum `from`, `reason`, and divergence hints) into the downstream step's prompt when `retry-previous` fires | Must |
| FR5 | `startIssue` skill detects and reconciles stale remote feature branches before the runner begins a fresh implementation cycle | Must |
| FR6 | `createPR` `maxTurns` budget is re-evaluated against the post-FR1 scope; raised only if still insufficient | Should |

---

## Out of Scope

- Multi-repo coordination across sibling plugins
- Changes to interactive (non-unattended) behavior of `commitPush` force-push prompts
- Broader refactor of the runner's error-pattern matcher beyond `error_max_turns`
- Version-bump mechanism redesign (FR1 moves the call site, not the mechanism)
- Changes to the `createPR` skill's name/step-number in the runner pipeline (the fix adjusts scope, not topology)

---

## Evidence

- Runner log: `/var/folders/.../T/sdlc-logs/agentchrome/sdlc-runner.log`
- Failed `createPR` sessions: `createPR-e76ff163-*.log`, `createPR-1f3fce65-*.log`
- Failed `commitPush` sessions: `commitPush-16370bb1-*.log`, `commitPush-d51e3473-*.log`, `commitPush-5f7eed43-*.log`

All three failed `commitPush` sessions produced identical "won't force-push without confirmation" output — high-confidence reproducer for the AC2 fix.

---

## Validation Checklist

Before moving to PLAN phase:

- [x] Reproduction steps are repeatable and specific
- [x] Expected vs actual behavior is clearly stated
- [x] Severity is assessed
- [x] Acceptance criteria use Given/When/Then format
- [x] At least one regression scenario is included (AC8)
- [x] Fix scope is minimal — no feature work mixed in
- [x] Out of scope is defined
