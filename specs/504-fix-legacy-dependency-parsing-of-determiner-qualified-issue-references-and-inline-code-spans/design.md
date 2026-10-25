# Root Cause Analysis: Legacy dependency parsing drops determiner-qualified local references and parses inline code

**Issue**: #504
**Date**: 2026-10-25
**Status**: Approved
**Author**: NMG
**Related Spec**: specs/485-reject-non-issue-legacy-dependency-references-instead-of-aborting-upgrade-detection/

## Root Cause

`qualifiedReference(prefix)` captures only the single word directly before `issue #N` with `/\b([A-Za-z0-9][\w.-]*)\s+issue\s*$/i`. It treats that word as a foreign project name when the word is capitalized or contains `-`, `.` or `_`, unless the word itself is in `QUALIFIER_STOP_WORDS`. The determiners in that set are compared only with the captured word, never with the words before it. In `the API issue #5` the captured word is `API`, so the reference is dropped. Because the line has a `#N` match but no surviving reference, `parseLegacyDependencyEvidence` skips it silently (`matches.length > 0 && refs.length === 0`).

`stripIgnoredProse(body)` removes fenced blocks, HTML comments and `>` lines, but not inline code spans. Text inside backticks therefore still matches the clause regex and the `#N` regex.

## Affected Code

| File | Symbol / Area | Role |
|------|---------------|------|
| `scripts/issue-dependencies.mjs` | `qualifiedReference` | Classifies the text before each `#N` as foreign or local |
| `scripts/issue-dependencies.mjs` | `QUALIFIER_STOP_WORDS` | Words that are never project names |
| `scripts/issue-dependencies.mjs` | `stripIgnoredProse` | Removes prose that must not be parsed |
| `scripts/issue-dependencies.mjs` | `parseLegacyDependencyEvidence` | Consumer of both helpers |

## Fix Strategy

1. Add a `QUALIFIER_DETERMINERS` set: the, a, an, this, that, our, its, each, every, same.
2. Change `qualifiedReference` as follows. The pull-request and `owner/repo` checks stay first and unchanged.
   - After capturing the word before `issue`:
     - If the word is in `QUALIFIER_STOP_WORDS`, the reference is local.
     - If the word contains `-`, `.` or `_`, the reference is foreign.
     - If the word is not capitalized, the reference is local.
   - Otherwise, walk backward over the whitespace-separated words before it while each word matches `/^[A-Z][A-Za-z0-9]*$/` (case-sensitive) and is not a determiner.
   - The reference is local only when the word reached is a determiner (compared case-insensitively). Otherwise it is foreign.
3. In `stripIgnoredProse`, after removing fenced blocks, replace each inline code span with a space. A span is a backtick run followed by the shortest text on the same line that ends in an equal backtick run, for example `/(`+)[^\n]*?\1/g`. An unmatched backtick stays literal.

## Changes

| File | Change | Behavioral reason |
|------|--------|-------------------|
| `scripts/issue-dependencies.mjs` | Determiner-run check in `qualifiedReference` | AC1, AC2, AC3, FR1, FR2 |
| `scripts/issue-dependencies.mjs` | Inline-code removal in `stripIgnoredProse` | AC4, FR3 |
| `scripts/__tests__/issue-dependencies.test.mjs` | New regression cases | AC1–AC5, FR4 |
| `workflows/upgrade-project/references/v3-detectors.md` | Issue-dependencies bullets also name inline code spans and determiner-qualified local descriptors | Keeps the detector contract truthful |
| `CHANGELOG.md` | `[Unreleased]` `### Fixed` entry for #504 | Project changelog convention |

## Blast Radius

The only production consumer is `scripts/sdlc-upgrade.mjs` (upgrade detection, issue-dependencies category). With the fix, a determiner-qualified line can now propose an edge that was previously dropped. That candidate still passes through the existing `dependency_dangling_candidate` and cycle checks. With inline-code removal, a backticked reference can no longer produce an edge or a finding. Execute, start and status never read legacy evidence.

## Alternatives Considered

| Option | Decision | Reason |
|--------|----------|--------|
| Determiner directly before a single capitalized word only | Rejected | Misses `the Auth API issue #8`; the run rule was chosen when the issue was drafted |
| Determiner makes any qualifier local, including punctuated names | Rejected | `the nmg-pi issue #4` names another project |
| Add descriptor words such as `API` to `QUALIFIER_STOP_WORDS` | Rejected | Unbounded list; the determiner is the actual signal |

## Change History

| Issue | Date | Summary |
|-------|------|---------|
| #504 | 2026-10-25 | Initial defect design |
