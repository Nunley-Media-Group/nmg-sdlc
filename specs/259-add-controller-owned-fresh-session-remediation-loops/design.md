# Design: Add controller-owned fresh-session remediation loops

**Issue**: #259
**Date**: 2026-08-25
**Status**: Approved
**Author**: NMG
**Related Spec**: specs/249-make-execute-resume-active-issue-state-safely/

---

## Overview

`runExecute` gains an in-session rem loop for remediable failed handoffs. The execute pane still only launches sibling `--kind omp` workers, validates handoffs, and persists `.omp/sdlc/run.json`. It still does not edit product code, implement tasks, or open PRs.

A remediable outcome is exactly: worker idle or done; `validateHandoff` succeeds; `handoff.issue` and `handoff.step` match the current issue and expected step; `status === 'failed'`; `intervention === false`; and `step` is in `REMEDIABLE_STEPS`. Everything else, including `start`, keeps today's `stopResult` pane-open path.

Rem workers are named `r<N>-<step>` so they do not match the live prefix `s${issue}-` and cannot be mistaken for a second `s<N>-<step>`. The rem prompt is a deterministic header plus the existing `workerPrompt` for the failed step. The rem session writes the original `.omp/sdlc/handoffs/<N>-<step>.json`. On pass, execute consumes that original identity and continues. On another remediable failure, it closes the rem pane and starts a fresh `r<N>-<step>`. On a genuine blocker, it stops and leaves the rem pane open.

`VALID_STEPS`, `validateHandoff`, and `WORKER_CONSUMERS` stay unchanged. `rem` is not a queue step.

---

## Architecture

```
execute pane
    │
    ├─ s<N>-<step>  ── remediable failed ── persist run.remediation ── close s pane
    │                                                              │
    │                                                              ▼
    └─ r<N>-<step>  ── fix + rerun same step ── write <N>-<step>.json
           │
           ├─ passed non-intervention → close r pane → consume original step → nextStep
           ├─ remediable failed       → persist → close r pane → new r<N>-<step>
           └─ blocked / intervention / missing / invalid / stalled / unknown
                                      → stopResult, rem pane left open
```

Reuse `closePane`, `stopResult`, `validateHandoff`, `workerPrompt`, `waitForWorkerSettlement`, `completeInteractiveReview`, pane split, and `agentStart({ kind: 'omp' })`. Do not export a background daemon. Do not add a timeout key on `agentWait`.

### Component Diagram

```
┌──────────────────────────────────────────────────────────┐
│ execute controller (scripts/sdlc-execute.mjs)            │
│  runExecute → remediable? → persist → close → rem start  │
└───────────────────────────┬──────────────────────────────┘
                            │
                            ▼
┌──────────────────────────────────────────────────────────┐
│ Herdr sibling OMP                                        │
│  s<N>-<step>  or  r<N>-<step>                            │
└───────────────────────────┬──────────────────────────────┘
                            │
                            ▼
┌──────────────────────────────────────────────────────────┐
│ .omp/sdlc/run.json          .omp/sdlc/handoffs/<N>-<step>.json │
└──────────────────────────────────────────────────────────┘
```

### Data Flow

```
1. Worker settles idle/done
2. validateHandoff on .omp/sdlc/handoffs/<N>-<step>.json
3. If remediable failed: write run.remediation + run.failed, then close that pane
4. Split a new pane and agentStart r<N>-<step> --kind omp
5. Prompt rem header + workerPrompt(failedStep); for review1/review2 also drive completeInteractiveReview
6. Wait/settle; require original-step handoff identity
7. Pass → close rem, push original step onto completed, nextStep
8. Remediable fail → increment attempt, close rem, goto 4
9. Other → stopResult keep rem pane; rewind stays for a later resume after rem has stopped
```

---

## API / Interface Changes

### New Endpoints / Methods

| Endpoint / Method | Type | Auth | Purpose |
|-------------------|------|------|---------|
| `REMEDIABLE_STEPS` | exported const | No | `['implement','review1','fix1','review2','fix2','verify','deliver']` |
| `remAgentName(issue, step)` | exported function | No | Returns `` `r${issue}-${step}` `` |
| `isRemediableFailedHandoff({ step, state, handoff })` | exported function | No | Predicate in Overview |
| `remediationPrompt({ issue, failedStep, evidence, cwd })` | exported function | No | Header plus `workerPrompt({ step: failedStep, issue, cwd })` |
| `worker-prompt --step rem --issue N --failed-step <step>` | CLI | No | Prints `remediationPrompt`; reads evidence from `run.remediation` when `evidence` omitted |

