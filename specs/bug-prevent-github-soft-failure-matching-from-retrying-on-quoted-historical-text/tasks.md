# Tasks: Prevent GitHub soft-failure matching from retrying on quoted historical text

**Issue**: #128
**Date**: 2026-04-27
**Status**: Approved
**Author**: Codex

---

## Summary

| Task | Description | Status |
|------|-------------|--------|
| T001 | Make GitHub access matching source-aware | [x] |
| T002 | Add true-positive and false-positive regression tests | [x] |
| T003 | Verify runner regression suite and spec coverage | [x] |
| **Total** | 3 tasks | |

---

## Tasks

### T001: Make GitHub Access Matching Source-Aware

**File(s)**: `scripts/sdlc-runner.mjs`
**Type**: Modify
**Depends**: None
**Acceptance**:
- [x] `github_access` detection no longer matches every occurrence of `error connecting to api.github.com` inside terminal success/result prose.
- [x] Direct plain-text GitHub CLI failures still return `{ isSoftFailure: true, reason: "text_pattern: github_access" }`.
- [x] GitHub CLI failures emitted as non-JSON stderr combined with JSON stdout still return `github_access`.
- [x] Failed terminal events or explicit tool-originated GitHub failure output remain detectable.
- [x] Existing non-GitHub text patterns (`plan approval`, `request_user_input in unattended-mode`) keep their current behavior.

**Notes**: Prefer a dedicated helper such as `matchGithubAccessFailure()` over adding more conditions to a single broad regex. Exclude JSON-encoded terminal success prose from the raw fallback so successful assistant summaries cannot re-trigger the bug.

### T002: Add True-Positive And False-Positive Regression Tests

**File(s)**: `scripts/__tests__/sdlc-runner.test.mjs`
**Type**: Modify
**Depends**: T001
**Acceptance**:
- [x] A test confirms direct `error connecting to api.github.com` output still classifies as `text_pattern: github_access`.
- [x] A test confirms stderr/non-JSON GitHub failure output combined with JSON stdout still classifies as `github_access`.
- [x] A test confirms successful Codex JSON `result` text quoting the GitHub error returns `isSoftFailure: false`.
- [x] Tests cover quoted historical contexts representative of memory excerpts, rollout summaries, specs, logs, or child assistant prose.
- [x] Existing `detectSoftFailure()` tests for `error_max_turns`, `turn.failed`, `permission_denials`, and other text patterns continue to pass.

**Notes**: Update the current test that expects a successful Codex JSON output containing the phrase to match. Under this spec, that fixture is the false-positive regression and should no longer return `github_access` unless it includes live failure evidence.

### T003: Verify Runner Regression Suite And Spec Coverage

**File(s)**: `scripts/`, `specs/bug-prevent-github-soft-failure-matching-from-retrying-on-quoted-historical-text/feature.gherkin`
**Type**: Modify
**Depends**: T002
**Acceptance**:
- [x] `cd scripts && npm test` passes.
- [x] The regression scenarios in `feature.gherkin` map one-to-one to AC1 through AC4.
- [x] The implementation does not modify runner retry budgets, child Codex launch permissions, or unrelated permission-denial handling.
- [x] The final verification report notes both the preserved true-positive path and the fixed quoted-context false-positive path.

---

## Dependency Graph

```text
T001 -> T002 -> T003
```

---

## Change History

| Issue | Date | Summary |
|-------|------|---------|
| #128 | 2026-04-27 | Initial defect task plan |
