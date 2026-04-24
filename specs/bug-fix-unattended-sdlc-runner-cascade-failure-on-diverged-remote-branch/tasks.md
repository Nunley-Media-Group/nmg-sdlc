# Tasks: Unattended SDLC Runner Cascade Failure on Diverged Remote Branch

**Issue**: #102
**Date**: 2026-04-23
**Status**: Planning
**Author**: Rich Nunley

---

## Summary

| Task | Description | Status |
|------|-------------|--------|
| T001 | Add `error_max_turns` branch to `matchErrorPattern` / `handleFailure` (FR3) | [ ] |
| T002 | Add `bounceContext` module state + inject into `buildCodexArgs` (FR4) | [ ] |
| T003 | Create `skills/commit-push/` with SKILL.md + references (FR1, FR2) | [ ] |
| T004 | Trim `/open-pr` of version-bump + pre-push rebase (FR1 complement) | [ ] |
| T005 | Add stale-remote-branch probe to `/start-issue` (FR5) | [ ] |
| T006 | Wire runner prompt + config for `commit-push` skill; update skill-inventory baseline | [ ] |
| T007 | Add regression tests (`error_max_turns`, bounce context, stale-branch probe) | [ ] |
| T008 | Write `@regression` Gherkin scenarios for all 8 ACs | [ ] |
| T009 | End-to-end verification + re-evaluate `createPR` maxTurns (FR6) | [ ] |

---

### T001: Add error_max_turns branch to matchErrorPattern / handleFailure

**File(s)**: `scripts/sdlc-runner.mjs` (lines 1132-1140 `matchErrorPattern`; lines 1291-1303 `handleFailure`)
**Type**: Modify
**Depends**: None
**Acceptance**:
- [ ] `matchErrorPattern` calls `extractResultFromStream(output)` and, when `parsed?.subtype === 'error_max_turns'`, returns `{ action: 'max_turns', pattern: 'error_max_turns' }` **before** the `RATE_LIMIT_PATTERN` regex runs.
- [ ] `handleFailure` branches on `patternMatch?.action === 'max_turns'`: logs `"Turn budget exhausted on Step N (key)."` (no `"Rate limited"` string in the output), does **not** sleep, and proceeds into the existing precondition-failed bounce path so control returns to the previous step.
- [ ] A session that exits with `subtype: "error_max_turns"` produces no `"Rate limited. Waiting 60s before retry..."` in the runner log.
- [ ] Existing rate-limit behavior (`/rate_limit/i`) is preserved for genuine rate-limit failures.

**Notes**: Do NOT remove or broaden `RATE_LIMIT_PATTERN`. The check order is the fix: `error_max_turns` is semantically distinct from rate-limiting and must be matched first via parsed JSON, not regex.

### T002: Add bounceContext module state + inject into buildCodexArgs

**File(s)**: `scripts/sdlc-runner.mjs` (module-state near line 148 `bounceCount`; `runStep` lines 2048-2080; `handleFailure` lines 1305-1318; `buildCodexArgs` lines 931-1001; cycle-start reset in `main`)
**Type**: Modify
**Depends**: T001
**Acceptance**:
- [ ] `let bounceContext = null` declared at module scope alongside `bounceCount`.
- [ ] Both bounce sites set `bounceContext = { from, fromStepNumber, reason, failedCheck, divergenceHints }` when `retry-previous` fires. `reason` is one of `'precondition_failed' | 'error_max_turns'`. `divergenceHints` includes at minimum `remoteCommitsSuperseded: <bool>` when the reason is divergence-related, derived from a quick `git log origin/HEAD..HEAD` probe.
- [ ] `buildCodexArgs` prepends a `## Bounce context` block (human-readable YAML-ish) to the step prompt **only** when `bounceContext` is non-null and `bounceContext.fromStepNumber === step.number + 1` (the current step is the one being bounced *to*).
- [ ] `bounceContext` is cleared (`= null`) at the top of `runStep` when the current step completes successfully (returns `'ok'`) and at the start of each new cycle in `main`.
- [ ] The injected block uses a stable, parseable shape so the receiving subagent can read it without guessing: `from:`, `reason:`, `failedCheck:`, `remoteCommitsSuperseded:`.

