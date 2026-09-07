# Implementation Verification: Bounded bare-command recovery

**Issue**: #372
**Date**: 2026-09-07
**Worker**: implement
**Controller run**: 8a12f435-e517-44f8-953f-81563368bea2
**Scope**: Implementation-owned T001–T003 and the implementation portion of T004. This is not the managed review, registered final verification, consumer smoke, release, or delivery report.

## Implemented contract

- Bare discovery resolves the exact incomplete branch and persisted queue before selection, including a linked worker branch retained from a legacy default-branch checkpoint.
- Recovery consumption is persisted under exclusive controller ownership and keyed by run ID, issue and step. Original attempts and failure history are retained. Failed recovery, ambiguous dispatch, startup failure, process loss, repeated invocation and commit/summary churn cannot generate another dispatch.
- Existing optional flags and explicit issue queues do not grant the additional allowance. Normal later-stage remediation remains bounded independently.
- Complete Herdr agent/pane evidence distinguishes absent, present, reused and unreadable ownership. Confirmed absence retains branch identity in the checkpoint; it is not recorded as successful pane closure. Passed-handoff settlement retains the existing ancestry and delivery gates.
- Public command, status and stop diagnostics expose resumable, available, consumed and blocked states. Consumed unsuccessful recovery does not recommend another unchanged invocation.

## Behavior evidence

| Contract | Evidence |
|---|---|
| AC1 / SCN001 | Execute regressions cover bare persisted-queue resume, skipping completed queued stages, exact linked-worker branch identity, and proven-stale lease recovery. |
| AC2 / SCN002 | Legacy attempt-13 recovery starts one worker; concurrent and later calls cannot dispatch again. Failure history and allowance survive commit/head/summary churn. Missing legacy attempt counts cannot permit a second recovery. |
| AC3 / SCN003 | Regressions cover consumed-dispatch ambiguity, checkpoint compare-and-swap failure, startup failure and worker loss before prompting. Recovery cannot invoke ordinary worker-start retries. |
| AC4 / SCN004 | Recovery pass advances into ordinary review; existing passed-handoff, head-ancestry, later-stage remediation-limit and exact-head delivery tests remain in the suite. Full managed delivery is a downstream obligation. |
| AC5 / SCN005 | Branch mismatch, intervention, live workers, reused panes and unreadable pane evidence refuse dispatch. Positive absence is audited without calling pane close on the absent pane. |
| AC6 / SCN006 | Discovery distinguishes absent, completed and unreadable checkpoints. Status recommendations refuse consumed retries. An actual isolated CLI run and disposable OMP print exercise prove the local command path; registered remote smoke remains downstream. |

### Before/after regression

The new `bare recovery dispatches once for legacy attempt 13 and cannot replay after failure or churn` test was run against a temporary copy of the original HEAD controller. It failed at the observable dispatch assertion: expected `r42-implement`, observed no workers. The temporary baseline module retained the current read-only discovery export only to let the test reach the original controller behavior. No original dispatch code was changed. Temporary baseline files were removed after the reproduction.

### Actual isolated CLI exercise

`sdlc-execute-supervisor.test.mjs` runs the actual `node scripts/sdlc-execute.mjs run` CLI with no issue arguments in a disposable Git project. Local inert `gh` and `herdr` adapters observe durable consumption before pane split, produce a genuinely validated failed implementation handoff, and count dispatches. After a real empty Git commit, the next bare CLI invocation remains stopped with the same single dispatch. No production repository or live worker is used by these adapters.

### Actual OMP command exercise

Hypothesis: the rendered execute command discovers a consumed checkpoint, invokes bare `run` once, and stops without issue selection or a new worker.

A disposable project with a consumed attempt-13 checkpoint ran:

```text
omp --print --no-session --no-extensions --no-skills --no-rules --no-lsp --no-title --tools bash,read --thinking low @<disposable-runtime>/prompt.txt
```

The prompt contained this checkout's rendered execute command with its controller paths resolved to this checkout. GitHub and Herdr were inert local adapters; issue selection and worker dispatch were rejected by those adapters. OMP exited 0 after passing through discovery state `recovery-consumed` and the controller's stopped result. The checkpoint remained at `implement`, retained exactly one recovery record, recorded `recovery_consumed`, and had no workers. This proves the local prompt/tool path, not live Herdr or GitHub delivery.

## Bundle validation and simplification

- The complete execute bundle was staged in a disposable `execute/` directory with `WORKFLOW.md` represented as `SKILL.md` for the installed skill-creator validator. Final validation exited 0: valid, 25 lines.
- `node scripts/skill-inventory-audit.mjs --check`: exit 0, 43 items mapped; no baseline update needed.
- `node scripts/verify-plugin-surface.mjs --root . --label repository`: exit 0.
- `git diff --check`: exit 0 before report publication.
- `node scripts/skill-exercise-runner.mjs --skill execute`: exit 2 because no execute fixture exists. This is a named fixture gap, not a claimed fixture pass. The isolated real CLI and OMP exercises provide the implementation-owned runtime evidence instead.
- Simplification removed redundant recovery lookup and repeated checkpoint stat work; ownership classification is shared by discovery and execution. Existing prose/source-text assertions that pinned implementation text were removed rather than repinned. Behavioral dispatch, ownership, ancestry and handoff tests remain.

## Failed scoped run, repair, and complete rerun

The broader scoped job ran `npm test -- --runInBand sdlc-execute.test.mjs sdlc-status.test.mjs sdlc-execute-supervisor.test.mjs extension-commands.test.mjs exercise-manual-pipeline.test.mjs`. It exited 1: **1 suite failed, 4 passed; 26 tests failed, 304 passed**. All 26 failures were retrieved and preserved in `.omp/sdlc/evidence/372-implement/scoped-regression-failure.log`; none was treated as green.

Classification: a real in-scope lexical-shadowing defect in `runRemediationLoop`. A duplicate inner `const recovery` shadowed the stage-scoped lookup, making the earlier dispatch guard access an uninitialized binding. The repair removed the inner declaration and reused the stage-scoped lookup. The failing behavioral tests were preserved. Additional targeted checks cover missing legacy counts, exact linked-branch retention and the prohibition on recovery worker-start retries.

After those code repairs and simplification, the complete contract suite ran from `scripts/`:

```bash
npm test -- --runInBand
```

Exit **0**: **52 suites passed, 1 intentionally skipped; 984 tests passed, 2 intentionally skipped; 986 total**. The execute-only intermediate pass is not the final verification proof. The complete rerun includes execute, status, supervisor, command/surface, process-supervision, path portability, delivery and all other registered Jest contract suites. Full output is preserved in `.omp/sdlc/evidence/372-implement/complete-contract-suite.log`.

The two skips are existing platform/opt-in gates: the Windows junction test on this non-Windows host, and the start-issue backfill exercise guarded by `RUN_EXERCISE_TESTS=1`. No new skip or test weakening was introduced to resolve the scoped failure.

## Stage ownership and publication

VERSION and package.json are intentionally unchanged: release version synchronization belongs to deliver. Managed reviews/fixes, fresh invocation-bound `repository.nmg-sdlc-smoke`, registered final verification, exact-head merge and issue closure remain with the controller's subsequent stages. No installed-plugin files, unrelated #360 state, or PennyScan #137 state were changed.

The implementation worker stages the exact non-runtime changed paths, commits this report with the implementation, pushes the issue branch, and requires a clean non-runtime tree plus HEAD/upstream equality before issuing a passed handoff. The non-self-referential publication SHA and final command results are recorded in the runtime handoff/evidence after that boundary succeeds.
