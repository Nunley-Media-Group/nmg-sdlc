# Root Cause Analysis: Route remediable failed verification into rN-verify

**Issue**: #354
**Date**: 2026-09-02
**Status**: Approved
**Author**: NMG
**Related Spec**: specs/259-add-controller-owned-fresh-session-remediation-loops/
---

## Root Cause

`#259` already treats `verify` as remediable. `isRemediableFailedHandoff({ step, state, handoff })` in `scripts/sdlc-execute.mjs` returns true only for `REMEDIABLE_STEPS` (`implement`, `review1`, `fix1`, `review2`, `fix2`, `verify`, `deliver`), idle/done state, `handoff.status === 'failed'`, `handoff.intervention === false`, and `handoff.step === step`. Intervention true is an explicit keep-open stop.

The verify worker must not write the handoff. `scripts/sdlc-finalize-verification.mjs` `handoff()` always sets `intervention: status !== 'passed'`. `fail()` always writes `status: 'failed'`, so every non-pass is intervention. The non-ready branch is:

```js
if (!['pass', 'pr_evidence_pending', 'pr_evidence_satisfied'].includes(readiness.status)) {
  return fail('verification_not_ready', `Verification is not ready for #${issueNumber}: ${readiness.reasonCode}`);
}
```

`inspectVerificationReadiness` maps Implementation Status Partial, Incomplete, and Fail to the same result: `status: 'blocked'`, `reasonCode: 'implementation_non_pass'`, with `implementationStatus` `'partial' | 'incomplete' | 'fail'`. Fail and Partial are remediable implementation non-pass; Incomplete is a controller/evidence ceiling and must stay intervention. The finalizer currently cannot tell them apart because it ignores `implementationStatus` and forces intervention from `status !== 'passed'`.

Observed 2026-09-02 on nmg-sdlc `3.20.4` executing pennyscan `#132`: verify wrote `verification_not_ready` / `implementation_non_pass`, closed `s132-verify`, exited 1, no rem worker.

### Affected Code

| File | Lines | Role |
|------|-------|------|
| `scripts/sdlc-finalize-verification.mjs` | `handoff()` (~32–43), `fail()` (~63), non-ready branch (~80–82) | Writes every non-pass verify handoff as intervention |
| `scripts/verification-readiness.mjs` | `inspectVerificationReadiness` (~297–299) | Collapses Partial/Incomplete/Fail to `blocked` / `implementation_non_pass` while preserving `implementationStatus` |
| `scripts/sdlc-execute.mjs` | `isRemediableFailedHandoff` (~818–824), rem paths | Already remediates failed non-intervention verify; do not change the predicate |
| `workflows/verify-code/WORKFLOW.md` | description; Finalize Verification close | Documents “otherwise failed intervention” / “Controller failure remains an intervention” |

### Triggering Conditions

- Verify-code wrote a canonical Implementation Status Fail or Partial report under `specs/<N>-<slug>/verification-report.md`.
- `inspectVerificationReadiness` returned `blocked` / `implementation_non_pass`.
- Finalizer wrote `.omp/sdlc/handoffs/<N>-verify.json` with `intervention: true`.
- Execute therefore called keep-open/stop instead of `beginRemediation` / `r<N>-verify`.
- Existing rem fixtures never used this finalizer-produced intervention shape, so the gate mismatch was untested.

---

## Fix Strategy

### Approach

Keep readiness classification unchanged. In `finalizeVerificationUnlocked`, when the report is not pass / pr_evidence_pending / pr_evidence_satisfied, branch on the existing readiness object:

- Remediable: `readiness.status === 'blocked'` **and** `readiness.reasonCode === 'implementation_non_pass'` **and** `readiness.implementationStatus` is `'fail'` or `'partial'`.
- Write `status: 'failed'`, `step: 'verify'`, `intervention: false`, `reasonCode: 'verification_not_ready'`, keep the current summary `Verification is not ready for #<N>: ${readiness.reasonCode}`, `next: null`, `artifacts: ['specs/<N>-<slug>/verification-report.md']` using the same `reportPath` already computed. Do not commit or push that non-pass report (fail still happens before the git publish block).
- All other non-ready outcomes keep today’s intervention true failed handoff: Incomplete (`implementationStatus === 'incomplete'`), unverifiable (`report_too_large`, missing/ambiguous status, `scope_evidence_invalid`, `readiness_evidence_invalid`, …), `verification_report_invalid`, `verification_publish_failed`. Empty `artifacts` and `next: null` stay as today for those paths.
- Lease hold in `finalizeVerification` stays a no-handoff `status: 1` with stderr `controller_lease_held` (or the thrown `reasonCode`). Execute already treats missing/invalid handoff as keep-open; do not start rem; do not invent a lease handoff.
- Do not change `isRemediableFailedHandoff`, `REMEDIABLE_STEPS`, rem agent naming, or rem prompts. After this handoff shape exists, the existing `#259` loop starts `r<N>-verify` and reruns verify.

Extend `handoff()` in `scripts/sdlc-finalize-verification.mjs` rather than adding a new module. No equivalent options bag exists today.

