# Root Cause Analysis: Unattended SDLC Runner Cascade Failure on Diverged Remote Branch

**Issue**: #102
**Date**: 2026-04-23
**Status**: Draft
**Author**: Rich Nunley

---

## Root Cause

The cascade has six interlocking defects across two surfaces — the SDLC runner (`scripts/sdlc-runner.mjs`) and the `/open-pr` skill instructions (`skills/open-pr/`). Each defect by itself is survivable; together they form a trap that only springs when (a) the remote feature branch has diverged from local and (b) the runner is in unattended mode.

**(A) `createPR` owns history reconciliation.** The `/open-pr` skill's Step 5 Section 0 ("Pre-push race detection") instructs the subagent to detect advanced `origin/main`, run `git pull --rebase origin main`, re-compute and `--amend` the version-bump commit, then `git push` without `--force`. The ref `references/pr-body.md:107-111` explicitly forbids `--force-with-lease`. When the rebase succeeds, the push is non-fast-forward because the remote still holds pre-rebase SHAs — rejected.

**(B) `commitPush` refuses force-push in unattended mode.** The runner-generated prompt at `scripts/sdlc-runner.mjs:979` tells the subagent to "push to the remote branch". Without explicit permission to force-push, the haiku subagent defaults to the conservative path: "I won't force-push without your confirmation." In unattended mode there is no confirmer, so all three retry attempts end the same way.

**(C) Runner misclassifies `error_max_turns` as rate-limit.** `matchErrorPattern` at `scripts/sdlc-runner.mjs:1132-1140` tests only `/rate_limit/i` and `IMMEDIATE_ESCALATION_PATTERNS`. When a step session exits with `subtype: "error_max_turns"`, nothing in `matchErrorPattern` catches it — but `handleFailure` at `scripts/sdlc-runner.mjs:1299-1303` still matches the output against the rate-limit regex and produces `"Rate limited. Waiting 60s before retry..."`. The actual `error_max_turns` path only fires inside `detectSoftFailure` (line 1186), which runs in the happy-path branch (exit code 0). On a non-zero exit it never runs.

**(D) `createPR` has too many responsibilities for its budget.** Per `skills/open-pr/SKILL.md`, the skill does: preflight + version-bump + changelog roll + commit + pre-push race detection + rebase + amend + push + `gh pr create` + label add + optional CI monitor. Issue #249's config used `maxTurns: 15` (the current default is 45 in `scripts/sdlc-config.example.json`, but that's still a lot of responsibilities for a "create PR" step).

**(E) Step bouncing loses state.** When `runStep` bounces to the previous step (`scripts/sdlc-runner.mjs:2073-2077` and `1305-1318`), the only things passed forward are `currentStep` and the retry counter in `sdlc-state.json`. The receiving step's prompt is regenerated from `buildClaudeArgs` with no knowledge of *why* it was re-invoked — so the `commitPush` subagent spends turns re-investigating divergence from scratch on every bounce.

**(F) `startIssue` does not reconcile stale remote branches.** When the runner re-picks an issue whose feature branch was pushed in an earlier cycle, `skills/start-issue/SKILL.md` Step 4 calls `gh issue develop N --checkout`, which checks out the existing remote branch. The remote tip reflects the earlier cycle's work; local will be rebuilt fresh as the new cycle proceeds. Any subsequent rebase-then-push in `createPR` collides with the stale remote.

### Affected Code

| File | Lines | Role |
|------|-------|------|
| `scripts/sdlc-runner.mjs` | 1132, 1134-1140 | `RATE_LIMIT_PATTERN` + `matchErrorPattern` — no `error_max_turns` branch |
| `scripts/sdlc-runner.mjs` | 1292-1303 | `handleFailure` — rate-limit wait path runs before `error_max_turns` is detected |
| `scripts/sdlc-runner.mjs` | 1183-1214 | `detectSoftFailure` — already detects `error_max_turns` but only on exit-code-0 path |
| `scripts/sdlc-runner.mjs` | 2048-2080, 1305-1318 | `runStep` / `handleFailure` bounce path — no structured context passed to N-1 |
| `scripts/sdlc-runner.mjs` | 938-1001 | `buildClaudeArgs` prompt table — no hook for bounce context injection |
| `scripts/sdlc-runner.mjs` | 979 | `commitPush` inline prompt — tells subagent to `git push` without force-with-lease guidance |
| `scripts/sdlc-runner.mjs` | 981 | `createPR` inline prompt — hardcodes the version-bump responsibility |
| `skills/open-pr/SKILL.md` | Steps 2, 3, 5 | Version-bump + pre-push race detection + rebase-and-amend |
| `skills/open-pr/references/pr-body.md` | 87-118 | Section 0 pre-push race detection + Section 1 push rules forbidding `--force-with-lease` |
| `skills/start-issue/SKILL.md` | Step 4 (via `references/dirty-tree.md`) | No stale-remote-branch probe before branch creation |

