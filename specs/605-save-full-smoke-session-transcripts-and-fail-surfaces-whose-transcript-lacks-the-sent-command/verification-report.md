# Verification Report: Save full smoke session transcripts and fail surfaces whose transcript lacks the sent command

**Date**: 2026-11-25
**Issue**: #605
**Reviewer**: Claude (nmg-sdlc verify worker, gate phase)
**Scope**: Implementation verification against spec

**Verification head**: cf357f832373c9949781b3e841ddf5ceeeb343cd

---

## Executive Summary

| Category | Score (1-5) |
|----------|-------------|
| Spec Compliance | 5 |
| Architecture (SOLID) | 5 |
| Security | 5 |
| Performance | 4 |
| Testability | 5 |
| Error Handling | 4 |
| **Overall** | 4.7 |

### Implementation Status: Pass
**Total Issues**: 3. All are low severity or informational, and none blocks merge.

The review passed at fd0b866 with no finding above `info`. The gate at queue head `cf357f8` has the default branch integrated and the version prepared. All four registered validations have results (coverage 4/4 complete, ceiling `null`):

- `repository.tests` ran the full suite through the `fallback_path` selection and passed.
- `repository.nmg-sdlc-smoke` passed. It exercised all seven smoke surfaces live and delivered smoke issue #371 through PR #373.
- The two `full`-tier copies were skipped before merge, as designed.

---

## Issue Scope

- Active issue: #605
- Spec: `specs/605-save-full-smoke-session-transcripts-and-fail-surfaces-whose-transcript-lacks-the-sent-command`
- Manifest: implicit single issue
- Resolver status: `implicit_single_issue`
- Delivery: AC [AC1, AC2, AC3]; FR [FR1, FR2, FR3]; tasks [T001, T002, T003]; scenarios [SCN001, SCN002, SCN003]
- Regression: AC []; FR []; scenarios []

<!-- nmg-sdlc-issue-scope: {"issueNumber":605,"specPath":"specs/605-save-full-smoke-session-transcripts-and-fail-surfaces-whose-transcript-lacks-the-sent-command","status":"implicit_single_issue","delivery":{"acceptanceCriteria":["AC1","AC2","AC3"],"functionalRequirements":["FR1","FR2","FR3"],"tasks":["T001","T002","T003"],"scenarios":["SCN001","SCN002","SCN003"]},"regression":{"acceptanceCriteria":[],"functionalRequirements":[],"scenarios":[]}} -->

## Delivery Validation

- Local verification: Pass
- PR evidence: Not required

---

## Deterministic Steering Artifact and Ceiling

- Artifact: `.nmg-sdlc/verification/605.json` (tier `pre-merge`, head `cf357f832373c9949781b3e841ddf5ceeeb343cd`, tree clean)
- Coverage: declared 4, recorded 4, complete `true`, with nothing missing, duplicated or unknown
- Ceiling: `null`
- Selection: `mode: all`, `reason: fallback_path` (`steering/extensions/nmg-sdlc-smoke.mjs` matches `fallbackPaths`), model `haiku` at `xhigh`. All 14 surfaces were selected, and the required surface was `project-steering`. No rejection.

---

## Acceptance Criteria Verification

| AC | Description | Status | Evidence |
|----|-------------|--------|----------|
| AC1 | Saved transcripts cover the whole session | Pass | `steering/snippets/project-smoke.md` steps 4, 5 and 6 empty the log, type without Enter, append a capture before Enter, append at every poll, and append once more at finish. The gate's live exercise followed this procedure, and all six interactive transcripts hold the session from the typed command to completion. Exercised: not_exercisable by a unit test; the live gate-phase smoke exercised it. |
| AC2 | A transcript without the sent command fails the surface | Pass | `steering/extensions/nmg-sdlc-smoke.mjs:817-823` returns `transcript lacks the sent command`. `scripts/__tests__/nmg-sdlc-smoke.test.mjs` `@SCN002` drives the real provider on real files, and the review's mutation probe made it fail without the fix. Exercised: real_entry_point. |
| AC3 | Complete transcripts still pass | Pass | `@SCN003` covers a wrapped command, which passes. Live gate: six interactive surface records passed with transcripts containing their commands. Exercised: real_entry_point. |

No criterion's tests mock the path under test.

---

## Task Completion

