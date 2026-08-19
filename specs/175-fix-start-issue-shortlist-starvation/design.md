# Root Cause Analysis: Fix Start-Issue Shortlist Starvation

**Issue**: #175
**Date**: 2026-08-15
**Status**: Approved
**Author**: Codex

---

## Root Cause

`skills/start-issue/references/milestone-selection.md` fixes the raw candidate query at `-L 10`, while `skills/start-issue/SKILL.md` applies dependency and deliverable filtering only after that fetch. The workflow never asks for the next page when the filtered set contains fewer than the four choices Step 2 can display.

The raw query also omits `projectItems`. An open coordination issue can therefore remain selectable after its lifecycle work is complete and its Project item is Done. Project state appears only after selection, too late to produce a useful automatic shortlist.

## Fix Strategy

Use a bounded increasing-limit loop because `gh issue list` exposes a limit but no caller-managed page cursor. Start at 10 and increase to 20, 30, and so on until four selectable candidates remain, the selected scope is exhausted, or 100 records have been inspected. Each larger fetch supersedes the prior result. Evaluate its ordered prefix from fresh evidence and stop after the fourth verified selectable issue; metadata fetched for unrelated trailing records is not consumed as candidate authority.

Fetch `projectItems` with candidate metadata. An issue is automatically completed only when at least one readable status exists and every readable status equals Done case-insensitively. Apply completion exclusion after readiness classification, count it separately, and keep explicit/manual starts available. If Project metadata cannot be read, retry without it and warn rather than turning optional board visibility into a hard dependency.

## Changes

| File | Change |
|------|--------|
| `skills/start-issue/references/milestone-selection.md` | Define bounds, Project predicate, fallback, and expansion loop. |
| `skills/start-issue/SKILL.md` | Integrate the loop, separate filter notes, and explicit reopen warning. |
| `scripts/__tests__/start-issue-selection-contract.test.mjs` | Pin the active contract and BDD mapping. |
| `scripts/__tests__/exercise-start-issue-backfill.test.mjs` | Forward-exercise a disposable PathCast-shaped queue with writes blocked. |
| `README.md`, `CHANGELOG.md` | Document user-visible behavior and the pending fix. |

## Regression Risks

| Risk | Mitigation |
|------|------------|
| Larger windows increase GitHub reads. | Stop at four selectable choices, expand by ten, and cap at 100. |
| A Done value in one of several projects hides active work. | Require every readable status to be Done; mixed statuses remain eligible. |
| Project permissions become mandatory. | Retry without `projectItems`, warn, and infer no completion. |
| Expanded data weakens relationship safety. | Require complete hydration and fail-closed classification for every issue in the evaluated prefix. |
| An unrelated malformed tail issue aborts an already-complete shortlist. | Fail closed through the fourth verified choice, then leave unnecessary trailing records uninspected. |
| Explicit recovery becomes impossible. | Restrict the Done filter to automatic discovery and warn at confirmation. |

## Alternatives Rejected

- Fetch all issues unconditionally: wastes reads and changes ordering over unnecessarily large graphs.
- Exclude every issue labeled `epic`: prevents legitimate first-time umbrella intake.
- Treat Project Done as issue closure: conflates workflow metadata with dependency completion.
- Patch the installed cache only: leaves source and future installations broken.