**Notes**: Keep the probe cheap — the purpose is a hint, not a full diagnosis. A single `git` call is fine; don't loop over commits.

### T003: Create skills/commit-push/ with SKILL.md + references

**File(s)**:
- `skills/commit-push/SKILL.md` *(create)*
- `skills/commit-push/references/rebase-and-push.md` *(create — relocated from `skills/open-pr/references/pr-body.md` § 0; adds the force-with-lease branch)*
- `skills/commit-push/references/version-bump-delegation.md` *(create — pointer to `skills/open-pr/references/version-bump.md`)*

**Type**: Create
**Depends**: None (parallel with T001/T002; integrates via T006)
**Acceptance**:
- [ ] `SKILL.md` frontmatter matches the plugin's convention: `name: commit-push`, `description` beginning with an imperative verb, `workflow instructions` including `Bash(git:*)`, `minimal Codex frontmatter`, `model: gpt-5.4-mini`, and a trigger list that maps to the runner's usage.
- [ ] Workflow covers: Step 1 stage all changes; Step 2 resolve + apply version bump (pointer to `version-bump-delegation.md`); Step 3 conventional-commit commit; Step 4 fetch + ancestry check vs `origin/{base-branch}`; Step 5 rebase when local is behind; Step 6 push.
- [ ] Step 6 push rules: (a) no remote tracking branch → `git push -u origin HEAD`; (b) tracking exists and fast-forward → `git push`; (c) tracking exists and local was rebased AND `.codex/unattended-mode` sentinel is present AND the `--force-with-lease=ref:expected-sha` check is safe → `git push --force-with-lease`; (d) tracking exists and local was rebased AND sentinel is absent → emit interactive prompt per existing interactive-mode convention.
- [ ] "Safe lease" is defined: the expected-sha passed to `--force-with-lease` is the `origin/{branch}` SHA from the fetch that preceded the rebase; the push fails safely if the remote advanced between the fetch and the push.
- [ ] SKILL.md reads `../../references/legacy-layout-gate.md` and `../../references/unattended-mode.md` at the top, per the plugin's convention.
- [ ] `rebase-and-push.md` preserves the epic-child race-detection logic currently in `skills/open-pr/references/pr-body.md` § 0 (rebase, re-compute bump, `--amend`, conflict handling).
- [ ] `version-bump-delegation.md` points at the existing bump matrix reference without duplicating content.

**Notes**: Do NOT re-author the version-bump procedure — the existing `skills/open-pr/references/version-bump.md` is the source of truth. The commit-push skill references it.

### T004: Trim /open-pr of version-bump + pre-push rebase

**File(s)**:
- `skills/open-pr/SKILL.md` (remove Steps 2, 3; modify Step 5)
- `skills/open-pr/references/pr-body.md` (remove Section 0 pre-push race detection + Section 1 push rules)
- `skills/open-pr/references/preflight.md` (re-scope to "PR-creation-only" preconditions if it currently mentions the bump)

**Type**: Modify
**Depends**: T003
**Acceptance**:
- [ ] `open-pr/SKILL.md` workflow reads: Step 0 parse args → Step 1 read context → Step 4 generate PR content → Step 5 ancestry check + `gh pr create` → Step 6 output → Step 7 optional CI monitor. Steps 2 and 3 are removed.
- [ ] The Step 5 ancestry check: `git merge-base --is-ancestor HEAD origin/main`. If non-zero, exit non-zero with stdout including the sentinel line `DIVERGED: re-run commit-push to reconcile before creating PR`. Do NOT rebase, do NOT push, do NOT amend.
- [ ] `pr-body.md` Section 0 ("Pre-push race detection") and Section 1 ("Push") are removed. Section 2 (`gh pr create`) and the output block remain.
- [ ] `preflight.md` no longer gates on "version bump precondition"; it gates only on "dirty tree" / "empty implementation branch" / "ancestry vs origin/main clean".
- [ ] The `--major` escalation branch at the top of SKILL.md is unchanged (it already pre-dates commit creation and does not affect the push).
- [ ] No new `--force` or `--force-with-lease` guidance remains in `/open-pr` references (the push duty has moved).

