# Tasks: Scope the pre-merge gate's tests and smoke to the change with a Claude selection checked by coverage and a surface map

**Issue**: #584
**Date**: 2026-11-19
**Status**: Approved
**Author**: Claude Code
**Related Spec**: specs/551-add-parallel-delivery-with-worktree-isolation-a-merge-queue-change-scoped-validation-tiers-and-one-pass-verification/

## Implementation Tasks

### T001: Add the selection model entry

**File(s)**: `src/stage-models.mjs`, `scripts/sdlc-models.mjs`
**Type**: Modify
**Depends**: none
**Acceptance**:
- `steering/sdlc-models.json` accepts an optional `selection: { model, effort }`, validated with the existing model and effort rules.
- Its absence is never reported in `missing`.
- `selectionModel(config)` returns the entry, or `{ model: 'haiku', effort: 'xhigh' }`.
- Invalid values throw the existing `steering/sdlc-models.json: selection.<key> = <value>: <reason>` diagnostic (AC2, FR3).

### T002: Replace the command-form selection in the steering schema

**File(s)**: `src/sdlc-steering-runtime.mjs`, `src/sdlc-glob.mjs`
**Type**: Modify, Create
**Depends**: none
**Acceptance**:
- The top-level `selection` (`docPaths`, `fallbackPaths`, `coveragePaths`) and `surfaces` (`id`, `sources`, `validations`) are validated as described in design.md.
- A validation-level `selection: true` is accepted only on a change-tier `builtin.command` validation when the top-level `selection` exists.
- A command-form `selection`, whether on a validation or at the top level, fails with `steering_validation_invalid` naming `selection`, and the message says selection takes a prompt (AC3, FR1, FR5).
- The glob helpers are exported from `src/sdlc-glob.mjs` and reused by the verification runtime.

### T003: Bundle the selection prompt

**File(s)**: `src/sdlc-prompt-snippets.mjs`, `workflows/verify-code/references/selection-prompt.md`
**Type**: Modify, Create
**Depends**: none
**Acceptance**:
- `gate:selection` is an allowed consumer.
- `plugin.gate.selection` renders the bundled, stack-agnostic prompt. Project snippets routed to `gate:selection` are appended in registry order (FR2).
- The prompt file is written after invoking the `skill-creator` skill with the `Skill` tool.

### T004: Accept executableLines in the coverage report

**File(s)**: `scripts/test-coverage.mjs`
**Type**: Modify
**Depends**: none
**Acceptance**:
- `validateCoverageReport` accepts an optional top-level `executableLines`: an array of `path:N` strings.
- Invalid entries make the report invalid.
- Reports without the field validate as before (FR4).

### T005: Implement the selection resolver

**File(s)**: `src/sdlc-test-selection.mjs`
**Type**: Create
**Depends**: T001, T002, T003
**Acceptance**:
- `resolveChangeSelection`:
  - matches fallback paths first, without calling Claude;
  - renders the `gate:selection` prompt with the base ref, changed paths, the capped diff, the surfaces and any head-bound guidance;
  - calls `claude -p` with the selection model and effort, structured JSON output, no tools and a 300 000 ms timeout;
  - validates the bounded answer.
- It maps failures to `selection_failed` and `all` to `selection_all`.
- It computes `requiredSurfaces`.
- It stores and reuses `.nmg-sdlc/verification/selection-<N>.json` by binding.
- `runSelection` is injectable (AC1, AC2, AC7, AC9, FR2, FR9).

### T006: Apply the selection and its checks in the gate

