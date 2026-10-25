# Defect Report: steering-v4-host-language rewrites Oh My Pi prose into contradictory steering

**Issue**: #487
**Date**: 2026-10-25
**Status**: Approved
**Author**: NMG

## Reproduction

1. Register a steering snippet `steering/snippets/project-product.md` that contains the line `It is not a Codex or Oh My Pi plugin.` and no other v3 host token.
2. Run `node scripts/sdlc-upgrade.mjs detect --root .`.
3. Observe the `steering-v4-host-language` item.

## Expected vs Actual

| | Description |
|---|-------------|
| **Expected** | Snippet prose containing `Oh My Pi` or whole-word `OMP` is never rewritten. Each such line is listed as a report-only prose finding on the category, and prose findings alone never make the category actionable. Mapped command tokens and the validation `config.program` / `config.args` mapping are still rewritten. |
| **Actual** | Detection reports an actionable `steering-v4-host-language` item that rewrites the line to `It is not a Codex or Claude Code plugin.` |

## Acceptance Criteria

### AC1: Prose host names are not rewritten

**Given** a registered snippet whose only v3 reference is the prose `It is not a Codex or Oh My Pi plugin.`
**When** upgrade detection runs
**Then** no actionable `steering-v4-host-language` item is reported, and the line is listed as a report-only prose finding with its file and line number

### AC2: Applying the category leaves prose byte-for-byte

**Given** a registered snippet containing both `herdr integration install omp` and the prose `Oh My Pi and OMP agree`
**When** the approved `steering-v4-host-language` category applies
**Then** the token becomes `herdr integration install claude`, and the prose line `Oh My Pi and OMP agree` is unchanged

### AC3: Validation config mapping is preserved

**Given** a manifest validation with `config.program` `omp` and `config.args` containing `--print`
**When** the approved category applies
**Then** `config.program` is `claude` and the argument is `-p`

### AC4: Contract documentation matches behavior

**Given** the upgrade-project workflow and the v3-detectors reference
**When** the contract tests run
**Then** step 12a and the v4 detector reference describe token and validation mapping plus report-only prose findings, with no `Oh My Pi` / `OMP` → `Claude Code` prose substitution

## Functional Requirements

| ID | Requirement | Priority |
|----|-------------|----------|
| FR1 | Remove the `Oh My Pi` / `\bOMP\b` prose substitution from snippet rewriting | Must |
| FR2 | Report snippet lines containing `Oh My Pi` or whole-word `OMP` as non-actionable prose findings on the category | Must |
| FR3 | Keep command-token and validation-config mapping unchanged | Must |
| FR4 | Update `workflows/upgrade-project/WORKFLOW.md` step 12a, `workflows/upgrade-project/references/v3-detectors.md`, and affected tests to the new contract | Must |

## Out of Scope

- `agents-v4-host-language` and `contributing-v4-host-language` exact-sentence rewrites
- Rewriting prose outside registered steering snippets

## Change History

| Issue | Date | Summary |
|-------|------|---------|
| #487 | 2026-10-25 | Initial defect report |
