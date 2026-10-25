# Root Cause Analysis: steering-v4-host-language rewrites Oh My Pi prose into contradictory steering

**Issue**: #487
**Date**: 2026-10-25
**Status**: Approved
**Author**: NMG

## Root Cause

1. `rewriteV3SnippetText` in `scripts/sdlc-upgrade.mjs` applies `rewriteV3HostTokens` and then `V3_STEERING_PROSE_RE = /Oh My Pi|\bOMP\b/g` → `Claude Code` to every snippet line, regardless of what the sentence means.
2. `planSteeringHostLanguage` records every changed line as an occurrence, so a prose-only mention makes `detectSteeringHostLanguage` emit an actionable item.
3. `workflows/upgrade-project/WORKFLOW.md` step 12a, `references/v3-detectors.md` item 14, `references/detection.md` item 12, and `references/upgrade-procedures.md` all specify the prose substitution. The `sdlc-upgrade.test.mjs` fixture line `Oh My Pi and OMP agree; OMPX and lowercase omp stay.` expects it too.

## Affected Code

| File | Symbol / Area | Role |
|------|---------------|------|
| `scripts/sdlc-upgrade.mjs` | `V3_STEERING_PROSE_RE`, `rewriteV3SnippetText` | Prose substitution |
| `scripts/sdlc-upgrade.mjs` | `planSteeringHostLanguage`, `detectSteeringHostLanguage`, `applySteeringHostLanguage` | Occurrence planning, actionability, and apply |
| `workflows/upgrade-project/WORKFLOW.md`, `workflows/upgrade-project/references/v3-detectors.md`, `workflows/upgrade-project/references/detection.md`, `workflows/upgrade-project/references/upgrade-procedures.md` | steering-v4-host-language contract text | Specify the substitution |
| `scripts/__tests__/sdlc-upgrade.test.mjs`, `scripts/__tests__/upgrade-v4-host-language-contract.test.mjs` | steering-v4-host-language tests | Expect the substitution |

## Fix Strategy

- **Rewrite:** delete `rewriteV3SnippetText`. `planSteeringHostLanguage` maps each snippet line with `rewriteV3HostTokens` only. Keep `V3_STEERING_PROSE_RE`, without the `g` flag, as the detection pattern `/Oh My Pi|\bOMP\b/`.
- **Prose findings:** in the snippet line loop, after token mapping, when a line matches `V3_STEERING_PROSE_RE`, push `{ file: rel, line: index + 1, text: <line without newline> }` to a new `proseFindings` array. Token occurrences are recorded exactly as today.
- **Plan result:** return `null` when `occurrences.length === 0 && proseFindings.length === 0`, as today with prose findings added as a second trigger. Otherwise return `{ occurrences, proseFindings, unverifiable, plan }`.
- **Detect:** `detectSteeringHostLanguage` returns the item with `proseFindings` and `actionable: occurrences.length > 0`. When there are no occurrences, the description is `Report <n> Oh My Pi / OMP prose mention(s) in registered steering snippets; prose is not rewritten.`. Otherwise it keeps the current token-rewrite wording, without claiming that prose is rewritten.
- **Apply:** `applySteeringHostLanguage` returns `{ id, status: 'already-current' }` when the live plan is `null` or has no occurrences. Otherwise it proceeds as today through `applySteeringRuntime`.
- **Validation mapping:** `config.program` `omp` → `claude`, `--print` → `-p`, and token mapping in `config.program` / `config.args` stay unchanged.
- **Docs:** in `workflows/upgrade-project/WORKFLOW.md` step 12a, `references/v3-detectors.md` item 14, `references/detection.md` item 12, and the `references/upgrade-procedures.md` row, remove the `Oh My Pi` / whole-word `OMP` → `Claude Code` substitution text. State that snippet lines mentioning `Oh My Pi` or whole-word `OMP` are listed as report-only `proseFindings` and never make the category actionable. Edit these workflow-bundled files after invoking the `skill-creator` skill. Add a CHANGELOG `[Unreleased]` `### Fixed` entry.

## Changes

| File | Change | Behavioral reason |
|------|--------|-------------------|
| `scripts/sdlc-upgrade.mjs` | Token-only snippet rewrite, `proseFindings`, actionability, apply guard | AC1, AC2, AC3, FR1, FR2, FR3 |
| upgrade-project workflow and references | Report-only prose contract | AC4, FR4 |
| `scripts/__tests__/sdlc-upgrade.test.mjs`, `scripts/__tests__/upgrade-v4-host-language-contract.test.mjs` | New expectations | AC1–AC4, FR4 |
| `CHANGELOG.md` | Fixed entry | User-facing behavior |

## Blast Radius

- Only the `steering-v4-host-language` detector and apply change. `agents-host-language` and `contributing-v4-host-language` are untouched.
- A project whose snippets still mention Oh My Pi in prose keeps a non-actionable `steering-v4-host-language` item on every detect run, as report-only evidence. That item is never applied.

## Alternatives Considered

| Option | Decision | Reason |
|--------|----------|--------|
| Rewrite prose only in non-negated sentences | Rejected | Meaning-aware rewriting is unreliable; the issue requires no prose rewrite |
| Drop prose detection entirely | Rejected | The issue requires report-only prose findings (FR2) |

## Change History

| Issue | Date | Summary |
|-------|------|---------|
| #487 | 2026-10-25 | Initial defect report |
| #487 | 2026-10-25 | Spec revised before delivery |