| Task | Description | Status | Notes |
|------|-------------|--------|-------|
| T001 | Capture the whole surface session | Complete | `steering/snippets/project-smoke.md` |
| T002 | Fail a transcript that lacks the sent command | Complete | `steering/extensions/nmg-sdlc-smoke.mjs` |
| T003 | Implement the Regression Scenarios | Complete | `scripts/__tests__/nmg-sdlc-smoke.test.mjs` (#605 @SCN001-@SCN003) |

---

## Architecture Assessment

### SOLID Compliance

| Principle | Score (1-5) | Notes |
|-----------|-------------|-------|
| Single Responsibility | 5 | The check stays inside `readSurfaceRecord`. A small `withoutWhitespace` helper does the normalization. |
| Open/Closed | 5 | One reason is added after every existing check. The earlier checks and their reason texts are unchanged (FR3). |
| Liskov Substitution | 5 | N/A beyond the provider contract, which is unchanged |
| Interface Segregation | 5 | The record schema is unchanged |
| Dependency Inversion | 5 | The check reads through the injected `readFile` |

### Layer Separation

The change stays inside project-owned steering: the snippet routed to `worker:verify` and the project extension provider. No plugin workflow, agent or runtime file changed.

### Dependency Flow

`checkInteractiveSurfaces` → `readSurfaceRecord` is unchanged. The new read uses the same injected reader as the record read.

---

## Security Assessment

- [x] Authentication: N/A
- [x] Authorization: N/A
- [x] Input validation: the transcript path is still confined to the record directory (lstat, realpath, no symlinks) before it is read
- [x] Injection prevention: no shell or command construction was added
- [x] Data protection: transcripts stay in the git-ignored `.nmg-sdlc/`

---

## Performance Assessment

- [x] Async patterns: N/A (bounded synchronous read during gate startup)
- [x] Caching: N/A
- [x] Resource management: each poll appends the full pane history, so logs grow with the number of polls. They were 20-60 KB per surface in this run (review F2, info).
- [x] Query optimization: N/A

---

## Test Coverage

### Scenario Coverage

| AC | Scenario | Implementation | Status |
|----|----------|----------------|--------|
| AC1 | `@SCN001` | `scripts/__tests__/nmg-sdlc-smoke.test.mjs` | Implemented |
| AC2 | `@SCN002` | `scripts/__tests__/nmg-sdlc-smoke.test.mjs` | Implemented |
| AC3 | `@SCN003` | `scripts/__tests__/nmg-sdlc-smoke.test.mjs` | Implemented |

### Test-Layer Findings

Kept test types: `bdd`

Among the test files the branch added or changed:

- Duplicate: none
- Non-kept type: none. The `#605` tests are the scenario implementations named by the `# File:` header and cite their `@SCN` tags.
- Justified: none

---

## Exercise Test Results

| Field | Value |
|-------|-------|
| **Surfaces exercised** | draft-issue, write-spec, onboard-project, upgrade-project, steering, run-retro (interactive) and execute (gate delivery) |
| **Test Project** | Fresh `--single-branch` clones of `Nunley-Media-Group/nmg-sdlc-smoke`, one per surface, removed after capture |
| **Exercise Method** | `claude --plugin-dir <this checkout>` in detached tmux sessions, driven with `tmux send-keys`, with transcripts captured per the #605 snippet procedure |
| **Interactive gate handling** | The verify worker answered each dialog, keeping the work to one small issue or a no-op |

### Captured Output Summary

- `/sdlc-draft-issue <need>` created smoke issue #371, "Add greeting_uppercase library helper" (enhancement, milestone v3).
- `/sdlc-write-spec #371` published the spec, and spec PR #372 merged. The worker chose Finished.
- `/sdlc-onboard-project` found the project already initialized. The worker chose Exit, so nothing was written.
- `/sdlc-upgrade-project` kept test layers `bdd,unit` and declined the sdlc-models and verification-scope items. Auto mode blocked the approved `sdlc-upgrade.mjs apply` command, and the worker ran it with `!` in the smoke clone; it exited 0 and wrote `steering/test-layers.json` in that clone only.
- `/sdlc-steering <append one pytest sentence to project.tech>` applied and validated with `ok: true`.
- `/sdlc-run-retro` updated `steering/retrospective.md` and its state file in the clone.
- Gate `execute`: `/sdlc-execute #371` (session `829a664d-5515-457a-9527-0827aa658128`) delivered #371. PR #373 is MERGED at `eb9f7ed7398b5f9698278f83c386702ab766d8fe`, and the issue is CLOSED.

### AC Evaluation

| AC | Description | Verdict | Evidence |
|----|-------------|---------|----------|
| AC1 | Whole-session transcripts | Pass | Each `.nmg-sdlc/smoke/surfaces/<surface>.log` holds the pre-Enter capture plus every poll through completion |
| AC2 | Missing command fails | Pass | Observed live: three first-attempt transcripts lacked the command (see Remaining Issues), and the provider rule would have refused them |
| AC3 | Complete transcripts pass | Pass | The gate accepted all six interactive records |

### Notes

On the first attempt, the worker captured the pane immediately after `tmux send-keys`, before the TUI had drawn the typed text. Three transcripts (draft-issue, upgrade-project, run-retro) then lacked the sent command. The other two (onboard-project, steering) contained the command only as incidental text in the rendered workflow body. All five sessions were run again in fresh clones, this time waiting until the typed command was visible in the pane before the pre-Enter capture. Before the rerun, no smoke issue had been created, so no second issue was drafted. The first-attempt logs were kept as evidence in the worker's scratchpad.

---

## Steering Doc Verification Gates

| Gate | Tier / Selection | Status | Evidence |
|------|------------------|--------|----------|
| `repository.tests` | `change`; selection `{provider: claude:haiku, reason: fallback_path, fallbackPath: steering/extensions/nmg-sdlc-smoke.mjs, selectedCount: null}` | Pass | `npm test -- --runInBand` exited 0: 86 suites passed, 1 skipped; 2045 tests passed, 2 skipped. Log: `.nmg-sdlc/verification/605/repository.tests.log` |
| `repository.nmg-sdlc-smoke` | `null` / `null` | Pass | All seven surfaces exercised at `cf357f8`. Smoke #371 was delivered by PR #373, MERGED at `eb9f7ed7398b5f9698278f83c386702ab766d8fe`, and the issue is CLOSED. |
| `repository.tests.full` | `full` | Skipped (pre-merge) | Run by `/sdlc-verify-full` |
| `repository.nmg-sdlc-smoke.full` | `full` | Skipped (pre-merge) | Run by `/sdlc-verify-full` |
| Git hygiene | — | Pass | The gate recorded a clean tree at the verification head |

**Gate Summary**: 2/2 applicable gates passed, 0 failed, 0 incomplete. 2 `full`-tier gates were skipped before merge.

---

## Fixes Applied

None. Under `/sdlc-execute`, the gate phase does not edit source.

## Remaining Issues

### Low Priority

| Field | Value |
|-------|-------|
| **Severity** | Low |
| **Category** | Testing |
| **Location** | `steering/snippets/project-smoke.md` (steps 4-6) |
| **Issue** | The instructions say to capture "after the command is typed and before Enter". They do not say to wait until the typed text is visible in the pane. A capture taken right after `send-keys` can come before the TUI redraws, so the transcript lacks the sent command. |
| **Impact** | A genuine run can fail with `nmg-sdlc-smoke surface not exercised: <surface>` (`transcript lacks the sent command`). The worker hit this on its first attempt and avoided it by waiting for the text to appear. |
| **Reason Not Fixed** | Out of the gate phase's authority. Candidate follow-up: tell the snippet to poll until the typed command appears before the pre-Enter capture. |

| Field | Value |
|-------|-------|
| **Severity** | Low |
| **Category** | Error Handling |
| **Location** | `steering/extensions/nmg-sdlc-smoke.mjs:821` |
| **Issue** | The whitespace-insensitive substring check is met by any occurrence of the command, including the command name appearing in the rendered workflow body (for example, `/sdlc-onboard-project` in onboarding's own command list). A transcript where the sent line was never captured can still pass for a command that has no arguments. |
| **Impact** | The check is weaker evidence for commands without arguments. It meets FR2 as specified. |
| **Reason Not Fixed** | Behaviour matches the approved spec. Tightening it would be a separate scope decision. |

### Informational (from review)

- F1: a long `send-keys` burst could collapse into a `[Pasted text]` placeholder. That did not happen here: the 140-character draft-issue command rendered in full.
- F2: logs grow with the number of polls. They were 20-60 KB per surface in this run.

---

## Positive Observations

- The new reason is added after every earlier check, so existing diagnostics keep their priority and text.
- The live gate showed the new check doing its job. The first-attempt transcripts that lacked the command would have been refused, not accepted silently.

---

## Recommendations Summary

### Before PR (Must)
- None

### Short Term (Should)
- [ ] Make the snippet wait for the typed command to render before the pre-Enter capture

### Long Term (Could)
- [ ] Consider anchoring the transcript check to the prompt-line capture, not any occurrence of the command

---

## Files Reviewed

| File | Issues | Notes |
|------|--------|-------|
| `steering/extensions/nmg-sdlc-smoke.mjs` | 1 (low) | Transcript contains-command check |
| `steering/snippets/project-smoke.md` | 1 (low) | Whole-session capture procedure |
| `scripts/__tests__/nmg-sdlc-smoke.test.mjs` | 0 | #605 @SCN001-@SCN003 |
| `CHANGELOG.md`, `VERSION`, `package.json`, `.claude-plugin/plugin.json` | 0 | Version prepared at the queue head; changelog bullet ends with (#605) |

---

## Recommendation

**Ready for PR**

Every acceptance criterion passes. The full suite and the full live smoke (seven surfaces plus delivery of #371) passed at the exact queue head `cf357f832373c9949781b3e841ddf5ceeeb343cd`, with complete coverage and no ceiling.