Exact signature after the fix:

```js
function handoff(issue, status, summary, reportPath, reasonCode = null, options = {}) {
  const passed = status === 'passed';
  return {
    schemaVersion: 1,
    issue,
    step: 'verify',
    status,
    intervention: options.intervention ?? (status !== 'passed'),
    summary,
    artifacts: options.artifacts ?? (passed ? [reportPath] : []),
    next: passed ? 'deliver' : null,
    reasonCode,
  };
}
```

`fail` becomes:

```js
const fail = (reasonCode, summary, options) => writeHandoff(handoff(issueNumber, 'failed', summary, reportPath, reasonCode, options));
```

Non-ready branch becomes:

```js
if (!['pass', 'pr_evidence_pending', 'pr_evidence_satisfied'].includes(readiness.status)) {
  const remediableImplementationNonPass = readiness.status === 'blocked'
    && readiness.reasonCode === 'implementation_non_pass'
    && ['fail', 'partial'].includes(readiness.implementationStatus);
  return fail(
    'verification_not_ready',
    `Verification is not ready for #${issueNumber}: ${readiness.reasonCode}`,
    remediableImplementationNonPass
      ? { intervention: false, artifacts: [reportPath] }
      : undefined,
  );
}
```

Passed path stays `writeHandoff(handoff(issueNumber, 'passed', ..., reportPath))` with `intervention: false`, artifacts `[reportPath]`, `next: 'deliver'`.

Update `workflows/verify-code/WORKFLOW.md` only: resolve and read `skill://skill-creator` first, then replace the description’s “otherwise failed intervention” clause and the Finalize Verification last sentence so Fail/Partial are remediable and Incomplete/publish/lease/unverifiable/`spec_not_approved` remain intervention. Do not change the worker rule that the controller owns the handoff.

Exact description string:

```text
The architecture-reviewer runs inline verification against the approved specs/{N}-{slug}/ . Writes verification-report.md, comments on the issue, and produces handoff. Pass or PR Evidence Pending advances to deliver. Fail or Partial writes a remediable failed verify handoff (intervention: false) for rN-verify. Incomplete, spec_not_approved, publish, lease, and unverifiable outcomes remain intervention. Use only from automated /sdlc-execute.
```

Exact Finalize Verification closing paragraph:

```text
Print the controller's `NMG_SDLC_HANDOFF:` line unchanged and stop. A passed handoff exists only after the exact report is published, the branch is synchronized, and the non-runtime worktree is clean. Fail or Partial `implementation_non_pass` writes `status: failed` with `intervention: false` and does not advance to delivery. Incomplete, `spec_not_approved`, `verification_publish_failed`, lease failure, missing/invalid reports, and unverifiable readiness remain intervention and never start rem.
```

### Changes

| File | Change | Rationale |
|------|--------|-----------|
| `scripts/sdlc-finalize-verification.mjs` | Optional `options` on `handoff`/`fail`; Fail/Partial set `intervention: false` and attach `reportPath` | Root cause: intervention was coupled to non-pass |
| `workflows/verify-code/WORKFLOW.md` | Description + finalize close sentences | Worker contract currently claims every controller failure is intervention |
| `scripts/__tests__/sdlc-finalize-verification.test.mjs` | Fail/Partial remediable; Incomplete/unverifiable still intervention | Locks the new branch without changing readiness tests |

### Blast Radius

- **Direct impact**: verify handoff JSON from `finalizeVerification` / `finalizeVerificationUnlocked`.
- **Indirect impact**: `runExecute` remediable-failed path for step `verify`; rem worker prompt still `workerPrompt({ step: 'verify' })`.
- **Risk level**: Low. Predicate unchanged; only Fail/Partial flip intervention. Incomplete stays blocked as today.

---

## Regression Risk

| Risk | Likelihood | Mitigation |
|------|------------|------------|
| Incomplete starts rem | Med | Branch requires `implementationStatus` `'fail'` or `'partial'` only |
| Publish/lease/invalid report start rem | Low | Those paths still default `intervention: true` or write no handoff |
| Passed verify starts rem | Low | Passed path unchanged (`status: 'passed'`, `intervention: false`, `next: 'deliver'`) |
| Rem rewinds to implement | Low | `next` stays `null` on remediable fail; `#259` already forbids first-observation rewind |

---

## Alternatives Considered

| Option | Description | Why Not Selected |
|--------|-------------|------------------|
| Split Incomplete out of `implementation_non_pass` in readiness | Change `inspectVerificationReadiness` | Unneeded; `implementationStatus` already distinguishes; issue out of scope forbids changing that collapse |
| Rem on any `verification_not_ready` | Treat all non-ready as remediable | Would rem Incomplete, unverifiable, and publish failures |

---

## Validation Checklist

Before moving to TASKS phase:

- [x] Root cause is identified with specific code references
- [x] Fix is minimal — no unrelated refactoring
- [x] Blast radius is assessed
- [x] Regression risks are documented with mitigations
- [x] Fix follows existing project patterns (per `structure.md`)