**File(s)**: `src/sdlc-verification-runtime.mjs`
**Type**: Modify
**Depends**: T004, T005
**Acceptance**:
- On a change-tier run with a top-level `selection`, the selection resolves once before Phase 1.
- Opted-in validations run the selected tests, or pass with `selection_empty`. In `all` mode they run in full.
- Surface-bound validations record `surface_not_selected` when no bound surface is selected.
- Provider requests carry `changedPaths` and `selection: { mode, reason, surfaces }` (AC1, AC5a, AC8, AC9, FR10).
- The checks apply as follows:
  - `selection_surface_missing` and `selection_empty_code_change` are rejected before anything runs;
  - the coverage check runs the #572 coverage command with the selected tests and records `coverage: { changedLines, hitLines, uncovered }`;
  - `selection_uncovered` and `selection_unaccounted` mark the affected results `failed`, naming the lines, surfaces or paths (AC4, AC5, AC6, AC7, FR4–FR8).
- The artifact records `selection` with the prompt provenance, model, effort, reason, tests, surfaces, `requiredSurfaces`, `guidanceSupplied` and `rejection`.
- An invalid models file gives `runtimeError` `stage_models_invalid`.
- Full-tier runs and manifests without `selection` behave as before.

### T007: Add the select mode to the verify CLI

**File(s)**: `scripts/sdlc-verify-steering.mjs`
**Type**: Modify
**Depends**: T006
**Acceptance**:
- `--mode select` resolves and stores the selection, and prints `{ ok: true, selection }` without running any validation.
- The next gate run with an unchanged binding reuses the stored selection without calling Claude (AC1, FR2).

### T008: Report selection escalations from the finalizer

**File(s)**: `scripts/sdlc-finalize-verification.mjs`
**Type**: Modify
**Depends**: T006
**Acceptance**:
- An artifact with a non-null `selection.rejection` produces the following failed handoff: `reasonCode: 'selection_escalation'`, `intervention: false`, `next: 'verify'`, and `escalation: { kind: 'selection', reasonCode, uncovered, missingSurfaces, unaccounted }` (AC7, FR7).

### T009: Present selection escalations and carry redispatch guidance

**File(s)**: `scripts/sdlc-execute.mjs`
**Type**: Modify
**Depends**: T008
**Acceptance**:
- A supervised verify stage report for `selection_escalation` carries `escalation`, and only `redispatch` and `halt` are offered.
- A redispatch writes `.nmg-sdlc/verification/selection-guidance-<N>.json` for the current head, then reruns verify on the `verify` entry without implement.
- Unsupervised runs stop with `selection_escalation`.
- `currentGateFailure` never routes a selection rejection to implement (AC7, FR7).

### T010: Scope this repository's smoke to the selected surfaces

**File(s)**: `steering/extensions/nmg-sdlc-smoke.mjs`, `steering/snippets/project-smoke.md`
**Type**: Modify
**Depends**: T006
**Acceptance**:
- The provider requires a passed, head-bound `.nmg-sdlc/smoke/surfaces/<surface>.json` record with a non-empty transcript for each selected interactive surface. `write-spec` records also pass `publishedSpec`.
- It runs the full provisioned delivery only when `execute` is selected, and lists each exercised surface's evidence.
- The provider still runs only git, gh and claude (AC10, FR11).
- The snippet directs the verify worker as follows:
  - run `--mode select`, then drive each selected interactive surface in tmux against a fresh clone;
  - write the records;
  - provision a fresh issue when `draft-issue` or `write-spec` is selected;
  - provision only when `execute`, `draft-issue` or `write-spec` is selected.

### T011: Detect and apply verification-scope configuration

**File(s)**: `scripts/verification-scope.mjs`, `scripts/sdlc-upgrade.mjs`
**Type**: Create, Modify
**Depends**: T002
**Acceptance**:
- `detectVerificationScope` reports the `selection_missing`, `doc_paths_missing`, `selection_command_legacy`, `test_coverage_missing`/`test_coverage_invalid`, `surfaces_missing` and `unaccounted_paths` findings in a digest-bound `verification-scope:<sha256>` item, plus `pluginProject`.
- `applyVerificationScope` refuses a stale digest with `verification_scope_plan_stale` before writing, applies the proposal, converts legacy command selections, re-validates, and restores on failure.
- `detectUpgrade` and `applyUpgrade` include the item (priority `10.83`, `--scope-proposal`).
- A repeat detect after apply yields no item (AC11, FR12).

