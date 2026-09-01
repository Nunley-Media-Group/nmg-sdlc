# Tasks: Namespace controller workers across retained smoke clones

**Issue**: #349
**Date**: 2026-08-31
**Status**: Approved
**Author**: NMG
**Related Spec**: specs/291-enforce-one-controller-writer-and-close-stale-workers/

---

## Summary

| Task | Description | Status |
|------|-------------|--------|
| T001 | Namespace Herdr worker names per persisted run | [ ] |
| T002 | Add two-root and legacy-namespace regression tests | [ ] |
| T003 | Verify execute suite and no foreign-pane side effects | [ ] |

---

### T001: Fix the Defect

**File(s)**: `scripts/sdlc-execute.mjs`
**Type**: Modify
**Depends**: None
**Acceptance**:
- [ ] `import { randomUUID, createHash } from 'node:crypto'`
- [ ] Export `workerNamespaceForRunId(runId)` returning `createHash('sha256').update(String(runId), 'utf8').digest('hex').slice(0, 8)`
- [ ] Export `stepAgentName(issue, step, workerNamespace = null)` returning `` workerNamespace ? `s${workerNamespace}-${issue}-${step}` : `s${issue}-${step}` ``
- [ ] Change `remAgentName(issue, step, workerNamespace = null)` to `` workerNamespace ? `r${workerNamespace}-${issue}-${step}` : `r${issue}-${step}` ``; the two-arg call remains the legacy name
- [ ] Add `HERDR_AGENT_NAME = /^[a-z][a-z0-9_-]{0,31}$/` and `WORKER_NAMESPACE = /^[0-9a-f]{8}$/`
- [ ] Helper `resolveWorkerNamespace(runState)`: if `Object.hasOwn(runState, 'workerNamespace')` and it fails `WORKER_NAMESPACE`, callers stop with `reasonCode: 'invalid_worker_namespace'` and start no worker; if the field is absent, return `null`; if valid, return that string
- [ ] New checkpoint object at the `if (!runState)` initializer (the block that sets `runId: controllerRunId`, `revision: 0`, `currentStep: 'start'`) includes `workerNamespace: workerNamespaceForRunId(controllerRunId)`. Do not set the field on an existing `validRunIdentity` resume
- [ ] Inside `runExecute`, after `runState` is bound and before the issue loop uses names, `const workerNs = resolveWorkerNamespace(runState)` (stop if invalid). Replace every `` `s${issue}-${step}` `` construction in `runExecute` with `stepAgentName(issue, step, workerNs)` including restore-branch `agentName`, live equality checks (`agentName !== stepAgentName(...)`), new `agentStart` name, and review-fail `agentName` fallbacks
- [ ] Replace `existingAgents.filter((agent) => String(agent?.name || '').startsWith(\`s${issue}-\`))` with prefix `workerNs ? \`s${workerNs}-${issue}-\` : \`s${issue}-\``
- [ ] Replace `remAgentName(issue, step)` inside `runExecute` / `runRemediationLoop` with `remAgentName(issue, step, workerNs)`
- [ ] Before `agentStart`, if the constructed name fails `HERDR_AGENT_NAME`, `stopResult` `invalid_worker_name` and do not start
- [ ] Do not close, `agentPrompt`, or `agentWait` an agent whose name is not this run's `stepAgentName` / `remAgentName`
- [ ] Do not rename handoff files; do not add `workerNamespace` to `RUN_IDENTITY_FIELDS` or `validRunIdentity`

**Notes**: Follow the fix strategy from design.md. Keep changes minimal. No equivalent namespace helper exists today (`remAgentName` is the only name builder).

### T002: Add Regression Test

**File(s)**: `scripts/__tests__/sdlc-execute.test.mjs`
**Type**: Modify
**Depends**: T001
**Acceptance**:
- [ ] Unit: `workerNamespaceForRunId('test-run-id')` is 8 lowercase hex; `stepAgentName(42, 'start', ns)` is `s${ns}-42-start`; `remAgentName(42, 'verify', ns)` is `r${ns}-42-verify`; two-arg `remAgentName(42, 'verify')` stays `r42-verify`
- [ ] Fresh `makeControllerFixture()` + `runExecute({ args: '#42', ... })` happy-path starts use `/^s[0-9a-f]{8}-42-(start|implement|review1|fix1|review2|fix2|verify|deliver)$/` (derive `ns` from the first start name). Do not leave assertions of exact `'s42-start'` on **unseeded** new checkpoints
- [ ] Seeded `seedRun` / `boundRunData` checkpoints **without** `workerNamespace` keep expecting `s42-*` / `r42-*` (legacy resume)
- [ ] Rewrite `does not start a second worker when an issue worker is live`: unseeded fixture, `listAgents` returns `{ name: 's42-verify', pane_id: 'kept-pane', state: 'working' }`. Expect status that continues past start (not `retained_worker_mismatch`), `fixture.starts[0].name` matching `/^s[0-9a-f]{8}-42-start$/`, `fixture.closed` not containing `kept-pane`, and no `agentPrompt`/`agentWait`/`agentStart` targeting `s42-verify`
- [ ] New test: two temp project roots, shared `listAgents` inventory. Root A seeded with `workerNamespace` `aaaaaaaa`, live `saaaaaaaa-39-start` in pane `kept-a`. Root B has no checkpoint. `runExecute` `#39` in B starts `/^s[0-9a-f]{8}-39-start$/` whose `ns !== 'aaaaaaaa'`, does not close `kept-a`, stdout/failed reason is not `retained_worker_mismatch`
- [ ] New test: same root, seed namespaced run (`runId: 'test-run-id'`, `workerNamespace: workerNamespaceForRunId('test-run-id')`, workers keyed by `stepAgentName(42, 'start', ns)`), matching live agent; resume does not `agentStart` that start name again (stable across restart)
- [ ] New test: checkpoint with `workerNamespace: 'not-hex!!'` fails `invalid_worker_namespace`, `fixture.starts` empty
- [ ] Gherkin scenarios in this spec's `feature.gherkin` are covered by the tests above (`@SCN001`–`@SCN003`); tag the two-root test intent with `@regression` in comments or test title
- [ ] Tests still fail if T001 is reverted (fresh run + leftover `s42-verify` would again `retained_worker_mismatch`)

### T003: Verify No Regressions

**File(s)**: `scripts/__tests__/sdlc-execute.test.mjs` (existing cases)
**Type**: Verify (no file changes)
**Depends**: T001, T002
**Acceptance**:
- [ ] `cd scripts && npx jest sdlc-execute.test.mjs --runInBand` exits 0
- [ ] Legacy ownership-mismatch table (`rejects a retained worker with %s`) still `retained_worker_mismatch` and does not close `kept-pane`
- [ ] Remediation still uses `r…` names (namespaced on new runs, `r42-verify` on legacy seeds)
- [ ] No smoke-provider file changes

---

## Validation Checklist

Before moving to IMPLEMENT phase:

- [x] Tasks are focused on the fix — no feature work
- [x] Regression test is included (T002)
- [x] Each task has verifiable acceptance criteria
- [x] No scope creep beyond the defect
- [x] File paths reference actual project structure (per `structure.md`)
