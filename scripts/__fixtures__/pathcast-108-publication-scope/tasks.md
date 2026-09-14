# Tasks: Establish claim-specific IP and product-safety guardrails

**Issue**: #108
**Date**: 2026-09-12
**Status**: Approved
**Author**: Rich Nunley

---

Official blockers: #124 CLOSED, #123 CLOSED, #122 CLOSED. These completed prerequisites are consumed as merged evidence and are not reopened.
Closed writable set for this package:
- `api/src/services/ip-guardrails/types.ts`
- `api/src/services/ip-guardrails/semantic.ts`
- `api/src/services/ip-guardrails/service.ts`
- `api/src/scripts/reconcile-miledar-ip-guardrails.ts`
- `api/src/scripts/capture-miledar-ip-evidence.ts`
- `api/package.json`
- `api/src/__tests__/unit/ip-guardrails/reconciliation.test.ts`
- `api/src/__tests__/features/miledar_ip_guardrails.feature`
- `docs/release/miledar-ip-product-safety.md`
- `docs/release/miledar-ip-guardrails.json`
- `api/src/__tests__/steps/miledar_ip_guardrails.steps.ts`
- `.github/workflows/miledar-ip-guardrails.yml`
No task may modify a path outside this set, another issue's specification, unrelated production API/Flutter/schema/controller/screen files, any workflow other than `.github/workflows/miledar-ip-guardrails.yml`, `api/src/index.ts`, `api/src/controllers/*.controller.ts`, `mobile/lib/riverpod`, `mobile/lib/controllers/route_map_controller.dart`, or the existing core screens. A defect discovered outside this set blocks #108 and requires an explicit specification amendment.

## Phase 1: Reconciliation Contract

### T001: Inventory exact merged guardrail deliverables

**Read-only**: `docs/release/miledar-ip-guardrails.schema.json`, `docs/release/miledar-ip-guardrails.json`, `api/src/__tests__/features/miledar_api_guardrails.feature`, `mobile/test/features/miledar_flutter_guardrails.feature`, `.github/workflows/miledar-ip-guardrails.yml`, bounded read-only scan of `api/src/services/ip-guardrails/`
**File(s)**: `api/src/services/ip-guardrails/types.ts` (Modify), `api/src/services/ip-guardrails/semantic.ts` (Modify), `api/src/services/ip-guardrails/service.ts` (Modify), `api/src/__tests__/unit/ip-guardrails/reconciliation.test.ts` (Create), `docs/release/miledar-ip-product-safety.md` (Modify)
**Type**: Create / Modify
**Depends**: Completed issues #122, #123, #124

**Acceptance**:
- [ ] Exact merged revisions and owned artifact paths for CLOSED #122/#123/#124 are accounted for.
- [ ] Missing, duplicate, sibling-substituted, or untraceable inputs fail visibly.
- [ ] Historical aggregate and issue-scope metadata is not accepted as executable authority.

- [ ] `types.ts`, `semantic.ts`, and `service.ts` define and test typed merged-input, hosted-check, live-ruleset, local-evidence, `pending-blocking`, and fixed-digest fields before the final candidate is created; T004 supplies observations to this prebuilt validator rather than adding new validation logic.
### T002: Bind every issue outcome bidirectionally

**Read-only**: `docs/release/miledar-ip-guardrails.schema.json`, `api/src/__tests__/features/miledar_api_guardrails.feature`, `mobile/test/features/miledar_flutter_guardrails.feature`
**Type**: Create / Modify / Test
**File(s)**: `api/src/services/ip-guardrails/types.ts` (Modify), `api/src/services/ip-guardrails/semantic.ts` (Modify), `api/src/services/ip-guardrails/service.ts` (Modify), `api/src/scripts/capture-miledar-ip-evidence.ts` (Create), `api/src/scripts/reconcile-miledar-ip-guardrails.ts` (Create), `api/package.json` (Modify), `.github/workflows/miledar-ip-guardrails.yml` (Modify), `docs/release/miledar-ip-guardrails.json` (Modify), `api/src/__tests__/unit/ip-guardrails/reconciliation.test.ts` (Modify)
**Depends**: T001

