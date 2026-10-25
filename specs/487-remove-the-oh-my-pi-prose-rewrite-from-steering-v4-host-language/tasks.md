# Tasks: steering-v4-host-language rewrites Oh My Pi prose into contradictory steering

**Issue**: #487
**Date**: 2026-10-25
**Status**: Approved
**Author**: NMG

## Implementation Tasks

### T001: Stop rewriting prose and report it instead

**File(s)**: `scripts/sdlc-upgrade.mjs`
**Type**: Modify
**Depends**: none
**Acceptance**:
- AC1/FR1/FR2: a snippet whose only v3 reference is `It is not a Codex or Oh My Pi plugin.` yields a `steering-v4-host-language` item with `actionable: false` and `proseFindings` containing its file and line number, and no occurrence rewrites the line
- AC2: applying the category to a snippet with `herdr integration install omp` and `Oh My Pi and OMP agree` rewrites the token to `herdr integration install claude` and leaves the prose line byte-for-byte
- AC3/FR3: validation `config.program` `omp` becomes `claude` and `--print` becomes `-p`
- Applying a category that has no token or validation occurrences returns `already-current` and writes nothing

### T002: Update the upgrade contract documentation

**File(s)**: `workflows/upgrade-project/WORKFLOW.md`, `workflows/upgrade-project/references/v3-detectors.md`, `workflows/upgrade-project/references/detection.md`, `workflows/upgrade-project/references/upgrade-procedures.md`, `CHANGELOG.md`
**Type**: Modify
**Depends**: T001
**Acceptance**:
- AC4/FR4: step 12a and the v4 detector, detection, and procedure references describe token and validation mapping plus report-only `proseFindings`, and contain no `Oh My Pi` / `OMP` → `Claude Code` prose substitution
- Workflow edits are made after invoking the `skill-creator` skill
- `CHANGELOG.md` `[Unreleased]` has a `### Fixed` entry for #487

### T003: Regression coverage

**File(s)**: `scripts/__tests__/sdlc-upgrade.test.mjs`, `scripts/__tests__/upgrade-v4-host-language-contract.test.mjs`
**Type**: Modify
**Depends**: T001, T002
**Acceptance**:
- AC1: a `steering-v4-host-language` test with the snippet `It is not a Codex or Oh My Pi plugin.\n` and a non-omp validation asserts `actionable: false`, `proseFindings` equal to `[{ file: 'steering/snippets/project-tech.md', line: 1, text: 'It is not a Codex or Oh My Pi plugin.' }]`, and that applying the id leaves the snippet unchanged
- AC2/AC3: the existing apply test expects line 5 to stay `Oh My Pi and OMP agree; OMPX and lowercase omp stay.`, expects token occurrences on lines 1–4 only, expects the unchanged validation mapping, and expects that a post-apply detect reports no actionable `steering-v4-host-language` item
- AC4: the contract test asserts that `workflows/upgrade-project/WORKFLOW.md` and `references/v3-detectors.md` mention `proseFindings` and report-only prose, and do not contain the substitution phrase ``to `Claude Code` `` applied to `Oh My Pi` / `OMP` prose
- `cd scripts && npm test` exits 0

## Change History

| Issue | Date | Summary |
|-------|------|---------|
| #487 | 2026-10-25 | Initial defect report |