**Notes**: The `Version` / `Bump:` lines in the PR body templates stay — they describe what `commit-push` committed. `/open-pr` reads them from `VERSION` / `CHANGELOG.md` when assembling Template A/B.

### T005: Add stale-remote-branch probe to /start-issue

**File(s)**:
- `skills/start-issue/SKILL.md` (add Step 3.5)
- `skills/start-issue/references/stale-remote-branch.md` *(create)*

**Type**: Modify + Create
**Depends**: None
**Acceptance**:
- [ ] SKILL.md inserts a "Step 3.5: Reconcile stale remote branch" between the existing Step 3 (confirm) and Step 4 (create branch). The step's entire procedure lives in the new reference; the SKILL.md body is one pointer line.
- [ ] The reference documents: (a) derive the feature-branch name for issue N (first try `gh issue view N --json linkedBranches`, then fallback to the `{N}-{slug}` convention from `feature-naming.md`); (b) probe with `git ls-remote --heads origin {branch}`; (c) when the remote tip exists and `git merge-base --is-ancestor <remote-tip> origin/main` is non-zero, delete the stale branch via `git push origin --delete {branch}`; (d) log `"Reconciled stale remote branch {branch} (tip {sha} not ancestor of origin/main)"`.
- [ ] The probe skips itself when no remote branch exists (green path — no log entry, no delete attempt).
- [ ] The probe is gated by unattended mode: in interactive mode, it prompts via `interactive prompt` before deleting (two-option menu: delete and proceed / abort). In unattended mode per `references/unattended-mode.md` deterministic-default pattern, it deletes without prompting.
- [ ] After probe success (delete or no-op), Step 4's existing `gh issue develop --checkout` proceeds unchanged.

**Notes**: Use `git merge-base --is-ancestor <remote-tip> origin/main` (not `main` as a local ref) — the probe runs before Step 4, so main must be up-to-date via `git fetch origin` which the step performs.

### T006: Wire runner prompt + config for commit-push skill; update skill-inventory baseline

**File(s)**:
- `scripts/sdlc-runner.mjs` (line 979 `commitPush` prompt; prompt table lookup)
- `scripts/sdlc-config.example.json` (add `"skill": "commit-push"` to the `commitPush` step; note that `maxTurns: 15` likely stays but flag for T009 review)
- `scripts/skill-inventory.baseline.json` (add `commit-push` entry)

**Type**: Modify
**Depends**: T003
**Acceptance**:
- [ ] `commitPush` prompt at line 979 becomes skill-backed and matches the pattern of `writeSpecs`, `implement`, `verify`, `createPR`: `"Commit and push the work for issue #{N} on branch {branch}. Skill instructions are appended to your system prompt. Resolve relative file references from {skillRoot}/."`
- [ ] `sdlc-config.example.json` entry for `commitPush` includes `"skill": "commit-push"` so `resolveSkillsBase` can locate it.
- [ ] `skill-inventory.baseline.json` includes `commit-push` with its expected file list; the audit script passes.
- [ ] The runner does not attempt to read `skills/commit-push/SKILL.md` before T003 lands — T006 must merge after or with T003.

**Notes**: Do NOT change `createPR`'s `maxTurns` default in this task; T009 handles FR6.

### T007: Regression tests

**File(s)**:
- `scripts/__tests__/sdlc-runner.test.mjs` *(extend — new describe blocks)*
- `scripts/__tests__/stale-remote-branch.test.mjs` *(create — if the probe helper is extractable)*

