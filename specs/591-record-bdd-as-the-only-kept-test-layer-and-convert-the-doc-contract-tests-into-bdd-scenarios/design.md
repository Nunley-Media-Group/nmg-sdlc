# Design: Record bdd as the only kept test layer and convert the doc contract tests into BDD scenarios

**Issue**: #591
**Date**: 2026-11-20
**Status**: Approved
**Author**: Claude Code
**Related Spec**: specs/571-make-bdd-scenarios-the-single-acceptance-test-layer-with-a-kept-test-types-steering-setting/
**Related Spec**: specs/572-add-an-sdlc-upgrade-project-item-that-migrates-non-kept-test-layers-into-bdd-scenarios-under-a-coverage-guarantee/

## Overview

- The approved upgrade apply writes `steering/test-layers.json` with `kept: ["bdd"]`.
- Each of the 13 `doc` test files keeps its path and assertions. Its top-level `describe` title gains the `@SCNnnn ` prefix of a scenario in this spec, and `feature.gherkin` names it in a `# File:` header. Both signals make `classifyTestFile` report `bdd`.
- A CI check enforces the kept set for new test files.

## Components

### `scripts/check-test-layers.mjs` (new)

- `checkTestLayers(root)` returns `{ ok, kept, violations }`.
- It loads the kept set with `loadTestLayers` (`scripts/test-layers.mjs`); an invalid file yields `test_layers_invalid`.
- It classifies test files with `inventoryTestFiles` (`scripts/upgrade-test-layers.mjs`), so CI and the upgrade agree on every file's type.
- A non-kept file outside the allowlist yields `test_layers_type_not_kept`. An allowlist entry that is not a test file, or is of a kept type, yields `test_layers_allowlist_stale`. A malformed allowlist yields `test_layers_allowlist_invalid`.
- The CLI prints the result as JSON and exits 0, 1, or 2 for a usage error.

### `scripts/test-layers-allowlist.json` (new)

`{ "version": 1, "files": [...] }` listing the 39 `unit` test files present at conversion time.

### `.github/workflows/nmg-sdlc-verify.yml` (modify)

A "Check kept test layers" step runs the check before the test step, and the test step is renamed to "Run test suite (BDD scenarios + allowlisted unit tests)".

## Conversion check

The gate cannot accept this conversion (#590), so an equivalent check runs `scripts/jest-per-test-coverage.mjs` on the 13 files before and after. Lines and branches must not shrink, and every earlier outcome must be present and passing once the `@SCNnnn ` prefix is removed from the test name.

## Alternatives Considered

| Option | Decision |
|--------|----------|
| Move the tests into new files and delete the originals | Rejected: specs and the rewrite contract cite the current paths, and the gate would refuse the move (#590) |
| Leave `doc` in the kept set | Rejected: the maintainer chose `bdd` only |