### T012: Update the workflows

**File(s)**: `workflows/verify-code/WORKFLOW.md`, `workflows/execute/WORKFLOW.md`, `workflows/upgrade-project/WORKFLOW.md`, `workflows/upgrade-project/references/`, `workflows/onboard-project/`, `commands/sdlc-verify-code.md`
**Type**: Modify
**Depends**: T007, T009, T011
**Acceptance**:
- verify-code: the gate phase runs `--mode select` before the gate. It describes the selection, the checks and the `selection_escalation` handoff, and drops the command-form selection text.
- execute: describes the selection escalation report and its redispatch guidance.
- upgrade-project and onboard-project: run `verification-scope.mjs detect`, derive the structure-based proposal (plugin versus non-plugin) in the plan with the exact `apply` argv, and apply only after approval (FR12, FR14).
- `commands/sdlc-verify-code.md` is regenerated through `renderAutomatedCommandMarkdown`, not hand-edited.
- Each workflow and reference edit is made after invoking the `skill-creator` skill with the `Skill` tool.

### T013: Add the Jest per-test coverage command

**File(s)**: `scripts/jest-per-test-coverage.mjs`, `steering/test-coverage.json`
**Type**: Create
**Depends**: T004
**Acceptance**:
- Given repository-relative test files, the script prints a valid report: `{ version: 1, tests, executableLines }`, with repository-relative `lines`, `branches` and `outcomes` for each test file.
- `steering/test-coverage.json` declares `suite` and this `coverage` command (AC12, FR13).

### T014: Adopt scoped verification in this repository's manifest

**File(s)**: `steering/manifest.json`, `steering/snippets/project-tech.md`
**Type**: Modify
**Depends**: T002, T010, T013
**Acceptance**:
- The manifest declares the top-level `selection` (`docPaths`, `fallbackPaths`, `coveragePaths`) and the `surfaces` map from design.md.
- `repository.tests` is `tier: "change"` with `selection: true`.
- The seven smoke surfaces bind `repository.nmg-sdlc-smoke`.
- `project-tech.md` describes scoped selection, the checks, escalation and surface-scoped smoke in its verification and smoke sections.
- `verification-scope.mjs detect` on the repository root reports no item (AC12, FR13, FR14).

### T015: Document the behavior

**File(s)**: `references/steering-schema.md`, `README.md`, `CHANGELOG.md`
**Type**: Modify
**Depends**: T006, T011
**Acceptance**:
- The schema reference describes `selection`, `surfaces`, `selection: true`, the `gate:selection` prompt, the selection model, `executableLines`, the checks and their reason codes, escalation and `surface_not_selected`, and no longer documents the command form.
- README's validation-tiers and live-smoke sections describe the same behavior.
- `CHANGELOG.md` `[Unreleased]` bullets end with `(#584)` (FR14).
- The reference edit is made after invoking the `skill-creator` skill with the `Skill` tool.

### T016: Test the schema, model and selection resolver

**File(s)**: `scripts/__tests__/validation-tiers.test.mjs`, `scripts/__tests__/sdlc-models.test.mjs`, `scripts/__tests__/test-selection.test.mjs`
**Type**: Modify, Create
**Depends**: T005
**Acceptance**:
- AC1: an injected `runSelection` receives the rendered prompt (including a project `gate:selection` snippet), the base ref, the changed paths, the diff and the surface ids. A `selected` answer appends the tests to the opted-in validation's args, and the artifact `selection` records the provenance, model, effort, reason, tests and surfaces.
- AC2: the configured `selection` model and effort reach the call. Without the entry, the call uses `haiku`/`xhigh`. `selection.effort: "huge"` fails with the `steering/sdlc-models.json: selection.effort = "huge"` diagnostic.
- AC3: a command-form `selection`, on a validation and at the top level, fails with `steering_validation_invalid` naming `selection` and saying selection takes a prompt.
- AC9: a fallback path skips the call. A non-zero exit, a timeout, malformed output and `all` each run the full command with their reason, and providers receive every surface.
- `cd scripts && npm test` exits 0.

