# Verification Report: Reject steering snippet quota fields at writer boundaries

**Date**: 2026-08-28
**Issue**: #291
**Scope**: Follow-up AC4/FR5 initialize and migration writer remediation
**Implementation commit**: `da37ba3`

## Result

**Status**: Pass

The merged runtime quota removal is now enforced at every manifest/snippet writer boundary. Initialize and migration inputs containing `byteBound` or any other unknown snippet field fail with `steering_manifest_unknown_key` before a plan or upgrade report is returned. Rejected inputs and live steering files remain unchanged. Accepted records are canonicalized by explicit selection of `id`, `path`, `consumers`, `slot`, and `order`.

## Issue Scope

- Acceptance criteria: AC1, AC2, AC3, AC4
- Functional requirements: FR1, FR2, FR3, FR4, FR5
- Follow-up task: T005
- Regression scenario: SCN004
- Unchanged behavior: controller lease/worker lifecycle, prompt provenance, prompt structure, steering module/extension/validation handling, and historical quota supersession

## Writer Audit

| Writer | Main-branch gap | Follow-up behavior | Result |
|--------|-----------------|--------------------|--------|
| `createInitializePlan` | Removed only `content` and spread arbitrary remaining snippet fields into `manifest.snippets`. | Validates exact initialize input keys before constructing actions; canonical manifest records use explicit field selection. | Pass |
| `detectSteeringRuntime` migration | Spread preserved existing manifest snippets into the next manifest. | Canonicalizes every preserved snippet through the shared exact-key boundary before constructing a migration plan. | Pass |
| Other manifest/snippet writers | Repository audit found no other production writer of `manifest.snippets`. | Runtime readers and unrelated manifest sections remain unchanged. | Pass |

## AC4 / FR5 Evidence

| Requirement | Evidence | Result |
|-------------|----------|--------|
| Initialize rejects `byteBound` before output | `sdlc-steering-runtime.test.mjs` passes `byteBound` and an unrelated `extra` key, observes `steering_manifest_unknown_key`, no returned plan, unchanged input, unchanged steering directory, and no manifest/snippet output. | Pass |
| Migration rejects `byteBound` before output | `sdlc-upgrade.test.mjs` seeds an existing manifest with `byteBound`, observes `steering_manifest_unknown_key`, no returned upgrade report, byte-identical manifest and legacy file, no migrated snippet, and no runtime plan directory. | Pass |
| Accepted output is canonical | Existing initialize and migration success tests assert manifest snippets contain the canonical registration fields and preserve existing valid registrations. | Pass |
| No runtime quota path | Existing prompt and steering runtime suites continue to prove unbounded rendering, unknown-key rejection, structural validation, and provenance. | Pass |
| Unrelated steering validation | Full repository suite passed without changes to module, extension, validation, stale-plan, staged-apply, path, or symlink contracts. | Pass |

## Verification

| Command | Result |
|---------|--------|
| `cd scripts && npm test -- --runInBand __tests__/sdlc-steering-runtime.test.mjs __tests__/sdlc-upgrade.test.mjs __tests__/sdlc-prompt-snippets.test.mjs __tests__/rendered-prompt-contract.test.mjs` | Pass: 4 suites, 60 tests. |
| `node scripts/verify-current-specs.mjs` | Pass: 54 genuine issue specs, 16 required archive specs, 16 rewrite capabilities, 16 active workflow mappings, 1 deprecated stub. |
| `cd scripts && npm test -- --runInBand` | Pass: 49 suites passed, 1 skipped; 716 tests passed, 2 skipped. |
| `git diff --check` | Pass. |

## Required Reviews

| Review | Scope | Result |
|--------|-------|--------|
| Branch review | Three parallel scopes: source writers, regression tests, and issue/spec/public contracts. | Pass: 3/3 reviewers reported no actionable findings. |
| Literal-main review | Independent three-scope comparison against `main` at `dbbc813`. | Pass: 3/3 reviewers reported no actionable findings and confirmed the new tests fail on the main-branch bug. |

## Conclusion

AC4 and FR5 now form a clean end-to-end cutover: obsolete quota fields are rejected at initialize, migration, manifest-runtime, and prompt-fragment boundaries. No compatibility spread, strip, preserve, alias, or enforcement path remains. The follow-up is ready for pull-request delivery.
