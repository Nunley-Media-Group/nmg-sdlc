# Tasks: Fix run-loop child Codex GitHub access

**Issue**: #122
**Date**: 2026-04-26
**Status**: Complete
**Author**: Codex

---

## Summary

| Task | Description | Status |
|------|-------------|--------|
| T001 | Switch runner-spawned child Codex sessions to yolo/no-sandbox execution | [x] |
| T002 | Detect GitHub auth/network text failures as soft failures | [x] |
| T003 | Add regression tests for launch mode and failure classification | [x] |
| T004 | Verify runner behavior and spec integrity | [x] |

---

### T001: Switch Child Codex Launch Mode

**File(s)**: `scripts/sdlc-runner.mjs`
**Type**: Modify
**Depends**: None
**Acceptance**:
- [x] `buildCodexArgs()` uses Codex's yolo/no-sandbox flag (`--dangerously-bypass-approvals-and-sandbox`) for every runner-spawned child step.
- [x] `buildCodexArgs()` no longer emits `--full-auto`.
- [x] Existing `--json`, `--model`, `--cd`, and per-step effort behavior remain unchanged.
- [x] `.codex/unattended-mode` behavior and no-prompt runner instructions are preserved.

**Notes**: This changes the child sandbox/capability level only. It must not alter step order, config resolution, or runner state management.

### T002: Detect GitHub Access Text Failures

**File(s)**: `scripts/sdlc-runner.mjs`
**Type**: Modify
**Depends**: T001
**Acceptance**:
- [x] `TEXT_FAILURE_PATTERNS` includes the reproduced GitHub access failure (`error connecting to api.github.com`) with a clear label such as `github_access`.
- [x] `detectSoftFailure()` returns `isSoftFailure: true` for the reproduced GitHub access output when the child exits 0.
- [x] The soft-failure reason preserves the GitHub access classification so runner logs surface the actual blocker.
- [x] Existing JSON-based soft-failure checks remain authoritative when a terminal JSON event is present.

**Notes**: If the implementation currently passes only stdout to `detectSoftFailure()`, include stderr or combined child output when classifying text-only GitHub failures.

### T003: Add Regression Tests

**File(s)**: `scripts/__tests__/sdlc-runner.test.mjs`
**Type**: Modify
**Depends**: T001, T002
**Acceptance**:
- [x] A test iterates every configured `STEP_KEYS` / `STEPS` entry and asserts child args include `--dangerously-bypass-approvals-and-sandbox`.
- [x] The same launch-args test asserts child args do not include `--full-auto`.
- [x] A soft-failure test asserts `error connecting to api.github.com` is classified as a GitHub access soft failure.
- [x] Existing no-feature-branch Step 2 postcondition behavior remains covered for output without a GitHub access failure.
- [x] Existing environment-sanitization coverage still verifies auth variables such as `GITHUB_TOKEN` are preserved.

**Notes**: Prefer deterministic unit coverage around `buildCodexArgs()` and `detectSoftFailure()` over a live network test in the unit suite.

### T004: Verify Runner Behavior and Spec Integrity

**File(s)**: `scripts/__tests__/sdlc-runner.test.mjs`, `scripts/sdlc-runner.mjs`, `specs/bug-fix-run-loop-child-codex-github-access/feature.gherkin`
**Type**: Verify
**Depends**: T003
**Acceptance**:
- [x] Focused runner tests pass for `scripts/__tests__/sdlc-runner.test.mjs`.
- [x] If feasible, run a controlled child-launch exercise showing the generated child command uses the yolo/no-sandbox flag.
- [x] `feature.gherkin` contains one `@regression` scenario for every acceptance criterion in `requirements.md`.
- [x] `git diff --check` passes.

**Notes**: Full live GitHub child parity can be exercised manually or in a controlled runner smoke because the unit suite should not depend on external network state.

---

## Validation Checklist

Before moving to IMPLEMENT phase:

- [x] Tasks are focused on the fix -- no feature work
- [x] Regression test is included (T003)
- [x] Each task has verifiable acceptance criteria
- [x] No scope creep beyond the defect
- [x] File paths reference actual project structure (per `structure.md`)

---

## Change History

| Issue | Date | Summary |
|-------|------|---------|
| #122 | 2026-04-26 | Initial defect task plan |
