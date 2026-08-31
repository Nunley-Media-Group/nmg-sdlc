# Root Cause Analysis: Fix final-head evidence hang on workflow-qualified check names

**Issue**: #336
**Date**: 2026-08-31
**Status**: Approved
**Author**: NMG
**Related Spec**: specs/319-remediate-failing-hosted-checks-that-are-not-branch-protected/

---

## Root Cause

`scripts/sdlc-deliver.mjs` `evidenceForHead` selects hosted evidence with `candidate.name === item.name` and success-equivalent state. Verification records GitHub UI-style identities such as `Python CI / verify`. `fetchSnapshot` loads `gh pr checks --json name,state,bucket,link,event` and `normalizeCheck` copies only `name`, so GitHub's job name stays `verify`. Successful H2 checks never match. The H2 loop `while (!finalEvidence) { sleep(POLL_INTERVAL_MS); ... }` treats that miss as not-yet-observed and polls with no identity-mismatch exit.

`scripts/verification-readiness.mjs` `evidenceIdentity` and marker validation treat `name` as an opaque string and do not reconstruct workflow+job. `scripts/pr-delivery-state.mjs` compares declared PR-only names with `observedPrCheckNames.has(declaredName)` on raw GitHub names. Issue #319 taught the snapshot to include unfiltered checks; it did not change identity matching. Issue #284 enriches empty `event` from the Actions run; it does not add `workflow`.

Live reproduction: nmg-sdlc-smoke issue #35, PR #37, head `97e1daa`, both required checks `SUCCESS` `pull_request` on that head.

### Affected Code

| File | Role |
|------|------|
| `scripts/sdlc-deliver.mjs` | `evidenceForHead` exact name match; `normalizeCheck` drops workflow; `fetchSnapshot` omits `workflow` from `--json`; H2 loop waits on any miss. |
| `scripts/verification-readiness.mjs` | `evidenceIdentity` / marker `name` field; no canonical matcher. |
| `scripts/pr-delivery-state.mjs` | Declared-name presence uses raw `check.name`. |
| `scripts/__tests__/sdlc-deliver.test.mjs` | Fixtures declare `contract-tests` equal to GitHub `name`; no qualified-vs-bare case. |

### Triggering Conditions

- Verification `pendingEvidence` / `evidence` `name` is `workflow + " / " + job`.
- `gh pr checks` JSON `name` is the bare job and `workflow` is a distinct field (currently unrequested).
- H2 checks are already `SUCCESS` `pull_request` with URLs.

These were not caught because controlled-draft fixtures use identical declaration and GitHub names (`contract-tests`).

---

## Fix Strategy

### Approach

Add `canonicalCheckName` and `resolveDeclaredCheck` in `scripts/verification-readiness.mjs`. Canonical identity is `${trimmedWorkflow} / ${trimmedJob}` when workflow is non-empty, otherwise the unique bare job name. Matching uses equality of that identity or unique-bare job equality. No suffix matching. Keep marker `schemaVersion` 1 and do not add a `workflow` field; store the canonical string in `name`.

Request `workflow` on every `gh pr checks` JSON list in `sdlc-deliver.mjs`. Preserve GitHub job `name` on the check object; attach `workflow`. Use canonical names in snapshot uniqueness keys and declared-name observation. `evidenceForHead` waits only on `pending`; `mismatch` throws into existing `verification_not_ready`.

Verifier production documents the same `canonicalCheckName` rule. Delivery-validation markers continue to copy `evidenceIdentity(item)` from the declaration.

### Steering Alignment

Fail-closed GitHub evidence, exact-head binding, and `scripts/sdlc-deliver.mjs` as delivery supervisor remain. Bug → patch version bump.

### Changes

| File | Change | Rationale |
|------|--------|-----------|
| `scripts/verification-readiness.mjs` | Export `CHECK_IDENTITY_SEPARATOR`, `canonicalCheckName`, `resolveDeclaredCheck`. | One matcher for every consumer. |
| `scripts/sdlc-deliver.mjs` | JSON `...,workflow`; `normalizeCheck.workflow`; canonical snapshot keys; `evidenceForHead` uses resolver. | Stops the hang. |
| `scripts/pr-delivery-state.mjs` | Declared observation and duplicate keys use canonical identity. | Same identity in hosted snapshots. |
| `workflows/verify-code/references/report-format.md`, `references/pr-dependent-verification.md` | Producer records canonical `name` from `name`+`workflow`. Read `skill://skill-creator` first. | FR1 verifier production. |
| Jest files listed in tasks.md | AC1–AC6 regressions; update `--json` argv assertions. | Lock behavior. |

### Blast Radius

- **Direct impact**: check identity matching and `gh pr checks` argv.
- **Indirect impact**: any PR whose job names collide across workflows now fail closed unless declarations are workflow-qualified.
- **Risk level**: Medium — existing exact-name fixtures must keep passing (AC6).

---

## Regression Risk

| Risk | Likelihood | Mitigation |
|------|------------|------------|
| Exact-name `contract-tests` path breaks if workflow is required | High | Unique-bare match when job name is unique; AC3/AC6 |
| Suffix matching reintroduced as `endsWith(' / ' + job)` | Med | Explicit test that `verify` does not match `Python CI / verify` via suffix; FR3 |
| Terminal mismatch still polls | Med | `mismatch` throws; AC4 asserts fail closed |
| #319 unfiltered failing checks or #284 event enrichment regress | Low | Keep those tests in the focused run |

---

## Alternatives Considered

| Option | Description | Why Not Selected |
|--------|-------------|------------------|
| Add `workflow` to readiness/delivery markers and bump `schemaVersion` | Explicit structured identity | Issue out of scope; existing consumers require schema 1 exact keys |
| Suffix-match ` / ${job}` | Cheap UI-string parse | Forbidden; collides across workflows |
| Wall-clock H2 deadline | Stop the hang by timeout | Does not fix identity; issue out of scope |

---

## Validation Checklist

- [x] Root cause is identified with specific code references
- [x] Fix is minimal — no unrelated refactoring
- [x] Blast radius is assessed
- [x] Regression risks are documented with mitigations
- [x] Fix follows existing project patterns (per `structure.md`)

## Change History

| Issue | Date | Summary |
|-------|------|---------|
| #336 | 2026-08-31 | Initial defect report |
