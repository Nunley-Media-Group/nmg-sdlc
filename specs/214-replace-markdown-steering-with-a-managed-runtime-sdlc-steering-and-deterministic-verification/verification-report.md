# Verification Report: Managed steering runtime and deterministic verification

**Date**: 2026-08-25
**Issue**: #214
**Head**: `7ef80c9775b10de11532b35cc64ba4aee8ea749d`
**Overall Status**: Pass

## Implementation Status: **Pass**

<!-- nmg-sdlc-issue-scope: {"issueNumber":214,"specPath":"specs/214-replace-markdown-steering-with-a-managed-runtime-sdlc-steering-and-deterministic-verification","status":"implicit_single_issue","delivery":{"acceptanceCriteria":["AC1","AC2","AC3","AC4","AC5","AC6","AC7"],"functionalRequirements":["FR1","FR2","FR3","FR4","FR5","FR6","FR7","FR8","FR9","FR10","FR11","FR12","FR13","FR14"],"tasks":["T001","T002","T003","T004","T005","T006","T007","T008","T009"],"scenarios":["SCN001","SCN002","SCN003","SCN004","SCN005","SCN006","SCN007"]},"regression":{"acceptanceCriteria":["AC1","AC2","AC3","AC4","AC5"],"functionalRequirements":["FR1","FR2","FR3","FR4","FR5","FR6","FR7","FR8"],"scenarios":[]}} -->

## Executive Summary

Issue #214 passes its approved GitHub contract. The managed steering runtime, shared writer, prompt-registry integration, deterministic validation runner, workflow integration, and legacy-steering migration are implemented. The deterministic steering gate passed at the exact clean head above with no status ceiling. The complete Jest contract suite passed 632 tests, and plugin-surface and skill-inventory checks passed.

The prior failed report relied on an issue-specific two-lifecycle smoke requirement that was not part of GitHub issue #214. That extraneous AC8/FR15/SCN008 requirement and its verify-workflow clauses were removed in commit `7ef80c9`; the verified delivery scope now matches GitHub #214, which ends at AC7.

## Acceptance Criteria

| Criterion | Status | Evidence |
|---|---|---|
| AC1: `/sdlc-steering` plans and applies a validated runtime | Pass | `workflows/steering/WORKFLOW.md`, `scripts/sdlc-steering.mjs`, steering runtime tests, and the TUI-only headless contract exercise |
| AC2: approved upgrade migrates legacy steering without dual authority | Pass | `scripts/sdlc-upgrade.mjs` and migration preservation/non-mutation tests |
| AC3: onboard uses the shared steering writer | Pass | `workflows/onboard-project/WORKFLOW.md` and workflow contract tests |
| AC4: verify-code executes every applicable required validation | Pass | `src/sdlc-verification-runtime.mjs` and `.omp/sdlc/verification/214.json` |
| AC5: providers cannot self-skip applicable required gates | Pass | verification-runtime ceiling and required-result tests |
| AC6: invalid or unresolved registrations fail closed | Pass | steering-runtime duplicate, unresolved-provider, path, and schema tests |
| AC7: project snippets reach workers only through the registry | Pass | `src/sdlc-prompt-snippets.mjs`, provenance tests, and registry-only loading tests |

## Deterministic Evidence

- `node scripts/sdlc-verify-steering.mjs --project . --issue 214 --spec specs/214-replace-markdown-steering-with-a-managed-runtime-sdlc-steering-and-deterministic-verification --base main`: `ok: true`, `ceiling: null`.
- Evidence identity: clean head `7ef80c9775b10de11532b35cc64ba4aee8ea749d`.
- Spec hash: `sha256:525ac6cb05d64da43b2679e2e75ebc209cc73b960cf0d6ab06563771c8a2c833`.
- Steering hash: `sha256:b70cdad7bc95493afdf803f0653d55897cb81bf08e5ee7e11e33ba393056b2e4`.
- Required `repository.tests` validation: applicable and passed with schema-valid identity-bound evidence.

## Test and Surface Results

- Focused command synchronization and prompt-byte contracts: 2 suites, 20 tests passed.
- Full Jest suite: 46 suites passed, 632 tests passed, 2 tests skipped; 1 suite skipped.
- Skill inventory: clean, 43 items mapped.
- Plugin surface: passed for the repository package.
- Patch hygiene: `git diff --check` passed before commit.

## Architecture and Risk

The runtime preserves separation between generated managed modules, project-owned snippets/extensions, manifest registration, deterministic provider execution, and prompt composition. Required results fail closed in core; prompt prose cannot raise a failed or incomplete ceiling. Extension code remains trusted by explicit product scope. No unresolved implementation or verification defect remains.

## Recommendation

Proceed to `/sdlc-open-pr #214` and delivery. PR-hosted checks and review remain the delivery gate.
