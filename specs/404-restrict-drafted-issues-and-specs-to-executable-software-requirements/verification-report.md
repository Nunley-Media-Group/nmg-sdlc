# Verification Report: Restrict Drafted Issues and Specs to Executable Software Requirements

**Issue**: #404
**Date**: 2026-09-18
**Result**: Pass
**Verified Version**: 3.24.0

## Acceptance Criteria Results

| Acceptance Criterion | Result | Evidence |
|---|---|---|
| AC1: Classify content against actual execute authority | Pass | `references/execute-implementable-requirements.md` defines the delegated stage sequence, stage mutation/evidence authority, intervention boundaries, and ordered eligibility algorithm. Focused contract suite passed. |
| AC2: Preserve only the executable slice of mixed input | Pass | Draft and write-spec workflows perform early extraction and rewriting. Passing CSV fixtures retain authorization, audit-log, owner, and latency behavior; forbidden fixtures fail on counsel approval and ownership proof. |
| AC3: Do not hide excluded material in contextual sections | Pass | Workflow final audits cover every issue/spec section. Templates remove generic relocation surfaces. Write-spec forbidden fixture identifies `design:Open Questions`, task approval, requirements approval/proof, and Gherkin approval clauses. |
| AC4: Stop when no executable requirement remains | Pass | Static workflow contract tests assert both exact `/sdlc-execute`-named diagnostics and pre-plan/pre-mutation stop ordering, including unresolved write-spec product decisions. |
| AC5: Apply one contract to both rendered prompts | Pass | Prompt composition tests prove `plugin.reference.execute-implementable-requirements` renders after both order-100 workflow bodies at order 150, before project steering, with exact bytes and provenance; root containment and symlink escape checks pass. |
| AC6: Audit the complete generated payload | Pass | Both workflows require the exact seven-column `Execute Feasibility` ledger across all proposed ACs/FRs/tasks/scenarios, reject unresolved retained rows, keep the ledger plan-only, and audit the complete issue body or four-file payload before proposal. |

## Command Evidence

| Command | Outcome |
|---|---|
| `cd scripts && node --experimental-vm-modules node_modules/.bin/jest --runInBand __tests__/sdlc-prompt-snippets.test.mjs __tests__/interactive-plan-contract.test.mjs __tests__/skill-exercise-runner.test.mjs __tests__/sdlc-safe-recoveries.test.mjs` | Pass: 4 suites, 162 tests, 0 failures. |
| `node scripts/skill-exercise-runner.mjs --skill draft-issue --artifact scripts/__fixtures__/skill-exercise/draft-issue/artifacts/feature-pass.md --base HEAD` | Pass: 14 pass, 0 fail, 1 classification-inapplicable skip. |
| `node scripts/skill-exercise-runner.mjs --skill write-spec --artifact scripts/__fixtures__/skill-exercise/write-spec/artifacts/write-spec-pass.json --base HEAD` | Pass: 14 pass, 0 fail, 0 skipped. |
| `node scripts/skill-exercise-runner.mjs --skill draft-issue --artifact scripts/__fixtures__/skill-exercise/draft-issue/artifacts/forbidden-obligations-fail.md --base HEAD` | Expected rejection: exit 1; R7 names `draft-issue:Require External Approval` and the counsel/ownership clause. |
| `node scripts/skill-exercise-runner.mjs --skill write-spec --artifact scripts/__fixtures__/skill-exercise/write-spec/artifacts/forbidden-obligations-fail.json --base HEAD` | Expected rejection: exit 1; W2/W3/W4/W6 name the exact requirements, design, tasks, and feature violations. |
| `node scripts/skill-inventory-audit.mjs --check` | Pass: clean, 91 items mapped. |
| `node scripts/verify-plugin-surface.mjs --root . --label repository` | Pass. |
| `node scripts/verify-current-specs.mjs` | Pass: 85 genuine issue specs, 16 required archive, 16 rewrite capabilities, 16 active workflow mappings, 1 deprecated stub. |
| `cd scripts && npm test` | Pass: 55 suites passed, 1 pre-existing skipped suite; 1495 tests passed, 2 pre-existing skipped tests; 0 failures. |
| `git diff --check origin/main...HEAD` | Pass: no whitespace errors. |

## Changed-Path Coverage

| Path | Coverage |
|---|---|
| `references/execute-implementable-requirements.md` | AC1–AC6 shared capability, eligibility, transformation, feasibility, and stop contract. |
| `src/sdlc-prompt-snippets.mjs` | AC5 exact two-consumer rendering and closed `workflows/`/root-`references/` containment. |
| `workflows/draft-issue/` | AC1–AC4 and AC6 early filtering, interview constraints, full-body audit, plan ledger, and issue templates. |
| `workflows/write-spec/` | AC1–AC4 and AC6 eligible-slice extraction, decision resolution, four-file audit, plan ledger, and aligned templates. |
| `scripts/__tests__/sdlc-prompt-snippets.test.mjs` | AC5 catalog, order, bytes, provenance, allowed roots, and escape rejection. |
| `scripts/__tests__/interactive-plan-contract.test.mjs` | AC1–AC6 static workflow, capability, ledger, stop, audit, and template contracts. |
| `scripts/skill-exercise-runner.mjs` and `scripts/__tests__/skill-exercise-runner.test.mjs` | AC2–AC3 artifact-scoped R7/W1–W6 semantics, diagnostics, structure separation, and CLI exits. |
| `scripts/__fixtures__/skill-exercise/draft-issue/` and `scripts/__fixtures__/skill-exercise/write-spec/` | AC2–AC3 positive domain behavior and exact forbidden-burden rejection evidence. |
| `scripts/skill-inventory.baseline.json` | Shared-reference normative clause inventory. |
| `README.md` | Public execute-feasibility boundary and omission rule. |
| `VERSION`, `package.json`, `CHANGELOG.md` | Minor release 3.24.0 and issue-linked release note. |

## Known Gaps

None.