`workerPrompt` still throws `invalid step for workerPrompt` for `rem`. `validateHandoff` still rejects `step: 'rem'`.

Existing `worker-prompt` usage for real steps stays:

`Usage: node sdlc-execute.mjs worker-prompt --step <start|implement|review1|fix1|review2|fix2|verify|deliver> --issue N`

Add a second accepted form:

`Usage: node sdlc-execute.mjs worker-prompt --step rem --issue N --failed-step <implement|review1|fix1|review2|fix2|verify|deliver>`

Missing `--failed-step`, a `start` failed-step, or an unknown failed-step exits 2 with that rem usage line and prints no prompt.

### Request / Response Schemas

#### `isRemediableFailedHandoff`

**Input:** `{ step, state, handoff }` after `validateHandoff` succeeded.

**Output:** `true` only when all of:

- `REMEDIABLE_STEPS.includes(step)`
- `state` is `idle` or `done`
- `handoff.status === 'failed'`
- `handoff.intervention === false`
- `handoff.step === step`

Otherwise `false`.

#### `remediationPrompt`

**Input:**

```json
{
  "issue": 42,
  "failedStep": "verify",
  "cwd": "/repo",
  "evidence": {
    "attempt": 1,
    "reasonCode": "verification_failed",
    "summary": "verify failed",
    "artifacts": [".omp/sdlc/verify/42.md"],
    "closedName": "s42-verify",
    "closedPaneId": "pane-8"
  }
}
```

**Output (success):** one string: rem header, a `---` line, then the exact `workerPrompt({ step: failedStep, issue, cwd })` body.

Header text is exactly these lines with values substituted (artifacts as one `- path` line each, or `- (none)` when the array is empty):

```text
You are remediating issue #<issue> step <failedStep> (attempt <attempt>).
Failed worker <closedName> in pane <closedPaneId> was closed after evidence capture.
reasonCode: <reasonCode>
summary: <summary>
artifacts:
- <artifact or (none)>

Diagnose that failure. Fix the defect. Update the approved issue spec only when observable behavior changes. Commit and push through the existing execute gates for this step. Then rerun the same failed step contract below and write .omp/sdlc/handoffs/<issue>-<failedStep>.json with issue <issue> and step <failedStep>. Never write a rem step identity. Never call ask.
```

When `evidence` is omitted, read `run.remediation` from `readRun(cwd)` and require `issue`/`step` match; otherwise throw `remediation_evidence_missing`.

**Errors:**

| Code / Type | Condition |
|-------------|-----------|
| `invalid step for workerPrompt` | `workerPrompt` still rejects `rem` |
| `remediation_evidence_missing` | CLI rem path cannot read matching `run.remediation` |
| exit 2 rem usage | CLI rem without a remediable `--failed-step` |

---

## Database / Storage Changes

### Schema Changes

| Table / Collection | Column / Field | Type | Nullable | Default | Change |
|--------------------|----------------|------|----------|---------|--------|
| `.omp/sdlc/run.json` | `schemaVersion` | 1 | No | 1 | Unchanged |
| `.omp/sdlc/run.json` | `failed` | `{ issue, step, reasonCode }` | Yes | null | Still written on remediable persist and on stop |
| `.omp/sdlc/run.json` | `remediation` | object or null | Yes | null | Add |

`run.remediation` shape:

```json
{
  "issue": 42,
  "step": "verify",
  "attempt": 1,
  "status": "active",
  "reasonCode": "verification_failed",
  "summary": "verify failed",
  "artifacts": [".omp/sdlc/verify/42.md"],
  "closedWorker": { "name": "s42-verify", "paneId": "pane-8" },
  "remWorker": { "name": "r42-verify", "paneId": "pane-9" },
  "history": [
    {
      "attempt": 1,
      "reasonCode": "verification_failed",
      "artifacts": [".omp/sdlc/verify/42.md"],
      "closedName": "s42-verify",
      "closedPaneId": "pane-8",
      "at": "2026-08-25T00:00:00.000Z"
    }
  ]
}
```

