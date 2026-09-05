# Implementation Verification: #366

**Issue**: #366
**Status**: Incomplete

## Scope and outcome

T001 and T002 are implemented. T003 is not complete: the required fresh-consumer smoke preflight failed, and this implement worker is not the owner of merge, patch release, or installed-release verification. No review, merge, issue closure, release, or installation is claimed. VERSION and package.json remain intentionally unchanged; the downstream delivery workflow owns synchronized version publication.

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

## Required gate failure and delivery boundary

The real registered `createSmokeProvider()` was invoked with config `{issuesEnv: "NMG_SDLC_SMOKE_ISSUES"}` and the current environment. Result: `status: "failed"`, `summary: "nmg-sdlc-smoke issues config invalid"`. The environment has HERDR_ENV=1 but no NMG_SDLC_SMOKE_ISSUES. Exact result is retained in `.omp/sdlc/evidence/366/smoke-preflight.json`.

No fresh approved consumer issue queue was supplied. Provisioning it requires the normal draft-issue/write-spec workflow owners and their approval contract; this no-questions implement worker cannot invent issue ownership, reuse delivered issues, or fabricate approval. Therefore T003 fresh-consumer acceptance remains failed, not passed by the disposable local tests. Patch release, exact-head merged PR, issue closure, and installed-version/surface checks remain unperformed downstream delivery requirements. The implement handoff must fail closed with intervention true and next null.
