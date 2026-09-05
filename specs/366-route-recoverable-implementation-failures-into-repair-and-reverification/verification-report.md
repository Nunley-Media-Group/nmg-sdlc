# Implementation Verification: #366

**Issue**: #366
**Status**: Implementation verified; downstream verification pending

## Scope and outcome

T001 and T002 are implemented and their preserved evidence has been inspected in this resumed worker. T003 follows the revised approved tasks: fresh consumer smoke belongs to verify, patch release and exact-head delivery belong to deliver, and installed-release verification belongs to the requesting orchestrator. Those mandatory downstream requirements do not block the implementation handoff before review. No review, merge, issue closure, release, or installation is claimed. VERSION and package.json remain intentionally unchanged.

Behavior for workflows/write-code/WORKFLOW.md: investigate missing internal details within approved outcomes, repair and reverify, preserve partial work and original implement identity, and emit non-intervention failure only for remaining repairable work. Genuine authority and publication failures remain intervention blockers. No controller classifier, retry subsystem, schema, or attempt cap changed.

Behavior for agents/spec-implementer.md: follow the producing workflow's repair classification without duplicating its algorithm. README.md documents the distinction. CHANGELOG.md records the pending fix. scripts/skill-inventory.baseline.json was regenerated with the existing audit after the changed agent instruction invalidated its previous fingerprint.

Behavior for scripts/__tests__/sdlc-execute.test.mjs: repeated repairable implement failures launch fresh r42-implement workers, close their predecessors, retain step implement, and reach review1 only after a passed original handoff. An intervention implement failure leaves only start completed and launches neither remediation nor review. These controller fixtures do not independently prove Git publication; the live repair exercise below does.

## Commands and results

- `npm ci --ignore-scripts` in scripts/ — exit 0; installed locked test dependencies after the initial focused test could not find Jest. No dependency manifest changes.
- `npm test -- --runInBand __tests__/sdlc-execute.test.mjs` in scripts/ — exit 0; 242 tests passed.
- `npm test -- --runInBand` in scripts/ — exit 0; 51 suites passed, one opt-in suite skipped; 881 tests passed, two skipped. The skips are the opt-in legacy Codex start-issue exercise and Windows junction test on macOS. Neither is #366 live-worker evidence; #366 uses OMP below.
- `RUN_EXERCISE_TESTS=1 npm test -- --runInBand exercise-start-issue-backfill` in scripts/ — exit 0; the existing opt-in legacy exercise passed (one test). Its Codex invocation is not used as #366 OMP evidence.
- `node scripts/skill-inventory-audit.mjs --baseline` — exit 0; regenerated 43 items.
- `node scripts/skill-inventory-audit.mjs --check` — exit 0; all 43 items mapped.
- `node scripts/verify-plugin-surface.mjs --root . --label repository` — exit 0.
- `git diff --check` — exit 0.
- Resolved skill-creator validator: `node <skill-creator>/scripts/validate-skill.mjs <staged-bundle>` — exit 0 for write-code (114 lines) and spec-implementer (19 lines). Because the portable validator requires SKILL.md, each unchanged authored entrypoint was copied to a disposable directory named for its frontmatter, with the complete write-code references copied alongside. Production WORKFLOW.md and agent conventions were not changed.
- Simplification review found no clear behavior-preserving reduction. No generated artifact was manually simplified, and no abstraction or unrelated cleanup was added.

## Live OMP evidence: AC1 and AC3

Each scenario used a disposable Git repository with an approved singular #42 requirements/design/tasks/Gherkin set, a 42-component branch, and a local bare origin. The actual checkout composed the worker prompt with `node <checkout>/scripts/sdlc-execute.mjs worker-prompt --step implement --issue 42` in that project, including the simplify workflow. The scenario supplied Node ESM technical context and restricted mutation to the disposable project and local origin; no GitHub writes were used.

Invocation: `omp --print --no-session --no-extensions --no-rules --no-lsp --model openai-codex/gpt-5.6-luna:max @<scenario>-prompt.txt`, supervised with a terminal. Both workers exited 0. Initial non-terminal launches waited for stdin EOF; those exact owned processes were stopped and relaunched with terminals before successful execution. That startup failure is not counted as scenario success.

### Repairable missing component