`status` is `active` while a rem is running or about to start, `passed` after original-step pass (then clear `remediation` to `null` on the same `writeRun` that clears `failed`), and left as `active` with updated `reasonCode` when rem stops fail-closed so resume can see the rem worker.

`readRun` / `writeRun` keep `schemaVersion === 1`. Older run files without `remediation` treat it as `null`.

### Migration Plan

No git migration. Absent `remediation` means rem is not in progress.

### Data Migration

None.

---

## State Management

### New State Shape

```
RunState.remediation: null | {
  issue, step, attempt, status, reasonCode, summary, artifacts,
  closedWorker: { name, paneId },
  remWorker: { name, paneId } | null,
  history: HistoryRow[]
}
```

`remWorker` is null after evidence persist and before the rem pane exists, and again after a rem pane is closed for retry.

### State Transitions

```
no rem + remediable failed s<N>-<step>
  → persist remediation attempt 1, remWorker null, failed record
  → close s pane (fail → pane_close_failed, no rem)
  → start r<N>-<step>, set remWorker

r<N>-<step> remediable failed
  → append history, attempt += 1, remWorker null, close r pane
  → start new r<N>-<step>

r<N>-<step> passed original-step handoff
  → close r pane, completed.push(step), remediation = null, failed = null, nextStep

r<N>-<step> blocker / invalid / stalled / intervention / start (impossible)
  → stopResult, rem pane open, do not increment into another rem

resume + live r<N>-<step>
  → wait or evaluate rem; never start s<N>-<step> or a second rem

resume + no live r<N>-<step> + remediation.status active
  → start rem, not s<N>-<step>

resume + rem stopped + rem pane gone + backward next on original handoff
  → existing remediationCompletedSteps rewind
```

Call `remediationCompletedSteps` only when `isRemediableFailedHandoff` is false **and** no live `r${issue}-${step}` exists **and** `run.remediation` is null or rem has already stopped fail-closed. First remediable observation never rewinds even when `handoff.next` is an earlier step.

---

## UI Components

No new public `/sdlc-*` command and no new TUI picker. Rem uses the same Herdr split as other execute workers (`right` when width >= height else `down`).

Do not notify on rem start. Notify only through existing `stopResult` when rem ends fail-closed. The stop sentence names the rem agent when the rem pane is the one left open: `Stopped on #<N> <step>. Worker pane <pane> agent r<N>-<step> left open.`

---

## Alternatives Considered

| Option | Description | Pros | Cons | Decision |
|--------|-------------|------|------|----------|
| **A: Name rem `s<N>-rem`** | Stay on `s` prefix | Matches live `s${issue}-*` scan | Collides with `retained_worker_mismatch`; looks like a queue step | Rejected — rem must not match `s${issue}-` |
| **B: Add `rem` to `VALID_STEPS` / `WORKER_CONSUMERS`** | First-class queue step | Registry already maps 1:1 | Breaks `nextStep`, handoff identity, prompt-snippet test | Rejected — rem is not a lifecycle step |
| **C: Header plus existing `workerPrompt`** | Compact rem context then original contract | No new snippet consumer; original handoff path unchanged | Review rem still needs controller `/review` keys | **Selected** |
| **D: Attempt cap** | Stop after N rem tries | Bounds runaway loops | Issue requires repeat until pass or genuine blocker | Rejected — unbounded |

---

## Security Considerations

- **Authentication**: unchanged `gh auth status` preflight
- **Authorization**: rem workers cannot widen GitHub mutation beyond the failed step's existing worker contract
- **Input Validation**: rem CLI failed-step must be in `REMEDIABLE_STEPS`; handoffs still pass `validateHandoff`
- **Data Sanitization**: rem header treats `summary` and artifact paths as text, not shell
- **Sensitive Data**: do not copy worker transcripts into `run.json`; persist only handoff `reasonCode`, `summary`, and `artifacts`

---

## Performance Considerations

- **Caching**: none
- **Pagination**: none
- **Lazy Loading**: rem prompt renders only when rem starts
- **Indexing**: none

Unbounded rem stays in one `runExecute` invocation and uses the same blocking `agentWait` as other workers. No poll loop.

---

## Testing Strategy