**Acceptance**:
- [ ] AC1-AC14, SCN001-SCN014, stable guardrail IDs, governed paths, and verification anchors resolve in both directions.
- [ ] Existing #122/#123/#124 records remain append-only; corrections and supersessions use linked records.
- [ ] Orphaned IDs, inactive verification, stale review state, and contradictory evidence fail closed.
- [ ] #108 appends exactly three active verification records—`VER-108-MERGED-INPUTS`, `VER-108-CROSS-LAYER-BDD`, and `VER-108-EXACT-EVIDENCE`—using the existing register schema. Each record has an owner, governed paths, exact test/scenario anchor, prerequisite IDs, evidence kind, and activation status; prior records are not rewritten.
- [ ] `api/package.json` registers `capture:ip-guardrails` and `reconcile:ip-guardrails`. The capture CLI accepts an explicit final candidate/repository/output-directory, performs authenticated merged-PR/check-suite/job/ruleset reads, downloads and bounds the exact workflow artifact member to `api/.artifacts/miledar-ip-guardrails/evidence.json`, and writes `merged-inputs.json`, `hosted-check.json`, and `live-ruleset.json`. The reconcile CLI accepts only explicit local file arguments, invokes the prebuilt service, and writes bounded stable JSON without shell interpretation.
- [ ] `.github/workflows/miledar-ip-guardrails.yml` runs the issue-owned API BDD/`reconciliation.test.ts` at the candidate, generates the fixed-path release artifact from that same checkout, and exposes aggregate/API/Flutter check identities consumed by the capture CLI.
- [ ] Out-of-set production paths are recorded as blockers, not as implied repair targets.

## Phase 2: Executable Acceptance

### T003: Implement cross-layer guardrail BDD

**Read-only**: `docs/release/miledar-ip-guardrails.json`, `docs/release/miledar-ip-guardrails.schema.json`, `api/src/__tests__/features/miledar_api_guardrails.feature`, `mobile/test/features/miledar_flutter_guardrails.feature`, bounded read-only scan of `api/src/services/ip-guardrails/`
**File(s)**: `api/src/__tests__/features/miledar_ip_guardrails.feature` (Create), `api/src/__tests__/steps/miledar_ip_guardrails.steps.ts` (Create)
**Type**: Create
**Depends**: T002

**Acceptance**:
- [ ] Fourteen deterministic scenarios map one-to-one to AC1-AC14 and retain every observable AC clause.
- [ ] Steps exercise real guardrail services and existing registered API/Flutter outcomes without credentials or network access.
- [ ] Product boundaries, exact child inputs, evidence kinds, fail-closed behavior, closed-set repair bounding, and #108-only completion are observable.
- [ ] Local fixtures are typed `kind=local` and cannot satisfy hosted or live assertions.

## Phase 3: Exact-Revision Completion Evidence

### T004: Reconcile exact revision and live enforcement

**Acquire**: `npm run capture:ip-guardrails -- --candidate "$CANDIDATE_SHA" --repo "$GITHUB_REPOSITORY" --output-dir artifacts/issue-108 --workflow-evidence api/.artifacts/miledar-ip-guardrails/evidence.json`
**Execute local evidence**: run `npm test` from `api/` for the issue-owned API/BDD files and run the registered `$test-flutter` flow for `mobile/test/features/miledar_flutter_guardrails.feature`; write exact command, working directory, candidate SHA, exit code, and counts to `artifacts/issue-108/local-results.json`
**Reconcile**: run `npm run reconcile:ip-guardrails -- --candidate "$CANDIDATE_SHA" --workflow-evidence api/.artifacts/miledar-ip-guardrails/evidence.json --local-results artifacts/issue-108/local-results.json --merged-inputs artifacts/issue-108/merged-inputs.json --hosted-check artifacts/issue-108/hosted-check.json --live-ruleset artifacts/issue-108/live-ruleset.json --output artifacts/issue-108/reconciliation.json`
**File(s)**: `api/.artifacts/miledar-ip-guardrails/evidence.json` (Download untracked), `artifacts/issue-108/merged-inputs.json` (Generate untracked), `artifacts/issue-108/hosted-check.json` (Generate untracked), `artifacts/issue-108/live-ruleset.json` (Generate untracked), `artifacts/issue-108/local-results.json` (Generate untracked), `artifacts/issue-108/reconciliation.json` (Generate untracked)
**Type**: Generate / Create / Verify
**Depends**: T001, T002, T003

T004 runs only after T001, T002, and T003 are committed at final `candidateRevision` and its workflow completes. T004 downloads/generates only untracked bounded evidence and never modifies a tracked file or digest input.

