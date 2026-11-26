# Design: Add a technology-agnostic e2e test type that projects identify by declared path globs

**Issue**: #635
**Date**: 2026-11-25
**Status**: Approved
**Author**: Claude Code
**Related Spec**: specs/571-make-bdd-scenarios-the-single-acceptance-test-layer-with-a-kept-test-types-steering-setting/

## Overview

`src/test-layers.mjs` (Node-free) gains the `e2e` type, validation of an optional `paths` map, a built-in glob matcher and a `declaredTestType` lookup. `scripts/upgrade-test-layers.mjs` asks that lookup first when it classifies a file and when it decides whether a file belongs to the inventory, so `check-test-layers`, the upgrade detector, candidates, the batch gate and the report all see the declared type. The rule text, workflow documents and README are updated to describe `e2e`.

## Architecture

- **Vocabulary** (`src/test-layers.mjs`): `TEST_LAYER_TYPES` becomes `['bdd', 'e2e', 'unit', 'integration', 'property', 'doc']`. `e2e` is second so that the upgrade question, which lists at most three non-`bdd` types in vocabulary order, always offers it. `TYPE_DESCRIPTIONS.e2e` is `automated tests that drive the running app or UI through a device, emulator, simulator or browser`.
- **Validation** (`validateTestLayers`): `paths` joins the allowed top-level keys. The normalized result is `{ version, kept }` when the input has no `paths`, and `{ version, kept, paths }` otherwise, with `paths` keys in vocabulary order and each glob array in declared order. A type may have globs without being kept.
- **Glob matcher** (`src/test-layers.mjs`, no imports): a glob and a path are split on `/`. A `**` segment matches zero or more whole segments. Inside any other segment `*` matches any run of characters other than `/`, `?` matches one such character, and every other character is literal. Matching is case-sensitive, against the repository-relative POSIX path, and must consume the whole path. `mobile/integration_test/**` matches every file below that directory; `**/*UITests/**` matches at any depth.
- **Lookup** (`declaredTestType(config, rel)`): returns the one type whose globs match `rel`, or `null`. When globs of two types match, it throws `TestLayersError` with key `paths`, reason code `test_layers_invalid`, and a message naming the file and both types, for example `steering/test-layers.json: paths: mobile/integration_test/a_test.dart matches globs of both e2e and unit`.
- **Classifier** (`scripts/upgrade-test-layers.mjs`): `classifyTestFile(rel, text, featureFileRefs, config)` returns `declaredTestType(config, rel)` when it is not `null`, before the `bdd` rules. Otherwise it runs the existing rules with one change: `TYPE_TOKENS` gains an `e2e` entry holding the `e2e` token, checked before `integration`, and `integration` keeps `integration` and `component`. Because the `bdd` rules still run before the tokens, an undeclared file that cites `@SCN<n>` stays `bdd`; only a declared glob types such a file `e2e`.
- **Inventory** (`scan`): loads `steering/test-layers.json` once and includes a file when `isTestPath(rel)` is true or `declaredTestType` gives it a type. The detector digest therefore covers glob-matched files.
- **Pairs** (`pairWithFeatures(inventory, kept)`): also excludes files typed `e2e` when `kept` includes `e2e`. The detector passes the recorded kept set, `applyTestLayers` passes the set it records, and `computeCandidates` passes its own.
- **Candidates and gate**: `computeCandidates` and `gateBatch` already skip and count tests by `keptSet.has(test.type)`, so a kept e2e test is never a candidate and its coverage is part of the kept union once its file is typed `e2e`. `coveredBy` for the `duplicate` label stays `bdd`-only.
- **Error surfaces**: an invalid file or a two-type match is reported as `test_layers_invalid` with the diagnostic by `check-test-layers` (a violation), by `apply` (`failed:<diagnostic>`, no write), and by candidates, begin, gate and report (their existing steering refusal; the gate restores the snapshot). `preconditions` builds the inventory so a conflict is reported there and not as `test_layers_coverage_failed`. `detect` stays read-only and tolerant: on an invalid file or a conflict it emits the item with built-in classification, `recordedKept: null` and `configError: <diagnostic>`.
- **Writer** (`scripts/test-layers.mjs` `writeTestLayers(root, kept)`): reads the existing file first. A valid file's `paths` map is written back with the new `kept`. An invalid existing file throws its `TestLayersError` and nothing is written. A missing file is written as before.
- **Rule text** (`testLayersRule`): the per-type list gains the `e2e` description. When `e2e` is kept the rule adds `- An \`e2e\` test that cites a scenario's \`@SCN\` tag is that scenario's implementation. Use one when the acceptance criterion's behavior is only observable through the running app or UI.` When `paths` is declared the rule adds one line per declared type listing its globs, and says a test of that type belongs under one of them. `testLayersFragment` already renders this rule into the write-spec, implement, verify and verify-code prompts.
- **Handoff** (`scripts/sdlc-execute.mjs` `validJustifiedTests`): reads `TEST_LAYER_TYPES`, so `e2e` is accepted with no code change there. An e2e test that cites a scenario tag is a scenario implementation and needs no `justifiedTests` entry; any other e2e test does.