| Layer | Type | Coverage |
|-------|------|----------|
| Predicate / prompt | Unit | `isRemediableFailedHandoff`, `remAgentName`, `remediationPrompt`, rem CLI usage |
| Controller | Jest fixture | close-then-rem, retry fresh session, handoff transfer, no duplicate `s`/`r` workers, auto-continue, fail-closed blockers, resume |
| Prompt registry | Existing suite | `WORKER_CONSUMERS` still equals `VALID_STEPS.map(worker:${step})` |
| Feature | Gherkin `@SCN001`–`@SCN006` | AC1–AC6 |

Reuse `makeControllerFixture`. Add a `remediableFailedStep` option that writes `status: 'failed'` and `intervention: false`. Do not change `failedStep`, which stays `intervention: true` so `keeps a failed worker pane and sends the exact notification` and `stops after failed review1 without launching later queue steps` remain keep-open.

`agentPrompt` already derives the handoff step from the substring after the last `-` in the agent name, so `r42-verify` writes `42-verify.json`. Tests must list live rem agents from `starts` so resume sees `r42-verify`.

Required new tests (names may match these literals):

1. `closes a remediable failed verify pane then starts one rem session` — `remediableFailedStep: 'verify'`; first rem prompt writes passed verify; expect `closed` includes the verify pane before `starts` contains `{ name: 'r42-verify' }`; never two live `s42-verify`; later steps continue; `run.remediation` is null on success; no `stopResult` sentence.
2. `retries remediable rem failure with a fresh rem session` — rem attempt 1 writes remediable failed verify; attempt 2 writes passed; expect two `r42-verify` starts, first rem pane closed before second split, no leftover rem pane, no second `s42-verify`.
3. `consumes the original verify handoff after rem pass` — after rem pass, `completed['42']` includes `verify` and `currentStep` is `deliver` or later; no `42-rem.json`; `validateHandoff` of `42-verify.json` has `step: 'verify'`.
4. `does not rem a failed start or intervention handoff` — `failedStep: 'start'` and existing intervention `failedStep: 'implement'` still keep those panes and start no `r42-*`.
5. `does not rem blocked unknown missing stalled or invalid outcomes` — cover blocked status, `intervention: true`, missing file after wait, `invalid_handoff` mismatch, `agent_prompt_stalled`, and `unknown_pane`.
6. `stops rem on a genuine rem blocker and leaves rewind for a later resume` — rem writes `status: blocked` or `intervention: true` with `next: 'implement'`; expect rem pane open, no third rem start; a second `runExecute` with rem pane removed and original failed/intervention verify handoff `next: 'implement'` still rewinds via `remediationCompletedSteps`.
7. `resumes a live rem worker without starting s<N>-<step>` — persist `remediation.status: 'active'` and list `r42-verify` working; expect wait, no `s42-verify` start, no second rem start.

Keep `reports failed verification before a later run consumes its implement transition` and `resumes failed verification at implement and reruns every downstream gate` on the intervention/rewind fixture path.

---

## Risks & Mitigations

| Risk | Likelihood | Impact | Mitigation |
|------|------------|--------|------------|
| Live `s${issue}-*` scan misses rem and launches a duplicate step worker | High without this spec | Third pane | Resume checks `r${issue}-${step}` before any `s${issue}-${step}` start |
| Rem named `sN-rem` trips `retained_worker_mismatch` | High if misnamed | False stop | Name is `r<N>-<step>` only |
| First remediable failed verify with `next: implement` rewinds instead of remming | Medium | Skips same-step rem | Predicate runs before `remediationCompletedSteps` |
| Existing `failedStep` tests flip to rem accidentally | Medium | Lost keep-open coverage | Keep `failedStep` as intervention true |

---

## Open Questions

- [x] Rem agent name — `r<N>-<step>` so it does not match `s${issue}-`
- [x] Prompt composition — header plus existing `workerPrompt`; no `worker:rem` consumer
- [x] Neighbor specs — cite exception here; do not rewrite historical packages

---

## Change History

| Issue | Date | Summary |
|-------|------|---------|
| #259 | 2026-08-25 | Initial feature spec |

---

## Validation Checklist

Before moving to TASKS phase:

- [x] Architecture follows existing project patterns (per `structure.md`)
- [x] All API/interface changes documented with schemas
- [x] Database/storage changes planned with migrations
- [x] State management approach is clear
- [x] UI components and hierarchy defined
- [x] Security considerations addressed
- [x] Performance impact analyzed
- [x] Testing strategy defined
- [x] Alternatives were considered and documented
- [x] Risks identified with mitigations