### Triggering Conditions

- The runner is in unattended mode (`.claude/unattended-mode` sentinel present).
- The feature branch has diverged from local: either a stale remote tip from an earlier cycle (`startIssue` contributing) or `main` advanced mid-run (epic-child scenario).
- `createPR` reaches its pre-push race-detection branch, rebases, and attempts the non-force push.

Why these conditions weren't caught before: the rebase-and-push logic in `/open-pr` was designed for the epic-child race case (sibling merged mid-run) where `--force-with-lease` is unnecessary because local was never ahead of remote. It was never exercised against a stale remote branch whose tip is behind local post-rebase.

---

## Fix Strategy

### Approach

Split the fix along the six defects. Each defect gets a surgical change, and the six together restore the unattended `createPR → commitPush` handoff. No new skills are introduced; existing skills are re-scoped and the runner gains an `error_max_turns` branch plus a bounce-context channel.

- **(A, D)** Trim `/open-pr` to preconditions + PR body assembly + `gh pr create` + post-create labelling. Move version-bump (current Steps 2–3), changelog roll, and pre-push race detection + rebase out. This makes `/open-pr` fit its name and frees it from the turn-budget pressure that caused Bug D.
- **(B)** Relocate the commit-push-and-bump-version work to a new `skills/commit-push/` skill with an explicit unattended-mode branch that allows `git push --force-with-lease` when the lease check is safe. The runner's `commitPush` step gets the `skill: 'commit-push'` pointer (matching `startIssue`, `writeSpecs`, `implement`, `verify`, `createPR` — the other skill-backed steps).
- **(C)** Extend `matchErrorPattern` (or thread through `handleFailure`) to recognize `subtype: "error_max_turns"` in the parsed result stream **before** the rate-limit regex runs. On match, skip the rate-limit wait entirely and return an `error_max_turns`-specific action.
- **(E)** Add a module-level `bounceContext` object set when `retry-previous` fires. `buildClaudeArgs` prepends a structured "Bounce context" block to the next step's prompt when the context is non-null, then `runStep` clears it after the step runs.
- **(F)** Add a Step 3.5 to `/start-issue` (before branch creation in Step 4) that probes for an existing remote feature branch matching the selected issue number; when its tip is not reachable from `origin/main`, delete the stale remote branch with `git push origin --delete {branch}` so `gh issue develop --checkout` creates a fresh one.
- **(FR6)** Keep `createPR` `maxTurns` at 45 through this fix; add a tasks.md verify step that confirms post-FR1 runs complete within a smaller envelope, and lower the default to 20 only if three consecutive unattended runs stay under that threshold.

### Changes

