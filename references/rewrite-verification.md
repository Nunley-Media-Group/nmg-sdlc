# nmg-sdlc 3.0 Rewrite Verification

**Release**: 3.0.0
**Verified**: 2026-08-20
**Exception**: `repository-rewrite`

## Decision

The version-4 contribution gate was not compatible with this clean rewrite. It required a current executable issue even though the owner-approved cutover predated the singular issue/spec workflow, and its capped sorted spec discovery could accept unrelated historical packages. Version 5 adds a narrow repository-rewrite predicate. It waives only current PR issue/spec identity; the breaking title, required contract paths, rewrite contract, durable verification, steering, changed-path mapping, specific verification, and managed guide remain required.

## Git provenance

The rewrite is grounded in the branch history rather than a synthetic issue:

| Commit | Observable change |
|--------|-------------------|
| `3414fe7` | Rewrote nmg-sdlc as an OMP extension and Herdr workflow. |
| `df32eb7` | Removed spike behavior and leftover Codex prompt configuration. |
| `88c157e` | Exposed the public `/sdlc-*` command surface. |
| `eaeb097` | Added approved-spec publication and OMP-native command dispatch. |
| `c0495dc` | Added default-branch squash merge for approved specs. |
| `f42e83e` | Removed development linking from spec-publication branches. |
| `b8e83a5` | Passed explicit issue numbers into execute worker prompts. |
| `1e3f4e0` | Regenerated the skill-inventory baseline for the rewrite. |

Full predecessor specifications and removed implementation remain recoverable through Git history. The working tree retains only genuinely owned current BDD contracts.

## Current contract coverage

`references/rewrite-contract.json` enumerates 15 current capabilities. `references/rewrite-contract.md` provides their human-readable purpose, source paths, verification paths, and acceptance behavior. `scripts/verify-current-specs.mjs` proves:

- exactly 15 genuinely owned current issue spec directories remain;
- every retained artifact has matching singular `**Issue**: #N` identity and Approved requirements;
- no obsolete or mismatched spec directory remains;
- all 15 rewrite capabilities have source and acceptance coverage;
- all 13 active workflows and all 9 public `/sdlc-*` commands map to the rewrite contract;
- the deprecated `migrate-project` stub retains its exact redirect;
- rewrite-contract, `VERSION`, and `package.json` releases match.

## Verification results

- `cd scripts && npm test` — passed: 32 suites, 272 tests; 1 suite and 1 test skipped.
- `node scripts/verify-plugin-surface.mjs --root . --label repository` — passed.
- `node scripts/verify-current-specs.mjs` — passed: 15 genuine issue specs, 15 rewrite capabilities, 13 active workflow mappings, 1 deprecated stub.
- `node scripts/skill-inventory-audit.mjs --check` — passed: 127 items mapped.

## Changed-path mapping

- OMP package and extension: `package.json`, `VERSION`, `src/`, `commands/`.
- Workflow and policy: `.github/`, `.gitignore`, `AGENTS.md`, `CONTRIBUTING.md`, `README.md`, `CHANGELOG.md`, `steering/`.
- SDLC behavior: `workflows/`, `agents/`, `scripts/`, `references/`.
- Current BDD contracts: `specs/`.

All mapped paths are covered by the current rewrite contract, retained BDD contracts, or the verification commands above.
