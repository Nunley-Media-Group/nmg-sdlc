# Verification Report: Recover repaired publication interventions before implementation

**Issue**: #392
**Date**: 2026-09-14
**Status**: Passed
**Spec**: `specs/392-recover-repaired-publication-interventions-before-implementation/`

## Acceptance Results

| Criterion | Result | Evidence |
|---|---|---|
| AC1 | Pass | Exact PathCast-derived 18/12/6 fixture discovers one `repaired_publication_intervention` for issue 108 and implement only. Every existing controller handoff is scanned independently of Git ignore reporting and admitted only from checkpoint queue/completed/current/failed lifecycle slots or bounded owner-proven historical prefixes, with matching no-follow payload identity. |
| AC2 | Pass | One separator-preserving detector/projection proves four label-only rewrites and preserves pure CR, LF, CRLF, mixed separators, invalid-byte views, and all unrelated bytes. |
| AC3 | Pass | Full ignored status uses `--ignored=matching --untracked-files=all`; exact tracked-writable and untracked-evidence paths are checked separately. `.DS_Store` is decided before cache/worktree/platform exemptions and admitted only at the repository root, a tracked-writable/read-only scope-derived manifest workspace root, or that workspace's exact `android`/`ios` root. `.omp`, `.pi-glla`, `specs`, evidence-only roots, exact `scratch/.DS_Store`, fake-manifest, missing/non-directory workspace, `.cache`, dependency-cache, `__pycache__`, worktree, source, spec, controller, allowed, read-only and evidence descendants block. |
| AC4 | Pass | Under-lease classification re-reads the persisted checkpoint, requires the discovered issue/step tuple, repeats the full classifier, archives the failed handoff byte-identically, consumes both durable records, and starts only `s108-implement`. The controlled boundary leaves `runState.remediation` absent and dispatches no later step. |
| AC5 | Pass | Adversarial coverage rejects changed product/spec/task bytes, staging, identity/owner/head drift, malformed/oversized/nonregular/symlink handoffs and parents, unrelated `999-implement.json` even when runtime ignore status is absent, duplicate attempts, future or failed-state-unreachable steps, malformed owner steps, mismatched issue/step payloads, claimed output, prior records, complete owners, arbitrary/ignored evidence, fake workspaces, missing/non-directory workspace components, cache-buried `.DS_Store`, and discovery-to-lease checkpoint races without controller dispatch. |
| AC6 | Pass | Focused execute/safe/upgrade suites and the full repository suite pass; command rendering, public docs, changelog, versions, inventory, current specs, plugin surface, contribution gate, and whitespace validation are synchronized. Base-to-head declaration validation accepts all 15 paths, including `scripts/sdlc-safe-recoveries.mjs` and the delivery-owner verification report, with no undeclared path. |

## Commands and Outcomes

- Focused execute/safe/upgrade: 3 suites, 560 tests passed.
- Focused repaired-publication, ignored-state, `.DS_Store`, workspace-boundary, and lifecycle-handoff selection: 67 tests passed; 285 unrelated tests skipped by name filter.
- Full Jest: 55 suites passed, 1 suite skipped; 1,365 tests passed and 2 skipped (1,367 total).
- Command synchronization: 2 suites, 22 tests passed.
- Contribution contracts: 2 suites, 35 tests passed.
- Base-to-head declaration validation: `{"ok":true,"errors":[]}` across 15 changed paths.
- `node scripts/verify-plugin-surface.mjs --root . --label repository` — passed.
- `node scripts/verify-current-specs.mjs` — passed: 80 genuine issue specs, 16 required archive specs, 16 rewrite capabilities, 16 active workflow mappings, 1 deprecated stub.
- `node scripts/skill-inventory-audit.mjs --check` — passed: 43 items mapped.
- VERSION/package comparison — passed at `3.21.3`; no version bump.
- Changed JavaScript syntax and `git diff --check` — passed.

## PathCast Exercise

Read-only discovery against the retained PathCast checkout at head `b43c5a0da8551a80d41f48df8758d657edfb5a33` correctly remained blocked with `implementation_paths_dirty`: the exact allowed untracked evidence file `api/.artifacts/miledar-ip-guardrails/evidence.json` is present under an ignore rule and therefore cannot be treated as irrelevant cache state. The retained checkout was not mutated.

A disposable local clone retained the actual issue-108 branch, HEAD, repaired task bytes, controller checkpoint/handoff/owner state, exact terminal `.pi-glla` trio, and all eight legitimate historical/current handoffs (`107-start` through `107-fix2`, `108-start`, and `108-implement`), while excluding the blocked ignored implementation evidence. Read-only discovery returned the issue-108 implement recovery with four publication rewrites. Controlled bare run started only `s108-implement`, returned at the controlled boundary, created no remediation state, consumed exactly one safe-recovery record and one checkpoint recovery, and stored matching archive/checkpoint SHA-256 `35ee48b559a6be0ce6309af04eaf665c91234b7c298b2f4e478bdb5639b89863`. The disposable clone and throwaway probe were removed after observation.

## Archive Contract

Before the primary handoff can be replaced by standard worker output, the controller re-reads it through the same bounded no-follow identity contract and writes it exclusively to:

`.omp/sdlc/history/repaired-publication/{issue}-implement-{sha256}.json`

The archive is mode `0444`, collision-safe, byte-compared after creation, and referenced as `{ path, digest }` by both the safe-recovery record and the run checkpoint recovery source. A mismatching pre-existing archive, pathname identity drift, unsafe parent, or failed archive write stops before consumption or dispatch.

## Residual Risk

The filesystem lease is cooperative: unrelated processes that ignore controller ownership can still race repository state after validation. The mutation boundary minimizes that window by re-reading the checkpoint and repeating the complete classifier under lease; handoff archival adds a second no-follow identity comparison before consumption. Existing ignored implementation evidence in the retained PathCast checkout remains the sole observed blocker under the ordered classifier until its owner durably preserves or removes it outside this change.
