# Tasks: Require observed closing-issue linkage before exact-head merge

**Issue**: #448
**Date**: 2026-10-06
**Status**: Approved
**Author**: NMG
**Related Spec**: specs/8-open-pr-skill/

## Implementation Tasks

### T001: Correct the Root Cause

**File(s)**: `scripts/sdlc-deliver.mjs`
**Type**: Modify
**Depends**: none
**Acceptance**:
- AC1/FR1/FR2: add `closingLinkObserved` and `requireClosingLinkage` exactly as specified in design.md Fix Strategy and call `requireClosingLinkage({ context, run, prNumber: current.number, head })` after `registeredGate` and before `writeSmokeDeliveryProof` in the merge-ready loop; an unobserved link returns a failed handoff with `reasonCode: 'closing_linkage_unobserved'`, summary `PR #P does not link issue #N; exact-head merge not attempted`, artifacts `[pr.url]`, and no merge command.
- AC2: when the live closing references contain `{ number: N, url: <same-repository issue URL> }`, the existing exact-head merge and `reconcilePostMerge` proof run unchanged.
- AC4: `reconcilePostMerge` uses `closingLinkObserved(pr, issue, issueData.url)` with an identical predicate; the already-MERGED paths never call `requireClosingLinkage`.
- The new code does not call `reconciliationFailure`, sleep, poll, or count observations.

### T002: Add Behavioral Regression Coverage

**File(s)**: `scripts/__tests__/sdlc-deliver.test.mjs`
**Type**: Modify
**Depends**: T001
**Acceptance**:
- Extend `fixture()` with a `closingReferences` option (default `[{ number: 42, url: issueUrl }]`) held in a mutable variable that the `gh pr view` mock returns as `closingIssuesReferences`, and expose `set closingReferences(value)` on the returned fixture object.
- AC1: `test.each` over `[]`, `[{ number: 42, url: 'https://github.test/other/repo/issues/42' }]`, and `[{ number: 41, url: 'https://github.test/owner/repo/issues/41' }]`: `runDeliver({ cwd: f.root, issue: 42, run: f.run })` returns `status: 1` with handoff `{ status: 'failed', reasonCode: 'closing_linkage_unobserved', summary: 'PR #77 does not link issue #42; exact-head merge not attempted' }`; `deliveryCalls(f, 'merge')` is empty; `f.pr.state` is `OPEN`; `f.issueState` is `OPEN`; `git branch --show-current` is `feature/42-delivery`; `git ls-remote origin refs/heads/feature/42-delivery` contains `f.currentHead`. These cases fail without T001.
- AC2: in the same test, set `f.closingReferences = [{ number: 42, url: 'https://github.test/owner/repo/issues/42' }]` and rerun ordinary delivery: `status: 0`, passed handoff, exactly one merge call containing `f.currentHead`, `f.issueState` is `CLOSED`, and the last `gh pr view` call before the merge call requests a `--json` field list containing `closingIssuesReferences`.
- AC4: a test delivers with linked references (passes, one merge), then sets `f.closingReferences = []` and reruns: `status: 1`, handoff `{ reasonCode: 'delivery_linkage_unproven', summary: 'Merged PR #77 does not link issue #42' }`, and the merge call count stays 1. The existing lost-acknowledgment test continues to pass unchanged.
- Evidence: from the repository root run `npm --prefix scripts test -- --runInBand __tests__/sdlc-deliver.test.mjs`, then the full `repository.tests` validation (`cd scripts && npm test`).

### T003: Direct The Deliver Worker On Unobserved Linkage

**File(s)**: `workflows/open-pr/WORKFLOW.md`, `workflows/open-pr/references/ci-monitoring.md`
**Type**: Modify
**Depends**: T001
**Acceptance**:
- AC3/FR3: add the paragraphs specified in design.md Changes for both files. The guidance treats `closing_linkage_unobserved` as non-terminal: wait for CI and the PR's other checks and processes to complete, re-observe live `closingIssuesReferences`, diagnose repository-specific causes, rerun ordinary delivery, with no numeric observation limit; forbid merging outside ordinary delivery, force-pushing, and handoff synthesis; when linkage cannot be established, keep the branch and PR, leave the delivery-written failed handoff, and report the exact gap.
- AC3 evidence: from the repository root, `node --input-type=module -e "import { workerPrompt } from './scripts/sdlc-execute.mjs'; const t = workerPrompt({ step: 'deliver', issue: 42 }); if (!t.includes('closing_linkage_unobserved') || !t.includes('No numeric observation limit')) process.exit(1); console.log('deliver worker prompt carries linkage guidance');"` exits 0; `node scripts/skill-inventory-audit.mjs --check` and `node scripts/verify-plugin-surface.mjs --root . --label repository` exit 0.

## Change History

| Issue | Date | Summary |
|-------|------|---------|
| #448 | 2026-10-06 | Initial defect tasks |