**Type**: Create + Modify
**Depends**: T001, T002, T005
**Acceptance**:
- [ ] New test: `matchErrorPattern` returns `{ action: 'max_turns' }` for a stream output containing `{"subtype":"error_max_turns"}` and does NOT match the rate-limit pattern in the same output.
- [ ] New test: `handleFailure` invoked with an `error_max_turns` result does not call `sleep(60_000)` (mock `sleep`); asserts the bounce path is taken with no rate-limit log entry.
- [ ] New test: `bounceContext` is non-null after a precondition bounce and is consumed by the next `buildCodexArgs(step, state)` call where `step.number === bounceContext.fromStepNumber - 1`.
- [ ] New test: `bounceContext` is `null` after the re-invoked step completes successfully.
- [ ] New test: the stale-remote-branch probe's decision function (extract into a testable helper if needed) returns `'delete'` when the remote tip is not an ancestor of `origin/main` and `'skip'` when no remote branch exists. Use a temp repo with two disposable refs to exercise both paths.
- [ ] Tests follow the project's existing jest-ESM pattern (see `sdlc-runner.test.mjs`).

**Notes**: Do not land exercise-SDK tests (opt-in via `RUN_EXERCISE_TESTS=1`) — those are for the end-to-end verification step (T009). T007 covers deterministic unit-level regression guards.

### T008: Write @regression Gherkin scenarios for all 8 ACs

**File(s)**: `specs/bug-fix-unattended-sdlc-runner-cascade-failure-on-diverged-remote-branch/feature.gherkin`
**Type**: Create
**Depends**: None (can run in parallel with implementation)
**Acceptance**:
- [ ] One `@regression`-tagged `Scenario:` per AC (AC1–AC8) — eight total.
- [ ] `Feature:` description states what was broken (cascade failure on diverged remote under unattended mode) and how the fix addresses it.
- [ ] Each scenario uses concrete data drawn from the issue reproduction (issue #249, branch `249-fix-config-init-custom-path`, etc.).
- [ ] `Feature`-level `@regression` tag is present per the defect Gherkin convention.
- [ ] Valid Gherkin syntax.

### T009: End-to-end verification + re-evaluate createPR maxTurns (FR6)

**File(s)**: None modified directly; this task is verification + potentially a config default tweak
**Type**: Verify
**Depends**: T001, T002, T003, T004, T005, T006, T007
**Acceptance**:
- [ ] Run the unattended runner on the three original reproducer sessions (or equivalent synthetic reproducers): (a) re-picked issue with stale remote branch; (b) main advances mid-run; (c) fresh green-path cycle. All three complete without escalation and produce a merged PR (or reach `monitorCI` on CI-less repos).
- [ ] Capture actual `createPR` turn usage across three consecutive successful green-path runs. If the p95 is under 20, lower `sdlc-config.example.json` → `commitPush` and `createPR` defaults accordingly and note the evidence in `CHANGELOG.md` under `[Unreleased]`.
- [ ] If the p95 stays between 20 and 45, keep the current defaults and document the decision in the PR body for issue #102.
- [ ] Runner log for the stale-remote scenario contains: "Reconciled stale remote branch …" and does NOT contain "Rate limited" or "won't force-push without your confirmation".
- [ ] Green-path log contains NONE of: "force-with-lease", "Reconciled stale remote branch", "Bounce context" — confirming AC8 no-regression.

**Notes**: The FR6 re-evaluation is empirical; do not guess a new default without runner evidence. If the cycle time budget is too tight for three back-to-back runs, document the measurement plan and schedule it for the follow-up cycle rather than blocking the fix on it.

---

## Validation Checklist

Before moving to IMPLEMENT phase:

- [x] Tasks are focused on the six-defect fix — no feature work
- [x] Regression test task is included (T007) + BDD scenarios (T008)
- [x] Each task has verifiable acceptance criteria
- [x] No scope creep beyond the defect
- [x] File paths reference actual project structure (per `structure.md`)
