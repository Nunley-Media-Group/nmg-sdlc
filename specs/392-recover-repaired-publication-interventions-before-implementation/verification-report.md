# Verification Report: Recover repaired publication interventions before implementation

**Issue**: #392
**Date**: 2026-09-14
**Status**: Passed
**Spec**: `specs/392-recover-repaired-publication-interventions-before-implementation/`

## Acceptance Results

| Criterion | Result | Evidence |
|---|---|---|
| AC1 | Pass | Exact PathCast-derived 18/12/6 fixture discovers one `repaired_publication_intervention` for issue 108 and implement only. |
| AC2 | Pass | One separator-preserving detector/projection proves four label-only rewrites and preserves pure CR, LF, CRLF, mixed separators, invalid-byte views, and all unrelated bytes. |
| AC3 | Pass | Full ignored status uses `--ignored=matching --untracked-files=all`; exact tracked-writable and untracked-evidence paths are checked separately. Arbitrary ignored source/product/controller/allowed/evidence, partial/extra/symlink/ignored goal-ledger entries, and unsafe handoffs block. Explicit dependency/cache/build classes remain admissible at bounded root/workspace locations. |
| AC4 | Pass | Under-lease classification re-reads the persisted checkpoint, requires the discovered issue/step tuple, repeats the full classifier, archives the failed handoff byte-identically, consumes both durable records, and starts only `s108-implement`. The controlled boundary leaves `runState.remediation` absent and dispatches no later step. |
| AC5 | Pass | Adversarial coverage rejects changed product/spec/task bytes, staging, identity/owner/head drift, malformed/oversized/nonregular/symlink handoffs and parents, claimed output, prior records, complete owners, arbitrary/ignored evidence, and discovery-to-lease checkpoint races without controller dispatch. |
| AC6 | Pass | Focused execute/safe/upgrade suites and the full repository suite pass; command rendering, public docs, changelog, versions, inventory, current specs, plugin surface, contribution gate, and whitespace validation are synchronized. |

## Commands and Outcomes

- Focused execute/safe/upgrade: 3 suites, 533 tests passed.
- Focused repaired-publication/adversarial execute selection: 30 tests passed; 295 unrelated tests skipped by name filter.
- Publication separator/projection selection: 5 tests passed; 90 unrelated tests skipped by name filter.
- Full Jest: 55 suites passed, 1 suite skipped; 1,338 tests passed and 2 skipped (1,340 total).
- Command synchronization: 2 suites, 10 tests passed.
- Contribution contracts: 2 suites, 35 tests passed.
- `node scripts/verify-plugin-surface.mjs --root . --label repository` — passed.
- `node scripts/verify-current-specs.mjs` — passed: 80 genuine issue specs, 16 required archive specs, 16 rewrite capabilities, 16 active workflow mappings, 1 deprecated stub.
- `node scripts/skill-inventory-audit.mjs --check` — passed: 43 items mapped.
- VERSION/package comparison — passed at `3.21.3`; no version bump.
- Changed JavaScript syntax and `git diff --check` — passed.

## PathCast Exercise

Read-only discovery against the retained PathCast checkout at head `b43c5a0da8551a80d41f48df8758d657edfb5a33` correctly remained blocked with `implementation_paths_dirty`: the exact allowed untracked evidence file `api/.artifacts/miledar-ip-guardrails/evidence.json` is present under an ignore rule and therefore cannot be treated as irrelevant cache state.

A disposable local clone retained the actual issue-108 branch, HEAD, repaired task bytes, controller checkpoint/handoff/owner state, and exact terminal `.pi-glla` trio, while excluding the blocked ignored implementation evidence. Read-only discovery returned the issue-108 implement recovery with four publication rewrites. Controlled bare run started only `s108-implement`, returned at the controlled boundary, created no remediation state, and stored matching archive/checkpoint SHA-256 `35ee48b559a6be0ce6309af04eaf665c91234b7c298b2f4e478bdb5639b89863`. The disposable clone was removed after observation; the retained PathCast checkout was not mutated.

## Archive Contract

Before the primary handoff can be replaced by standard worker output, the controller re-reads it through the same bounded no-follow identity contract and writes it exclusively to:

`.omp/sdlc/history/repaired-publication/{issue}-implement-{sha256}.json`

The archive is mode `0444`, collision-safe, byte-compared after creation, and referenced as `{ path, digest }` by both the safe-recovery record and the run checkpoint recovery source. A mismatching pre-existing archive, pathname identity drift, unsafe parent, or failed archive write stops before consumption or dispatch.

## Residual Risk

The filesystem lease is cooperative: unrelated processes that ignore controller ownership can still race repository state after validation. The mutation boundary minimizes that window by re-reading the checkpoint and repeating the complete classifier under lease; handoff archival adds a second no-follow identity comparison before consumption. Existing ignored implementation evidence in the retained PathCast checkout remains an intentional blocker until its owner durably preserves or removes it outside this change.
