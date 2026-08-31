# Root Cause Analysis: Resume exact-head delivery after authorized reconciliation

**Issue**: #333
**Date**: 2026-08-31
**Status**: Approved
**Author**: NMG
**Related Spec**: specs/293-persist-exact-head-delivery-cas-and-isolated-session-tokens/
---

## Root Cause

`scripts/sdlc-deliver.mjs` `runDeliverUnlocked` returns at the `namespace.runState.delivery?.status === 'reconciliation_required'` guard without reading GitHub or local git. `reconciliationFailure` then reuses the prior delivery object and writes `delivery_reconciliation_required` again.

That sticky status was added so unexpected PR/head identity cannot open another PR. The same module already authorizes a same-PR head advance while status is still `expected` (same PR number, `OPEN`, current issue branch, local `HEAD` equals PR head, clean tree ignoring `.omp/`). Those checks never run once status is `reconciliation_required`. Spreading the persisted delivery object on a later persist would also leave `status` as `reconciliation_required` unless it is explicitly set back to `expected`.

Trigger: controller delivery publishes a version commit that advances the already-persisted PR from H1 to H2, the first snapshot after that advance records reconciliation, and every later execute/deliver rerun exits before re-observation.

### Affected Code

| File | Lines / Symbols | Role |
|------|-----------------|------|
| `scripts/sdlc-deliver.mjs` | `runDeliverUnlocked` reconciliation_required early return | Unconditional sticky failure; must become fail-closed re-observation |
| `scripts/sdlc-deliver.mjs` | `reconciliationFailure`, `persistDelivery`, `expectedDelivery` | Reuses prior delivery when already reconciled; CAS writer that must set `status: expected` on authorized resume |
| `scripts/sdlc-deliver.mjs` | `pullRequestByNumber`, `parseChecksResult`, `parsePorcelain` | Existing PR-by-number view, required-check JSON parse (including none-required empty), and dirty-tree filter |
| `scripts/sdlc-deliver.mjs` | `scopedSnapshot` `cleanHeadAdvance` | In-run expected-status H1→H2 rebind; must not gain a required-check gate |
| `scripts/__tests__/sdlc-deliver.test.mjs` | `persists unexpected head changes as byte-stable reconciliation failures` and fixture `requiredChecks` / `noRequiredChecks` | Today asserts zero additional git/gh calls on rerun; unauthorized reruns may re-observe but must not rewrite delivery bytes or mutate PRs |

### Triggering Conditions

- `delivery.status` is already `reconciliation_required`.
- The same open PR now matches the clean local issue-branch HEAD.
- Required checks at that head are complete, pending, failed, missing, or unreadable.
- A later persist spreads the prior delivery object without setting `status: expected`.

---

## Fix Strategy

### Approach

Replace the unconditional early return with `authorizeReconciliationResume`. On false, call existing `reconciliationFailure(context, namespace, null)`. On true, fall through into the existing `try` body of `runDeliverUnlocked` so ordinary delivery continues in the same invocation.

`authorizeReconciliationResume` observes only the persisted PR number through `pullRequestByNumber`. It authorizes only when the current branch belongs to the issue, the tree is clean except `.omp/` paths, local HEAD equals the open PR head, `headRefName` equals that issue branch, and `requiredChecksComplete` is true. Authorized persist is one CAS write: `status: 'expected'`, `expectedHead` equal to that HEAD, `pullRequest` unchanged, `reconciliation: null`.

`requiredChecksComplete` reuses `parseChecksResult` on `gh pr checks --required`. Completeness is every returned state in `SUCCESS`, `NEUTRAL`, `SKIPPED`. Empty is complete only via the existing none-required stderr path inside `parseChecksResult`. Throws and any other state (including `PENDING`, `FAILURE`, unknown, missing JSON) are unauthorized. Do not poll. Do not call `classifyPrDeliveryState` for this gate.

Do not change `scopedSnapshot` `allowHeadAdvance` / `cleanHeadAdvance`. While `status` is `expected`, a clean same-PR head advance remains authorized without required checks.

### Changes

| File | Change | Rationale |
|------|--------|-----------|
| `scripts/sdlc-deliver.mjs` | Replace the sticky early return with fail-closed re-observation, CAS resume to `expected`, then ordinary delivery | Fixes the named defect without opening a follow-up PR |
| `scripts/__tests__/sdlc-deliver.test.mjs` | Add authorized resume (execute + isolated session), pending/failed/unknown/missing checks, identity mismatches, and update the zero-call rerun assertion | Proves AC1–AC2 and FR4; keeps expected-status H1→H2 free of the new check gate |

### Blast Radius

- **Direct impact**: `runDeliverUnlocked` entry when `delivery.status === 'reconciliation_required'`; `persistDelivery` payloads on that path; existing byte-stable reconciliation rerun test.
- **Indirect impact**: ordinary delivery after a successful resume (version sync, ready, poll, merge at H2). Unauthorized identity still uses `reconciliationFailure` unchanged.
- **Risk level**: Medium — recovery must stay fail-closed on identity, but must not block the in-run expected-status version-push rebind.

---

## Regression Risk

| Risk | Likelihood | Mitigation |
|------|------------|------------|
| Unauthorized identity now mutates expectedHead or reconciliation evidence | Med | Helper returns false without persist; `reconciliationFailure(..., null)` reuses prior bytes |
| Recovery calls `gh pr list` / create and selects a different PR | Low | Observe only `pullRequestByNumber`; tests forbid list/create/ready/push/merge on unauthorized and list/create on authorized |
| Pending checks are polled until green while still `reconciliation_required` | Med | Single `gh pr checks --required` fetch; no `sleep`; pending stays sticky |
| In-run expected-status H1→H2 starts requiring checks | High | Do not reuse the recovery helper from `scopedSnapshot`; add a regression that version-push rebind still proceeds with pending required checks |
| Isolated-session resume is omitted | Low | One authorized-resume test uses `--session-token` |

---

## Alternatives Considered

| Option | Description | Why Not Selected |
|--------|-------------|------------------|
| Fall through into the existing `authorizedAdvance` block | Same identity checks, no required-check gate | AC1 requires complete required checks before leaving `reconciliation_required`; the expected-status path must stay check-free |
| Call `classifyPrDeliveryState` as the recovery gate | Reuse full ordinary completeness including reviews/draft/mergeability | AC1 recovery names only required-check completeness; mergeability stays in ordinary delivery after CAS |
| Clear reconciliation without CAS-advancing expectedHead | Leave H1 expected and continue | Ordinary merge would still target H1 via `--match-head-commit` |

---

## Validation Checklist

Before moving to TASKS phase:

- [x] Root cause is identified with specific code references
- [x] Fix is minimal — no unrelated refactoring
- [x] Blast radius is assessed
- [x] Regression risks are documented with mitigations
- [x] Fix follows existing project patterns (per `structure.md`)