### T017: Test the gate checks and surface binding

**File(s)**: `scripts/__tests__/test-selection-gate.test.mjs`
**Type**: Create
**Depends**: T006, T007
**Acceptance**:
- AC4: with a fake coverage command, an uncovered changed executable line rejects as `selection_uncovered` and records `coverage`. Without `executableLines`, a changed blank line is ignored. A fully covered change passes.
- AC5: omitting a surface whose sources match a changed path rejects as `selection_surface_missing`. An extra surface is allowed.
- AC5a: a bound validation with no selected surface passes as `surface_not_selected` without running, and runs with `request.selection.surfaces` when one is selected. Unbound validations run.
- AC6: a path outside coverage, the selected surfaces, `docPaths` and `fallbackPaths` rejects as `selection_unaccounted`, naming the path.
- AC8: a docs-only empty selection passes with `selection_empty` and providers get `[]`. An empty selection with a code path rejects as `selection_empty_code_change`. Without `docPaths`, nothing is docs-only.
- `--mode select` then a gate run with the same binding calls `runSelection` once.

### T018: Test escalation routing and guidance

**File(s)**: `scripts/__tests__/sdlc-finalize-verification.test.mjs`, `scripts/__tests__/sdlc-execute.test.mjs`
**Type**: Modify
**Depends**: T008, T009
**Acceptance**:
- AC7: a rejected artifact finalizes to `selection_escalation` with `escalation`.
- The supervised stage report offers only `redispatch` and `halt`.
- `redispatch --text "check hooks tests"` reruns verify (not implement) on the verify entry, and the rerun's selection prompt contains the guidance, with `guidanceSupplied: true`.
- An unsupervised run stops with `selection_escalation`.

### T019: Test surface-scoped smoke

**File(s)**: `scripts/__tests__/nmg-sdlc-smoke.test.mjs`, `scripts/__tests__/steering-contract.test.mjs`
**Type**: Modify
**Depends**: T010
**Acceptance**:
- AC10: with injected commands:
  - selected interactive surfaces with head-bound passed records pass and list their evidence;
  - a missing or stale record fails with `nmg-sdlc-smoke surface not exercised: <surface>`;
  - `execute` alone runs exactly one delivery;
  - an interactive-only selection runs no delivery.
- The provider runs only git, gh and claude.
- The snippet contract test requires the select, surface-record and conditional-provisioning instructions.

### T020: Test onboard/upgrade detection and repository adoption

**File(s)**: `scripts/__tests__/verification-scope.test.mjs`, `scripts/__tests__/repository-surfaces.test.mjs`
**Type**: Create
**Depends**: T011, T012, T013, T014, T015
**Acceptance**:
- AC11:
  - Temp projects (plugin and non-plugin) report each finding.
  - `apply` with a stale digest fails with `verification_scope_plan_stale` without writing.
  - An approved proposal converts a legacy command selection, writes `selection`, `surfaces` and `steering/test-coverage.json`, and a repeat detect proposes nothing.
  - The onboard and upgrade workflow texts contain the `verification-scope.mjs detect` and `apply` commands.
- AC12:
  - Every `git ls-files` path under `workflows/`, `agents/`, `references/`, `commands/`, `hooks/` and `.claude-plugin/` matches at least one manifest surface.
  - The manifest opts `repository.tests` into selection.
  - `steering/test-coverage.json` validates.
  - `jest-per-test-coverage.mjs` on one test file prints a valid report with `executableLines`.
  - `verification-scope.mjs detect` on the repository root reports no item.
  - The schema reference, README and `project-tech.md` mention `gate:selection`, `selection_escalation` and `surface_not_selected`.
- `cd scripts && npm test` exits 0.

## Change History

| Issue | Date | Summary |
|-------|------|---------|
| #584 | 2026-11-19 | Initial feature tasks |