The approved contract required sumPositive(values) to sum strictly positive finite numbers, ignore zero/negative values, and return zero for empty input. The consumer imported an absent sum-positive.mjs. Before invocation, `node --test consumer.test.mjs` exited 1. The worker created the component without seeking external policy and wrote a passed implement handoff with next review1. Independent post-run execution of the unchanged consumer test exited 0: one test passed, zero failed/skipped. Publication proof: non-runtime Git status empty; HEAD and upstream both `22d191fb2d2acbe188a2e33bb33f58dab23fd8f9`; subject `feat: implement positive sum component for #42`.

### Unavailable external authority

The approved contract required a genuine vendor-signed authority/vendor-approval.json and explicitly forbade local substitutes; vendor access and credentials were unavailable. The worker wrote failed/intervention true/reasonCode implementation_failed/next null, naming that prerequisite. Independent inspection confirmed no authorization or authorized.mjs was fabricated and no non-runtime changes existed.

Exact composed prompts, approved exercise inputs, invocation data, implementation, handoffs, independent consumer output, and publication proof are retained in `.omp/sdlc/evidence/366/`. Disposable repositories and staged validator bundles were removed after evidence capture. This proves local composed-worker behavior, not an installed release or remote consumer delivery.

## AC2 and AC4

The two added behavioral controller cases passed in the focused and full runs. The repeated-repair case observed s42-start → s42-implement → r42-implement → r42-implement → s42-review1; review inspected the original 42-implement handoff as passed. The intervention case stopped before either remediation or review. Live local publication proof above complements those deterministic transitions without attributing Git proof to mocked controller inputs.

## Historical preflight failure and mandatory downstream boundaries

The real registered `createSmokeProvider()` was invoked with config `{issuesEnv: "NMG_SDLC_SMOKE_ISSUES"}` and the current environment. Result: `status: "failed"`, `summary: "nmg-sdlc-smoke issues config invalid"`. The environment has HERDR_ENV=1 but no NMG_SDLC_SMOKE_ISSUES. Exact result is retained in `.omp/sdlc/evidence/366/smoke-preflight.json`.

The earlier worker had no fresh approved consumer issue queue and correctly did not invent issue ownership, reuse delivered issues, or fabricate approval. The revised approved T003 explicitly assigns that gate to the verify worker using the orchestrator-provisioned `NMG_SDLC_SMOKE_ISSUES` queue. The recorded preflight remains failed; disposable local tests do not turn it into a consumer-smoke pass.

After review, verify must run the registered fresh consumer smoke gate and record exact current-invocation delivery evidence. Deliver must synchronize VERSION/package.json for a patch release, prove exact-head PR merge and issue closure, and the requesting orchestrator must install that delivered version and verify installed version and surface. All remain mandatory and unperformed at this implementation boundary. A passed implement handoff authorizes only review1, after implementation checks and commit/push/clean-tree/upstream-equality proof.

## Resumed implementation checks

After inspecting all approved tasks, the complete write-code bundle, agent contract, README behavior, controller cases, and preserved live exercise results, this worker retained the existing implementation without needless changes. Simplification found no clear reduction that preserved the explicit repair and safety contracts.

- `npm test -- --runInBand __tests__/sdlc-execute.test.mjs` in scripts/ — exit 0; 242 tests passed.
- `npm test -- --runInBand` in scripts/ — exit 0; 51 suites and 881 tests passed; the same opt-in legacy exercise and platform-specific Windows case account for the one skipped suite and two skipped tests.
- `node scripts/skill-inventory-audit.mjs --check` — exit 0; 43 items mapped.
- `node scripts/verify-plugin-surface.mjs --root . --label repository` — exit 0.
- `node --test .omp/sdlc/evidence/366/consumer.test.mjs` — exit 0; the preserved live worker's implementation passed the unchanged consumer test, one passed and no skips. This is a replay of retained live evidence, not a new OMP session.
- The resolved skill-creator validator passed complete disposable portable copies of write-code (114 lines) and spec-implementer (19 lines), both exit 0 with no warnings. The temporary copies were removed.

The live OMP sessions documented above were not rerun: their exact invocation metadata, composed prompts, inputs, output component, handoffs, and independent publication/authority checks remain available in `.omp/sdlc/evidence/366/`. Only the approved task ownership clarification and this report changed during resumption; no runtime or prompt behavior changed after those exercises.