| File | Change | Rationale |
|------|--------|-----------|
| `skills/commit-push/SKILL.md` | **Create.** Own: stage changes, version-bump + changelog roll (moved from `/open-pr`), commit, fetch + ancestry check against `origin/main`, rebase on divergence, push. In unattended mode + post-rebase + safe lease → `git push --force-with-lease`. | Gives FR1's displaced work a proper home and scopes the force-with-lease exception to exactly the conditions where it is safe (AC2). |
| `skills/commit-push/references/rebase-and-push.md` | **Create.** Relocate Section 0 (pre-push race detection + rebase + amend) from `skills/open-pr/references/pr-body.md` verbatim, plus a new "force-with-lease under unattended + diverged" subsection. | Keeps the detailed procedure close to its skill; avoids bloating SKILL.md. |
| `skills/commit-push/references/version-bump-delegation.md` | **Create.** Pointer doc that references `skills/open-pr/references/version-bump.md` for the bump matrix and artifact-update procedure. | The version-bump logic itself is unchanged (FR1 moves the call site, not the mechanism — see Out of Scope). A pointer avoids duplication. |
| `skills/open-pr/SKILL.md` | **Modify.** Remove Steps 2, 3, and Step 5 Section 0 (race detection + rebase). Step 5 becomes: "verify ancestry of `HEAD` with `origin/main`; if diverged, exit non-zero with `DIVERGED: re-run commit-push to reconcile` so the runner bounces to step 7; otherwise `gh pr create`." | AC4: createPR scoped to preconditions + `gh pr create`. |
| `skills/open-pr/references/pr-body.md` | **Modify.** Delete Section 0 (pre-push race detection) and the `git push` rules in Section 1; the skill no longer pushes. Keep Template A / Template B body content and the output block. | No push duty remains in `/open-pr`, so the push rules shouldn't live here. |
| `skills/start-issue/SKILL.md` | **Modify.** Insert Step 3.5 "Reconcile stale remote branch" before Step 4. Add a pointer to the new reference. | AC7: stale remote deleted before `gh issue develop` re-attaches. |
| `skills/start-issue/references/stale-remote-branch.md` | **Create.** Procedure: resolve the branch name for the selected issue (`gh issue view N --json linkedBranches` + fallback to `gh issue develop --list`), probe with `git ls-remote`, reachability check `git merge-base --is-ancestor <remote-tip> origin/main`, delete via `git push origin --delete` when stale, log each action. | Keeps the procedure close to `/start-issue` and follows the plugin's convention of pointing into references for multi-step procedures. |
| `scripts/sdlc-runner.mjs` — `matchErrorPattern` / `handleFailure` | **Modify.** Before the rate-limit regex runs, call `extractResultFromStream(output)` and check `parsed?.subtype === 'error_max_turns'`. On match, return `{ action: 'max_turns', pattern: 'error_max_turns' }`. `handleFailure` adds a branch for that action: log `"Turn budget exhausted on Step N (key). Bouncing to Step N-1..."`, do **not** sleep, and fall through to the existing precondition-failed bounce path (which re-routes control to the prior step). | AC3: removes the false rate-limit classification. Reuses the existing bounce path rather than inventing a new recovery action, keeping blast radius small. |
| `scripts/sdlc-runner.mjs` — bounce context | **Modify.** Add `let bounceContext = null` at module scope near `bounceCount`. Set it in both bounce sites (`runStep` lines 2073-2077 and `handleFailure` lines 1305-1318) to `{ from: step.key, fromStepNumber: step.number, reason: 'precondition_failed' \| 'error_max_turns', failedCheck, divergenceHints: {} }`. In `buildClaudeArgs`, when `bounceContext` is non-null and `bounceContext.fromStepNumber === step.number + 1` (receiving the bounce), prepend a "## Bounce context" block to the prompt. Clear `bounceContext = null` at the end of `runStep` after a successful run. | AC5: structured context survives the prompt boundary. |
| `scripts/sdlc-runner.mjs` — `commitPush` prompt | **Modify.** Replace the inline prompt at line 979 with a `skill: 'commit-push'`-backed pointer, matching the pattern used for `startIssue`, `writeSpecs`, etc. | Moves the push-and-bump instructions out of the runner's prompt table and into the skill where they belong. |
| `scripts/sdlc-config.example.json` | **Modify.** Add `"skill": "commit-push"` to the `commitPush` step entry. `createPR` keeps `maxTurns: 45` through this fix (FR6 re-evaluation happens after). | Runner looks up `step.skill` when building the prompt; the new skill needs to be wired. |
| `scripts/__tests__/` | **Modify.** Add tests for: `matchErrorPattern` returning `max_turns` on an `error_max_turns` result; bounce-context injection into `buildClaudeArgs`; stale-branch probe logic (if extracted as a testable helper). | Regression guard for FR3, FR4, and FR5. |

### Blast Radius

