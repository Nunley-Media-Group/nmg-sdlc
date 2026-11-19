# Design: Scope the pre-merge gate's tests and smoke to the change with a Claude selection checked by coverage and a surface map

**Issue**: #584
**Date**: 2026-11-19
**Status**: Approved
**Author**: Claude Code
**Related Spec**: specs/551-add-parallel-delivery-with-worktree-isolation-a-merge-queue-change-scoped-validation-tiers-and-one-pass-verification/

## Overview

A project turns on scoped verification with a top-level manifest `selection` object. It opts test validations in with `selection: true`, and declares `surfaces`.

Before any validation runs, the pre-merge gate makes one headless Claude call. The call uses the bundled `gate:selection` prompt, plus any project snippets routed to it, and its answer drives four things:
- which tests opted-in `builtin.command` validations run;
- which surface-bound validations run;
- what project providers receive;
- three deterministic checks: surface completeness, changed-line coverage and path accounting.

A rejected selection fails the affected validations. The verify finalizer turns it into a `selection_escalation` handoff, which `/sdlc-execute` presents to its supervising session instead of routing to implement. Redispatch guidance is stored bound to the head and is appended to the rerun's selection prompt.

The verify worker can run the selection ahead of the gate (`--mode select`). That lets this repository's smoke snippet drive the selected interactive surfaces in tmux before the gate checks their evidence. The gate reuses that stored selection, so there is still one Claude call per gate run.

## Architecture

### Steering schema (`src/sdlc-steering-runtime.mjs`)

**New optional top-level keys.** `OPTIONAL_TOP_KEYS` gains `selection` and `surfaces`. `optionalManifest()` validates them.

- **`selection`** is `{ docPaths?, fallbackPaths?, coveragePaths? }`.
  - Each list is an array of `safeRelativePath` globs, none starting with `!`.
  - An unknown key, or a non-object, fails `steering_manifest_invalid` (`selection`).
  - An object containing `program` or `args` fails `steering_validation_invalid` with detail `selection takes a prompt: declare the top-level selection object and set selection: true on change-tier builtin.command validations` (AC3).
- **`surfaces`** is a non-empty array of `{ id, sources, validations? }`.
  - `id` matches `^[a-z0-9][a-z0-9.-]*$` and is unique.
  - `sources` is a non-empty array of safe globs.
  - `validations` lists existing validation ids.
  - Any violation fails `steering_manifest_invalid` (`surfaces`).

**Validation-level `selection`.**
- `validateSelection` now accepts only `selection: true`, on a `change`-tier `builtin.command` validation, in a manifest that declares the top-level `selection`.
- A command object fails `steering_validation_invalid` with the "selection takes a prompt" detail above.
- Any other value fails with the same reason code (`selection`).
- Validation-level `fallbackPaths` keeps its current rules. It adds to the manifest-level `selection.fallbackPaths` for that validation.

**Shared glob helpers.** `globRegex` and `matches` move from the verification runtime into an exported helper, so that the steering runtime, the selection module and the upgrade detector all share one matcher.

### Selection model (`src/stage-models.mjs`, `scripts/sdlc-models.mjs`)

- Add `SELECTION_MODEL_DEFAULT = { model: 'haiku', effort: 'xhigh' }`.
- `validateStageModels` accepts an optional top-level `selection: { model, effort }`, validated with the existing model and effort rules. It never adds `selection` to `missing`, so `sdlc-models` completion and upgrade items do not propose it.
- Invalid values throw `StageModelsError` in the existing format: `steering/sdlc-models.json: selection.model = "x": must be …`.
- `selectionModel(config)` returns the configured entry, or the default (AC2, FR3).

### Bundled prompt (`src/sdlc-prompt-snippets.mjs`, `workflows/verify-code/references/selection-prompt.md`)

- Add `GATE_CONSUMERS = ['gate:selection']` to `ALLOWED_CONSUMERS`, so project `snippets[]` may route to it.
- The `CATALOG` gains `["plugin.gate.selection", "workflows/verify-code/references/selection-prompt.md", ["gate:selection"], "body", 100]`.
- The prompt file is generic and stack-agnostic. It tells Claude to:
  - select the tests whose code paths the change can affect;
  - select every surface whose sources the change touches, plus any surface that consumes a changed shared file;
  - answer `all` when it cannot scope safely;
  - answer `{ mode, tests, surfaces }` only.

### Selection resolver (`src/sdlc-test-selection.mjs`, new)