**Acceptance**:
- [ ] `hosted-check.json` contains candidate-matching aggregate, API, and Flutter check/job identities, URLs, conclusions, and scope disposition; API is required, and Flutter may be `legitimately-skipped` only when validated workflow scope excludes mobile paths and the exact-candidate local Flutter result passes.
- [ ] Contract, changed-path, release, API, Flutter, workflow, required-check, ruleset, and digest evidence agree at one exact `candidateRevision`.
- [ ] The downloaded `api/.artifacts/miledar-ip-guardrails/evidence.json` contains contract, changed-path, release, and fixed-framing digest results for `candidateRevision`; `local-results.json` contains exact-candidate API and Flutter results.
- [ ] The updated guardrail service validates the captured inputs and writes typed local, hosted, live, merged-input, digest, and `pending-blocking` fields to `artifacts/issue-108/reconciliation.json`.
- [ ] When the output path is valid, the reconcile CLI writes a typed result even when semantic validation fails, with sorted `pending-blocking` findings and nonzero exit status. Invalid/unwritable output paths fail on stderr and remain blocking external evidence.
- [ ] Every AC11 result targets the one final tracked `candidateRevision`; T004 performs no post-candidate tracked mutation.
- [ ] Local evidence is never substituted for hosted check or live ruleset evidence; `kind=local` payloads are invalid in hosted/live fields.
- [ ] Merged-input identities are re-read during T004 and must still name the closing merged PRs; every required `hostedChecks.*.completedAt` must be at or after `candidateRevision`'s commit time; `liveRuleset.retrievedAt` must be within 24 hours of the T004 run and after the aggregate hosted check; all timestamps are UTC. Any violation is `pending-blocking`.
- [ ] Missing, failed, stale, contradictory, unavailable, or untraceable facts are stored as typed `pending-blocking` entries in `artifacts/issue-108/reconciliation.json`, name the exact blocker, and leave downstream issues blocked.

## Traceability

| AC | Scenario | Tasks |
|----|----------|-------|
| AC1 | SCN001 | T001-T004 |
| AC2 | SCN002 | T002-T004 |
| AC3 | SCN003 | T002-T004 |
| AC4 | SCN004 | T002-T004 |
| AC5 | SCN005 | T002-T004 |
| AC6 | SCN006 | T002-T004 |
| AC7 | SCN007 | T002-T004 |
| AC8 | SCN008 | T002-T004 |
| AC9 | SCN009 | T001-T004 |
| AC10 | SCN010 | T002-T004 |
| AC11 | SCN011 | T001-T004 |
| AC12 | SCN012 | T002-T004 |
| AC13 | SCN013 | T001-T004 |
| AC14 | SCN014 | T004 |

## Legacy Evidence Mapping

| Legacy requirement | Current requirement | Current task evidence |
|--------------------|---------------------|-----------------------|
| AC33 / FR41 / SCN033 | AC1 / FR1 / SCN001 | T001-T004 |
| AC34 / FR42 / SCN034 | AC2 / FR2 / SCN002 | T002-T004 |
| AC35 / FR43 / SCN035 | AC3 / FR3 / SCN003 | T002-T004 |
| AC36 / FR44 / SCN036 | AC4 / FR3 / SCN004 | T002-T004 |
| AC37 / FR45 / SCN037 | AC5 / FR3 / SCN005 | T002-T004 |
| AC38 / FR46 / SCN038 | AC6 / FR4 / SCN006 | T002-T004 |
| AC39 / FR47 / SCN039 | AC7 / FR5 / SCN007 | T002-T004 |
| AC40 / FR48 / SCN040 | AC8 / FR8 / SCN008 | T002-T004 |

## Functional Requirement Traceability

| FR | Scenarios | Tasks |
|----|-----------|-------|
| FR1 | SCN001, SCN007, SCN009 | T001-T004 |
| FR2 | SCN002, SCN008 | T002-T004 |
| FR3 | SCN003-SCN005 | T002-T004 |
| FR4 | SCN006 | T002-T004 |
| FR5 | SCN007 | T002-T004 |
| FR6 | SCN001, SCN009-SCN010 | T001-T004 |
| FR7 | SCN008, SCN013-SCN014 | T002-T004 |
| FR8 | SCN002-SCN005, SCN008, SCN012 | T002-T004 |
| FR9 | SCN009 | T001-T004 |
| FR10 | SCN010 | T002-T004 |
| FR11 | SCN011 | T001-T004 |
| FR12 | SCN012-SCN014 | T002-T004 |