- **Direct impact:** `scripts/sdlc-runner.mjs`, `scripts/sdlc-config.example.json`, `skills/open-pr/SKILL.md`, `skills/open-pr/references/pr-body.md`, `skills/start-issue/SKILL.md`, new `skills/commit-push/` tree, new `skills/start-issue/references/stale-remote-branch.md`.
- **Indirect impact:**
  - `skills/open-pr/references/version-bump.md`, `skills/open-pr/references/preflight.md`, `skills/open-pr/references/ci-monitoring.md` — read unchanged by the trimmed `/open-pr`; `commit-push` references `version-bump.md` rather than duplicating it.
  - `scripts/skill-inventory-audit.mjs` / `scripts/skill-inventory.baseline.json` — the new skill must be added to the baseline or the audit workflow will flag it as undeclared.
  - Downstream skills (`address-pr-comments`, `verify-code`) that assume the push has happened before PR creation still see the same postcondition; the pipeline contract is preserved.
- **Risk level:** Medium. The change moves responsibilities across skills; the move is mechanical but touches the fast-running `commitPush` step and the most-exercised `/open-pr` skill.

---

## Regression Risk

| Risk | Likelihood | Mitigation |
|------|------------|------------|
| Green-path unattended cycle starts using force-with-lease unnecessarily | Low | AC2 explicitly gates force-with-lease on (unattended + local was rebased). Test in `scripts/__tests__/` for the push-decision helper covers the no-divergence case. |
| Interactive (non-unattended) force-push behavior changes | Low | The commit-push skill's force-with-lease branch is guarded by the `.claude/unattended-mode` sentinel check; interactive runs fall through to plain `git push`. Out of Scope AC2 still holds. |
| Bounce context leaks across unrelated steps / issues | Medium | Clear `bounceContext = null` at the top of `runStep` and at the start of a new cycle. Test coverage for the clear path. |
| `error_max_turns` detection false-positives on unrelated JSON with the phrase | Low | Match via `extractResultFromStream` (parsed JSON) not raw regex. `detectSoftFailure` already uses the same path successfully. |
| Stale-branch delete removes a branch the user wanted to inspect | Medium | The probe fires only for the selected issue number and only when the remote tip is not an ancestor of `origin/main`. Log the delete. Consider a `--keep-stale-branches` runner flag if operator feedback warrants. |
| `/open-pr` precondition check ("ancestry vs origin/main") fails on an already-diverged branch and loops | Medium | The new ancestry check exits with a distinct `DIVERGED:` marker that bounce-context propagates to `commit-push`; `commit-push` reconciles and returns control. The bounce-loop counter (`MAX_BOUNCE_RETRIES`) still guards the overall loop. |
| `skill-inventory-audit` fails on the new `commit-push` skill until the baseline is updated | Low | Update `skill-inventory.baseline.json` in the same PR. |

---

## Alternatives Considered

| Option | Description | Why Not Selected |
|--------|-------------|------------------|
| Teach `/open-pr` to force-push with lease | Keep the rebase-in-createPR topology; just allow `--force-with-lease` after the rebase when unattended. | Leaves createPR overloaded (Bug D) and does not address FR1's scope-creep goal. Would also widen the blast radius of `/open-pr` instead of narrowing it. |
| Create a dedicated `rebase` step between `verify` and `commitPush` | Adds a new pipeline step for history reconciliation. | Topology change — AC4 and Out of Scope explicitly narrow the fix to existing steps. Also forces every green-path run through a no-op step. |
| Handle divergence entirely in the runner (no skill changes) | `runStep` detects `git push` failure, re-spawns `commit-push` with force-with-lease. | Force-push policy is a skill-authoring concern, not a runner concern. Would duplicate `git` knowledge in two places. |
| Keep `matchErrorPattern` regex-only; widen the regex to `/rate_limit\|error_max_turns/` | Minimal change to the runner. | Produces the wrong action — rate-limit sleeps 60s, `error_max_turns` should bounce. Regex match loses semantic distinction. |

---

## Validation Checklist

Before moving to TASKS phase:

- [x] Root cause is identified with specific code references
- [x] Fix is minimal relative to the six-defect scope — no unrelated refactoring
- [x] Blast radius is assessed
- [x] Regression risks are documented with mitigations
- [x] Fix follows existing project patterns (skill-backed steps, reference-file progressive disclosure, sentinel-guarded unattended branches)