`resolveChangeSelection({ projectRoot, issue, baseRef, paths, runtime, models, runSelection, guidance, readStored })`

**Fallback first.**
- When any changed path matches the union of manifest and validation `fallbackPaths`, the result is `{ mode: 'all', reason: 'fallback_path', fallbackPath }`.
- Claude is not called (AC9).

**Prompt.**
- `renderPrompt(defaultPromptRegistry(packageRoot, { projectRoot }), { consumer: 'gate:selection' })`.
- Appended input sections:
  - base ref
  - changed paths
  - `git diff <base>...HEAD` plus working-tree changes, capped at 200 000 bytes with a truncation marker
  - surface ids with their sources
  - when guidance is present, a `Supervisor guidance:` section

**Claude call.**
- Command: `claude -p --model <m> [--effort <e>] --output-format json --json-schema <schema> --tools "" --no-session-persistence`.
  - `--effort` is omitted when the effort is `default`.
  - The prompt goes on stdin, the cwd is `projectRoot`, `shell: false`, and the timeout is 300 000 ms.
- The answer is the structured output in the CLI's JSON result.
- Bounds:
  - `mode` must be `selected` or `all`.
  - `tests` has at most 5000 unique non-empty strings of at most 1024 characters each.
  - `surfaces` holds unique declared ids.
- Any error, non-zero exit, timeout or bound violation → `{ mode: 'all', reason: 'selection_failed' }`.
- `all` → `selection_all`.
- Otherwise `reason` is `selected`, or `selection_empty` when both lists are empty.
- `runSelection` is injectable for tests.

**Required surfaces.** `requiredSurfaces` is every surface whose `sources` match a changed path.

**Stored selection.** The resolver writes `.nmg-sdlc/verification/selection-<N>.json` with:
- `binding: { headSha, pathsDigest, diffDigest, steeringHash, promptHash, guidanceHash }`
- the answer
- `reason`
- `model` and `effort`
- prompt `provenance`
- `guidanceSupplied`

A gate run whose live binding equals the stored one reuses the stored selection without calling Claude. Any mismatch calls Claude again. Either way there is one Claude call per gate run (FR2).

**Guidance.**
- Guidance is read from `.nmg-sdlc/verification/selection-guidance-<N>.json`: `{ schemaVersion: 1, issue, headSha, text }`.
- It is used only when its `headSha` equals the current HEAD.

### Gate integration (`src/sdlc-verification-runtime.mjs`)

`runSteeringValidations` keeps its phases. When the run is change-tier and the manifest declares `selection`, it first resolves the selection, once, before Phase 1, so a `concurrent` batch is never blocked by the Claude call.

**Pre-run checks (selected mode only).**
- Missing surfaces: `requiredSurfaces − surfaces` → rejection `selection_surface_missing` (AC5).
- An empty answer (no tests, no surfaces):
  - if `docPaths` is declared and every changed path matches it → docs-only (AC8);
  - otherwise → rejection `selection_empty_code_change`.

**Per-validation behavior.**
- **Opted-in `builtin.command` (`selection: true`):**
  - Selected mode: the selected tests are appended to `args`.
  - Docs-only, or selected mode with no tests and only surfaces: passes `selection_empty` without running.
  - `all` (any reason): the full command runs.
