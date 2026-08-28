# Tasks: Materialize packaged controller paths across hosts

**Issue**: #311
**Date**: 2026-08-28
**Status**: Approved
**Author**: NMG
**Related Spec**: specs/266-fix-controller-path-rewriting-of-project-commands/
---

## Summary

| Phase | Tasks | Status |
|-------|-------|--------|
| Materialization | 1 | [ ] |
| Packaged surfaces | 1 | [ ] |
| Regression coverage | 1 | [ ] |
| Verification | 1 | [ ] |
| **Total** | 4 | |

---

### T001: Recognize foreign plugin-controller operands

**File(s)**: `scripts/plugin-controller-path.mjs`
**Type**: Modify
**Depends**: None
**Acceptance**:
- [ ] `materializeControllerPaths` and `materializeAvailableControllerPaths` keep their current signatures and callsites
- [ ] The shared private policy recognizes canonical tokens plus POSIX and Windows/UNC absolute operands whose final segments are exactly `nmg-sdlc/scripts/<valid-name>.mjs`
- [ ] Both foreign path syntaxes are recognized independently of the current host OS
- [ ] Recognized basenames resolve only through `resolvePluginController` under the supplied active package root and emit via `JSON.stringify`
- [ ] Existing arguments, punctuation, quoting boundaries, and surrounding text are preserved
- [ ] Project-local relative and absolute paths remain byte-for-byte unchanged
- [ ] Strict missing-controller resolution still throws `controller_unresolved` with exit code 2; best-effort context still preserves unresolved owned references

### T002: Restore canonical packaged workflow sources

**File(s)**: `workflows/apply-review/WORKFLOW.md`, `workflows/execute/WORKFLOW.md`, `workflows/execute/references/selection.md`, `workflows/onboard-project/WORKFLOW.md`, `workflows/onboard-project/references/brownfield.md`, `workflows/open-pr/WORKFLOW.md`, `workflows/review-main/WORKFLOW.md`, `workflows/start-issue/WORKFLOW.md`, `workflows/status/WORKFLOW.md`, `workflows/steering/WORKFLOW.md`, `workflows/upgrade-project/WORKFLOW.md`, `workflows/upgrade-project/references/v3-detectors.md`, `workflows/verify-code/WORKFLOW.md`, `workflows/verify-code/checklists/report-template.md`, `workflows/verify-code/references/exercise-testing.md`, `workflows/write-spec/WORKFLOW.md`, `workflows/write-spec/references/publish.md`, `references/pr-dependent-verification.md`, `commands/sdlc-execute.md`, `commands/sdlc-open-pr.md`, `commands/sdlc-status.md`, `commands/sdlc-verify-code.md`
**Type**: Modify
**Depends**: None
**Acceptance**:
- [ ] Resolve and read `skill://skill-creator` before editing each of the 11 affected workflow bundles and the shared root reference, then follow its validation procedure
- [ ] Every contributor-host nmg-sdlc controller path in the listed workflow sources becomes the exact `<plugin-root>/scripts/<name>.mjs` form
- [ ] Controller basenames, arguments, option ordering, code-fence examples, and workflow behavior remain unchanged
- [ ] All four automated command files are regenerated with `renderAutomatedCommandMarkdown` and are byte-identical to their sources
- [ ] No historical spec, verification evidence, project-owned command, Herdr contract, handoff schema, or delivery behavior is changed

### T003: Cover cross-host materialization and artifact neutrality

**File(s)**: `scripts/__tests__/plugin-controller-path.test.mjs`, `scripts/__tests__/extension-commands.test.mjs`, `scripts/__tests__/sdlc-execute.test.mjs`
**Type**: Modify
**Depends**: T001, T002
**Acceptance**:
- [ ] Disposable-package tests materialize foreign POSIX and Windows controller operands to the current host's active package root on every platform
- [ ] Tests prove trailing argv and surrounding command text are unchanged
- [ ] Tests preserve `node scripts/check-gate.mjs` plus project-owned POSIX and Windows absolute script paths byte-for-byte
- [ ] A recognized missing foreign controller fails strict materialization with `controller_unresolved` and no cwd fallback
- [ ] Extension runtime-message coverage rewrites an available foreign controller and preserves both project-local commands and unresolved examples
- [ ] The active `commands/` and `workflows/` audit rejects cwd-relative dispatch, and the active `commands/`, `workflows/`, and shared `references/` audit rejects host-absolute nmg-sdlc controller dispatch
- [ ] Automated command synchronization remains byte-for-byte
- [ ] Worker-prompt coverage emits only active-root controller paths and preserves worker names, handoff validation, prompt provenance, and controller arguments

### T004: Verify focused, repository, and installed behavior

**File(s)**: implementation and verification evidence
**Type**: Verify
**Depends**: T003
**Acceptance**:
- [ ] `cd scripts && npm test -- --runInBand __tests__/plugin-controller-path.test.mjs __tests__/extension-commands.test.mjs __tests__/sdlc-execute.test.mjs` exits 0
- [ ] `cd scripts && npm test -- --runInBand` exits 0
- [ ] `node scripts/skill-inventory-audit.mjs --check` exits 0
- [ ] `node scripts/verify-plugin-surface.mjs --root . --label repository` exits 0
- [ ] The mandatory live smoke `node scripts/exercise-omp.mjs --cwd <fresh nmg-sdlc-smoke clone> -- /sdlc-status --json` exits 0 and returns JSON whose `nextAction.command` starts with `/sdlc-`
- [ ] On Windows, a candidate package installed through OMP into a disposable plugin home materializes a packaged POSIX execute-controller operand to that installed root; invoking the materialized execute controller from a consumer project reaches controller startup without `MODULE_NOT_FOUND` and emits no contributor-host path
- [ ] Verification records one-to-one evidence for all five Gherkin scenarios

---

## Validation Checklist

- [x] Each task has one responsibility.
- [x] Dependencies form an acyclic implementation order.
- [x] File paths match the current repository structure.
- [x] Every acceptance criterion has deterministic or installed-surface evidence.
- [x] No task changes project command resolution or delivery semantics.