## API / Interface Changes

| Interface | Input | Output / Error | Behavior |
|-----------|-------|----------------|----------|
| `steering/test-layers.json` | `{ "version": 1, "kept": [...], "paths": { "<type>": ["<glob>", ...] } }`; `paths` optional | `test_layers_invalid` naming the field and value | `paths` must be an object; each key a vocabulary type; each value an array; each glob a non-empty string that does not start with `/`, has no `..` segment and is not repeated anywhere in the map |
| `validateTestLayers(value)` | parsed JSON | normalized config, or `TestLayersError` | Field names in diagnostics: `paths`, `paths.<type>`, `paths.<type>[<index>]` |
| `declaredTestType(config, rel)` | normalized config, repository-relative path | type, `null`, or `TestLayersError` | New export of `src/test-layers.mjs`, re-exported by `scripts/test-layers.mjs` |
| `classifyTestFile(rel, text, featureFileRefs, config)` | optional fourth argument, default no `paths` | type | Declared glob first, then existing rules with the `e2e` token |
| `pairWithFeatures(inventory, kept)` | optional kept set, default `['bdd']` | pairs | Excludes kept `e2e` files |
| `writeTestLayers(root, kept)` | kept list | normalized config, or `TestLayersError` | Preserves a valid existing `paths`; refuses an invalid existing file |
| `sdlc-upgrade.mjs detect` test-layers item | none | `detectedTypes.e2e`, optional `configError` | Counts e2e files |
| `sdlc-upgrade.mjs apply --kept` | comma list including `e2e` | `applied`, or `failed:<diagnostic>` | `--kept` accepts `e2e` |

## Data / Storage Changes

`steering/test-layers.json` keeps `version: 1`; existing `{ version, kept }` files are valid unchanged. `.nmg-sdlc/upgrade/test-layers/inventory.json` may now list files typed `e2e`, including files that only a glob made test files; its shape is unchanged.

## State and UI Behavior

- The `/sdlc-upgrade-project` kept-types question lists `bdd (Recommended)` first, then the detected non-`bdd` types in the order `e2e`, `unit`, `integration`, `property`, `doc`, at most three; any further detected types are named in the question paragraph for Other.
- Verify's Test Coverage table lists a kept e2e test that cites a scenario's `@SCN` tag in that AC's Implementation column, marked `(e2e)`. Such a test is not a Duplicate finding and not a Non-kept type finding.

## Alternatives Considered

| Option | Decision | Reason |
|--------|----------|--------|
| Project-declared globs with a built-in matcher in `src/test-layers.mjs` | Selected | Stack-neutral, Node-free, and one lookup feeds every consumer |
| Built-in list of framework directories (`integration_test`, `cypress`, `.maestro`, …) | Rejected | Out of scope in the issue; the list never ends and guesses wrong |
| Glob matching through `node:path` `matchesGlob` or a dependency | Rejected | `src/test-layers.mjs` must load with no imports in every runtime |
| Append `e2e` at the end of the vocabulary | Rejected | The upgrade question shows three non-`bdd` options, so `e2e` could be left out |
| `apply --kept` overwrites an invalid existing file, as today | Rejected | It would drop the `paths` map and make e2e files deletion candidates |

## Change History

| Issue | Date | Summary |
|-------|------|---------|
| #635 | 2026-11-25 | Initial feature design |