- **Surface-bound validation (named in any surface's `validations`):**
  - Selected mode with none of its surfaces selected → passes with `selection.reason: 'surface_not_selected'` and evidence `surface_not_selected: no bound surface selected` (AC5a).
  - All modes, including docs-only: an unselected bound validation passes the same way. In `all` mode every surface counts as selected.
- **Every project-provider request** gains `changedPaths` and `selection: { mode, reason, surfaces }`:
  - in `all` mode, `surfaces` is every declared surface id;
  - docs-only gives `[]` (FR10).
- **A pre-run rejection** marks every opted-in and every surface-bound validation `failed` without running it. The summary is `<reason>: <missing surfaces | paths>`.

**Coverage check (selected mode, after the opted-in validations pass, AC4).**
- Load `steering/test-coverage.json` with #572's `loadTestCoverageConfig`. Run its `coverage` command with the selected tests appended (argument array, cwd = project root, no shell). Validate stdout with `validateCoverageReport`.
- If the config is missing or invalid, no paths are coverage-accounted, and nothing fails here.
- If the command fails or its report is invalid, each opted-in result fails with `selection.reason: 'coverage_failed'`. This is an ordinary failure, not an escalation.
- Changed lines come from `git diff -U0 <base>...HEAD` plus the working-tree diff: the new-side line numbers per path.
- For each changed path that has a line record in the report:
  - candidate lines are the changed lines in `executableLines`, or the non-blank changed lines when `executableLines` is absent;
  - hit lines are those in the union of the selected tests' `lines`.
- Every opted-in result records `coverage: { changedLines, hitLines, uncovered }`.
- A non-empty `uncovered` → rejection `selection_uncovered`, and each opted-in result becomes `failed`.

**Accounting check (selected mode, after coverage, AC6).**
- A path is accounted for when any of these holds:
  - it has a report line record;
  - it is a selected test's `file`;
  - it matches a selected surface's sources;
  - it matches `docPaths`;
  - it matches `fallbackPaths`.
- Otherwise it is listed under `selection_unaccounted`, and each opted-in and surface-bound result becomes `failed`.

**Artifact.** The artifact gains `selection` with:
- `{ prompt: { consumer, fragments: [{ id, hash }] }, model, effort }`
- `mode`, `reason`, `fallbackPath`, `tests`, `surfaces`, `requiredSurfaces`
- `guidanceSupplied`
- `rejection: null | { reasonCode, uncovered, missingSurfaces, unaccounted }`

Per-result `selection` keeps `{ provider, reason, fallbackPath, selectedCount }`. `provider` becomes `claude:<model>`.

**Other gate behavior.**
- An invalid `steering/sdlc-models.json` gives `runtimeError: { reasonCode: 'stage_models_invalid', summary: <diagnostic> }` and ceiling `Incomplete`.
- Full tier, and manifests without `selection`, skip everything above. A full-tier run treats every surface as selected.

### Verify CLI (`scripts/sdlc-verify-steering.mjs`)

`--mode select` resolves and stores the selection without running validations, and prints `{ ok: true, selection }`. This is the stored selection the gate reuses. Without `--mode`, the CLI behaves as today.

### Escalation (`scripts/sdlc-finalize-verification.mjs`, `scripts/sdlc-execute.mjs`)

**Finalizer.** When the artifact `selection.rejection` is non-null, the finalizer writes:
- `status: 'failed'`, `intervention: false`, `next: 'verify'`, `reasonCode: 'selection_escalation'`
- `escalation: { kind: 'selection', reasonCode, uncovered, missingSurfaces, unaccounted }`

This happens with or without `--queue-gate`, and replaces `queue_gate_failed` / `verification_not_ready` for that case.

**Controller.**
- **Supervised.** The verify stage report carries `escalation`. Its `decisions` are `['redispatch', 'halt']`, so there is no `accept` to route the branch to implement.
- **Redispatch.**
  - The controller writes `.nmg-sdlc/verification/selection-guidance-<N>.json` for the current head.
  - It forces verify with `needsImplement = false`.
  - It dispatches on the `verify` entry: `repairDispatch` exempts `selection_escalation`.
- **Unsupervised.** The run stops with `selection_escalation: <summary>`.
- **Top-of-loop re-check.** When the failing gate artifact's `selection.rejection` is non-null, `currentGateFailure` reports `selection_escalation` and does not set `needsImplement`.

### Repository smoke (`steering/extensions/nmg-sdlc-smoke.mjs`, `steering/snippets/project-smoke.md`)

**Provider.** It reads `request.selection.surfaces`.
- **Interactive surface** (`draft-issue`, `write-spec`, `onboard-project`, `upgrade-project`, `steering`, `run-retro`):
  - It requires `.nmg-sdlc/smoke/surfaces/<surface>.json`, `{ schemaVersion: 1, repo: "Nunley-Media-Group/nmg-sdlc-smoke", surface, headSha, status: "passed", command, transcript, issue? }`.
  - `headSha` must equal `request.identity.headSha`, and `transcript` must be a non-empty file under `.nmg-sdlc/smoke/surfaces/`.
  - `draft-issue` and `write-spec` records name `issue`. `write-spec` additionally passes the existing `publishedSpec` check.
  - A missing, stale or failed record → `failed`, `nmg-sdlc-smoke surface not exercised: <surface>`.
- **`execute` selected:** the existing provisioned delivery and its exact-head merge and closure checks.
- **Evidence:** one entry per exercised surface.

**Snippet.**
- After running `--mode select`, the worker drives each selected interactive surface in tmux against a fresh clone. It answers dialogs, approves the plan, and writes the record and pane transcript.
- When `draft-issue` or `write-spec` is selected, a fresh issue is provisioned. When only `execute` is selected, the recorded issue may be reused.
- Provisioning runs only when `execute`, `draft-issue` or `write-spec` is selected.

### Onboard and upgrade (`scripts/verification-scope.mjs`, new; `scripts/sdlc-upgrade.mjs`)

**`detectVerificationScope(root)`** returns no item when every finding is clear. Otherwise it returns:
- `id`: `verification-scope:<sha256>`
- `kind`: `verification-scope`
- `actionable`: `true`
- `findings`: a list of codes, each followed by the condition that raises it:
  - `selection_missing`: no top-level `selection`.
  - `doc_paths_missing`: `selection` has no `docPaths`.
  - `selection_command_legacy`: a validation's `selection` is an object.
  - `test_coverage_missing` / `test_coverage_invalid`: there is a `builtin.command` validation and the config is absent or invalid.
  - `surfaces_missing`: no `surfaces` map.
  - `unaccounted_paths`: `git ls-files` paths matched by no `coveragePaths`, surface, `docPaths` or `fallbackPaths` glob. The paths are listed.
- `pluginProject`: whether `.claude-plugin/plugin.json` exists.

The digest covers the bytes of `steering/manifest.json` and `steering/test-coverage.json` (or absent markers) and the sorted tracked paths.

**`applyVerificationScope(root, item, proposal)`**
- The digest must still match, otherwise it fails `verification_scope_plan_stale` before any write.
- `proposal` is a JSON file of `{ selection, surfaces, optIn: [validation ids], testCoverage? }`. Apply:
  1. Converts each legacy command `selection` to `true` (and sets `tier: "change"` when absent) on each `optIn` validation.
  2. Writes the top-level `selection` and `surfaces`.
  3. Writes `steering/test-coverage.json` when given.
  4. Re-loads the manifest with `loadSteeringRuntime`, restoring the original bytes on failure.
- The CLI is `verification-scope.mjs detect --root .` and `apply --root . --approve <id> --proposal <file>`.

**Upgrade wiring.**
- `detectUpgrade` pushes the item.
- `applyUpgrade` dispatches `verification-scope` at priority `10.83`, with the proposal file passed via `--scope-proposal`.

**Workflows.**
- `/sdlc-upgrade-project` and `/sdlc-onboard-project` (brownfield and greenfield) run `detect`.
- In plan mode, the agent derives the proposal from the project's structure:
  - Plugin: one surface per command, agent and hooks module.
  - Otherwise: features, entry points and non-code assets.
  - The coverage command is stack-appropriate and emits #572's report.
- The plan shows the full proposal and the exact `apply` argv. After approval, the agent writes the proposal to `.nmg-sdlc/plans/verification-scope.json` and runs `apply`.

### Repository adoption

**`scripts/jest-per-test-coverage.mjs` (new).**
- Arguments are repository-relative test file paths.
- For each file, it runs Jest from `scripts/` with `--runInBand --coverage --coverageProvider=v8 --coverageReporters=json --json`, using `node --experimental-vm-modules`, into a temporary directory.
- It prints `{ version: 1, tests, executableLines }`:
  - test `id` and `file` are the repository-relative path;
  - `lines` and `branches` are repository-relative `path:N` / `path:N:K` entries with a count above 0;
  - `outcomes` are `<file>::<full name>:<status>`;
  - `executableLines` comes from the statement maps.

**`steering/test-coverage.json`.**
- `suite`: `{ program: "npm", args: ["--prefix", "scripts", "test", "--", "--runInBand"] }`
- `coverage`: `{ program: "node", args: ["scripts/jest-per-test-coverage.mjs"] }`

**`steering/manifest.json`.**
- `repository.tests` gets `tier: "change"` and `selection: true`.
- `selection.docPaths`: `README.md`, `CHANGELOG.md`, `CONTRIBUTING.md`, `CLAUDE.md`, `LICENSE`, `VERSION`, `docs/**`, `specs/**`.
- `selection.fallbackPaths`: `hooks/**`, `.claude-plugin/**`, `package.json`, `tsconfig.json`, `.gitignore`, `scripts/package.json`, `scripts/package-lock.json`, `steering/manifest.json`, `steering/extensions/**`.
- `selection.coveragePaths`: `src/**/*.mjs`, `scripts/*.mjs`.
- `surfaces`:

  | Surface | Sources | Bound to smoke |
  |---------|---------|----------------|
  | `draft-issue` | `workflows/draft-issue/**` | yes |
  | `write-spec` | `workflows/write-spec/**`, `scripts/publish-approved-spec.mjs` | yes |
  | `onboard-project` | `workflows/onboard-project/**` | yes |
  | `upgrade-project` | `workflows/upgrade-project/**`, `workflows/migrate-project/**`, `scripts/sdlc-upgrade.mjs`, `scripts/verification-scope.mjs` | yes |
  | `steering` | `workflows/steering/**`, `scripts/sdlc-steering.mjs` | yes |
  | `run-retro` | `workflows/run-retro/**` | yes |
  | `execute` | `workflows/execute/**`, `workflows/start-issue/**`, `workflows/write-code/**`, `workflows/verify-code/**`, `workflows/open-pr/**`, `workflows/address-pr-comments/**`, `workflows/simplify/**`, `agents/**`, `commands/sdlc-verify-code.md`, `commands/sdlc-open-pr.md`, `scripts/sdlc-execute*.mjs`, `scripts/sdlc-deliver.mjs`, `scripts/sdlc-review.mjs`, `scripts/sdlc-finalize-verification.mjs`, `src/execute-host.mjs` | yes |
  | `status` | `workflows/status/**`, `commands/sdlc-status.md` | no |
  | `verify-full` | `workflows/verify-full/**`, `commands/sdlc-verify-full.md` | no |
  | `plugin-host` | `hooks/**`, `.claude-plugin/**` | no |
  | `shared-references` | `references/**` | no |
  | `project-steering` | `steering/**` | no |
  | `script-assets` | `scripts/__fixtures__/**`, `scripts/**/*.json`, `scripts/**/*.sh` | no |
  | `ci` | `.github/**` | no |

## API / Interface Changes

| Interface | Input | Output / Error | Behavior |
|-----------|-------|----------------|----------|
| manifest `selection` (top level) | `{ docPaths?, fallbackPaths?, coveragePaths? }` | invalid → `steering_manifest_invalid` (`selection`); command form → `steering_validation_invalid` (`selection takes a prompt…`) | Enables prompt-driven selection |
| manifest `validations[].selection` | `true` | command or other value → `steering_validation_invalid` (`selection`) | Opts a change-tier `builtin.command` into selected tests |
| manifest `surfaces` | `[{ id, sources, validations? }]` | invalid → `steering_manifest_invalid` (`surfaces`) | Required surfaces, and validation binding |
| `steering/sdlc-models.json` `selection` | `{ model, effort }` | `StageModelsError` with the existing format | Selection model; default `haiku` / `xhigh` |
| prompt consumer `gate:selection` | plugin fragment plus project snippets | `renderPrompt` errors unchanged | Selection prompt |
| coverage report | optional `executableLines: ["path:N"]` | invalid entries → report invalid | Changed executable lines |
| provider request | adds `changedPaths`, `selection: { mode, reason, surfaces }` | — | Scoped providers |
| `sdlc-verify-steering.mjs --mode select` | existing options | `{ ok, selection }` | Stores the selection for gate reuse |
| verify handoff | `reasonCode: 'selection_escalation'`, `escalation` | — | Stage report with `redispatch` / `halt` |
| `verification-scope.mjs detect` / `apply` | `--root`, `--approve`, `--proposal` | `verification_scope_plan_stale` | Onboard and upgrade fix |

## Data / Storage Changes

- `.nmg-sdlc/verification/selection-<N>.json`: the stored selection with its binding (runtime state, git-ignored).
- `.nmg-sdlc/verification/selection-guidance-<N>.json`: head-bound redispatch guidance.
- `.nmg-sdlc/smoke/surfaces/<surface>.json` and `.log`: interactive surface evidence (this repository).
- The gate artifact gains top-level `selection`. Per-result entries may gain `coverage`.

## Alternatives Considered

| Option | Decision | Reason |
|--------|----------|--------|
| A per-project prompt file path or inline prompt | Rejected | A bundled registry fragment works everywhere. Projects extend it with existing `snippets[]` |
| The smoke provider drives interactive commands itself | Rejected | It would add tmux and an LLM driver to the provider. The worker already drives provisioning in tmux |
| Selection resolved per validation (today) | Rejected | One call per gate run keeps tests and surfaces consistent and never blocks a concurrent batch |
| Failing changed comment lines without `executableLines` data | Rejected | The optional `executableLines` lets a coverage tool exclude non-code lines |
| Routing rejections to implement | Rejected | A selection gap is not a code defect. The supervising session supplies guidance instead |

## Change History

| Issue | Date | Summary |
|-------|------|---------|
| #584 | 2026-11-19 | Initial feature design |
