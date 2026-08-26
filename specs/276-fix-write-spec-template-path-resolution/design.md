# Root Cause Analysis: Fix write-spec template path resolution

**Issue**: #276
**Date**: 2026-08-26
**Status**: Approved
**Author**: NMG

---

## Root Cause

`workflows/write-spec/WORKFLOW.md` tells the executing agent to use `templates/`. OMP presents the workflow body as rendered prompt content rather than preserving a filesystem-relative execution context for every later read. The read tool therefore resolves that ambiguous path from the installed package root, producing `<plugin-root>/templates`, which does not exist.

The templates are correctly packaged under their owning workflow at `workflows/write-spec/templates/`. The defect is the prompt contract, not package contents or installation. Explicit package-root-relative paths match other packaged controller references and remain stable in source and installed layouts.

### Affected Code

| File | Role |
|------|------|
| `workflows/write-spec/WORKFLOW.md` | Directs runtime template reads. |
| `workflows/write-spec/references/defect-variant.md` | Directs defect-template reads. |
| `scripts/__tests__/interactive-plan-contract.test.mjs` | Guards interactive write-spec prompt behavior. |
| `CHANGELOG.md` | Records the user-visible correction. |

### Triggering Conditions

- The workflow reaches template loading.
- The agent resolves `templates/` from the plugin package root rather than the workflow directory.
- The installed package has no root-level `templates/` directory.

## Fix Strategy

### Approach

Name each template with its complete package-root-relative path: `workflows/write-spec/templates/requirements.md`, `design.md`, `tasks.md`, and `feature.gherkin`. Keep the existing files in their owning bundle and avoid a duplicate root directory or runtime resolver.

Extend the existing interactive-plan contract test because it already owns write-spec workflow assertions. Assert all four explicit paths and the absence of the obsolete `Use templates from templates/` instruction.

### Changes

1. Update `workflows/write-spec/WORKFLOW.md` and `workflows/write-spec/references/defect-variant.md` with explicit packaged paths.
2. Add focused prompt-contract assertions in `scripts/__tests__/interactive-plan-contract.test.mjs`.
3. Record the correction and synchronized patch version in `CHANGELOG.md`, `VERSION`, and `package.json`.

## Steering Alignment

- Product steering: restores the `/sdlc-write-spec` pipeline and dogfoods the changed skill through contract and exercise checks.
- Technical steering: keeps workflow templates under the owning bundle and verifies executable Markdown behavior.
- Structure steering: preserves `workflows/{name}/templates/` ownership and adds no second convention.

## Failure Behavior

A missing packaged template continues to fail visibly through the read tool. The correction removes only the incorrect root lookup; it does not add fallback content or suppress missing-path errors.

## Verification

- Focused Jest contract for the exact rendered workflow paths.
- `skill-creator` validation for `workflows/write-spec/`.
- Write-spec skill exercise if the repository provides one.
- Plugin-surface, current-spec, steering, and contribution gates.

## Change History

| Issue | Date | Summary |
|-------|------|---------|
| #276 | 2026-08-26 | Initial bug-fix design |
