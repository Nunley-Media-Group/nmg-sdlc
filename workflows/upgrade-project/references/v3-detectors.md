# v3 Upgrade Detectors

**Consumed by**: `upgrade-project` (via `scripts/sdlc-upgrade.mjs`).

This reference documents the read-only detectors and apply contract implemented in `scripts/sdlc-upgrade.mjs`. The skill keeps interactive `/plan` + `ask` + `xd://propose` and calls these after approval. Detectors never mutate.

## Exported API

```js
import { detectUpgrade, applyUpgrade } from '../scripts/sdlc-upgrade.mjs';

const report = detectUpgrade(projectRoot);
// report.items: array of { id, kind, description, ... }

const outcome = applyUpgrade(projectRoot, approvedItemIds); // ids subset of report item ids
```

CLI:

```
node <plugin-root>/scripts/sdlc-upgrade.mjs detect [--root <dir>]
node <plugin-root>/scripts/sdlc-upgrade.mjs apply --approve <id1,id2,...> [--root <dir>]
```

`applyUpgrade` is safe to call on temporary fixtures for tests (never mutates the nmg-sdlc specs/ tree directly).

## Detectors (all read-only; report actionable items)

1. **Packaging**
   - Signal: `.codex-plugin/plugin.json` exists AND root `package.json` has no `omp.extensions`.
   - Item: report that v3 installs via `omp plugin install`, marketplace, or `omp plugin link`; requires Herdr; nmg-pi optional.
   - Never writes `~/.codex/config.toml` or any Codex config.

2. **Legacy layout**
   - If current references define `.codex/{steering,specs}` relocation, keep that detector (report relocation item when `.codex/steering/` or `.codex/specs/` contain content).

3. **Directory rename**
   - Match: `specs/feature-{slug}/`, `specs/bug-{slug}/`, or pre-existing `{N}-{slug}/`.
   - Compute `primaryN` = first number from plural `**Issues**:` or singular `**Issue**:` (fallback to leading digits in dir).
   - Target: `specs/{primaryN}-{slug}/` (slug derived by stripping `feature-`/`bug-`/`epic-`/leading-N- prefixes; normalize to `[a-z0-9-]+`).
   - If target exists: mark item collision; do not overwrite.
   - Applies git-friendly rename where possible.

4. **Cumulative split**
   - Trigger: plural `**Issues**:` lists 2+ numbers OR leftover `issue-scope.json` has 2+ keys.
   - If `issue-scope.json` (schemaVersion:1, `issues` map) is valid: for each N create `specs/{N}-{slug}/`.
   - Copy ONLY that issue's `owned` ACs/FRs/tasks/scenarios (use manifest). `adopted` identifiers go into the owner issue's split spec.
   - Add `**Related Spec**:` pointers to the other members of the family in each new spec.
   - Delete the source `issue-scope.json` (and the legacy cumulative dir) after successful split.
   - If manifest absent/invalid/unverifiable (overlapping IDs, parse error, no match to frontmatter): do not split; report as unverifiable item requiring manual choice.

5. **Epic flatten**
   - Signals: every `specs/epic-*/` and any leftover `.../epic-link.json`.
   - For each executable child (via its `epic-link.json` `childIssue`): create `specs/{childN}-{slug}/` (slug from child's current dir basename after prefix strip).
   - Frontmatter: `**Issue**: #childN` (singular); append `## Historical coordination` quoting the aggregate goal from the epic aggregate's `requirements.md`.
   - No executable tasks, Gherkin, or issue-scope on the (removed) aggregate.
   - After children written: delete `epic-scope.json`, `epic-link.json`, and the entire `specs/epic-*` tree.
   - Legacy labels and native sub-issue links remain historical migration evidence only; they do not become runtime dependency types.
   - Explicit legacy body relations may be proposed only by the issue-dependencies detector as official blocked-by edges.
6. **Leftover spikes**
   - Signals: unmarked `docs/decisions/*.md` whose first 4k contains `spike`; leftover `agents/spike-researcher.md` / spike templates; issue form `Spike` option.
   - `AGENTS.md` matching `/spike/i` produces item `agents-spike-language`.
   - Apply replaces the two exact task-agent and ADR-directory structure comments; leftover `/spike/i` returns `skipped:unverifiable`.
   - Convert parseable ADRs into Draft `specs/{N}-{slug}/` four-file packages and stamp `**SDLC-Migrated**: specs/{N}-{slug}/` on the ADR. Skip already-stamped ADRs.
   - If the target dir exists: stamp only when all four files have matching `**Issue**: #N`; otherwise `skipped:collision`.
   - Unparseable ADRs are unverifiable.
7. **Issue dependencies**
   - List every open and closed repository issue and every official `dependencies/blocked_by` page.
   - Parse explicit legacy fields and clear sequencing clauses only after removing fenced code, HTML comments, and block quotes.
   - Ambiguous prose is a finding, not an edge. Preserve all issue body text.
   - Merge candidates with official edges and reject dangling targets or deterministic open cycles before proposal.
   - Apply only the approved exact edge set after a live graph-digest check; POST numeric REST database ids.
8. **Frontmatter normalization**
   - Plural `**Issues**` → singular `**Issue**` (N must match target directory leading number).
   - Status `Amended` / `Planning` / `In Review` → `Approved` if verification-report.md present, else `Draft`.
   - Applied as part of rename/split/flatten, or as standalone fix items for already-N dirs that still carry plural/Amended. Includes `feature.gherkin`.
9. **Repeat run (already current)**
   - All specs are issue-owned and no approved official dependency additions remain.
10. **v2 runner cleanup**
   - Delete only exact regular files and owned entries inside recognized blocks; never follow symlinks or remove unknown content.

## Apply contract

- Only approved ids cause mutation.
- Re-check preconditions immediately before each mutation (no silent overwrite on collision).
- On split/flatten/rename: preserve original file bytes except for the required frontmatter rewrite, section filtering (split), Related Spec additions, and historical append (epic).
- Update cross-spec `**Related Spec**` pointers that pointed at a renamed/removed source path.
- Return structured outcome with per-id status (`applied`, `skipped:collision`, `skipped:unverifiable`, `failed`).
- Idempotent: re-running detect+apply on same approved set after success reports already-current or already-clean.

## Reuse

- `scripts/issue-dependencies.mjs` is the sole production official blocked-by client, graph validator, and edge writer.
- `parseLegacyDependencyEvidence` is migration-only and must not feed execute, start, or status.
- Minimal local parsers remain for legacy frontmatter and ownership artifacts.

## Fixtures for verification (used by tests)

- epic flatten: temp `specs/epic-foo/` + `specs/feature-bar/` (with valid `epic-link.json` naming child #11) → produces `specs/11-bar/`, removes epic dir + link.
- cumulative split: temp `specs/feature-baz/` with `**Issues**: #2, #6` + valid `issue-scope.json` → produces `specs/2-baz/` + `specs/6-baz/`, each with singular frontmatter for its N only, manifest deleted.

All other legacy types (`epic-scope.json`, `issue-scope.json`, `epic-link.json`) become absent after successful apply of their items.
