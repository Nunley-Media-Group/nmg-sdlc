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
node scripts/sdlc-upgrade.mjs detect [--root <dir>]
node scripts/sdlc-upgrade.mjs apply --approve <id1,id2,...> [--root <dir>]
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
   - GitHub proposals (separate items): remove `epic` / `epic-child-of-N` labels and native sub-issue parent links. These apply ONLY when the approved item id for that github action is included.
   - Convert remaining real execution edges (non-coordination) into `Depends on:` body lines (reuse `parseBodyRelationships` contract; do not fork the regex).

6. **Leftover spikes**
   - Signals: unmarked `docs/decisions/*.md` whose first 4k contains `spike`; leftover `agents/spike-researcher.md` / spike templates; issue form `Spike` option.
   - `AGENTS.md` matching `/spike/i` produces item `agents-spike-language`.
   - Apply replaces the two exact task-agent and ADR-directory structure comments; leftover `/spike/i` returns `skipped:unverifiable`.
   - Convert parseable ADRs into Draft `specs/{N}-{slug}/` four-file packages and stamp `**SDLC-Migrated**: specs/{N}-{slug}/` on the ADR. Skip already-stamped ADRs.
   - If the target dir exists: stamp only when all four files have matching `**Issue**: #N`; otherwise `skipped:collision`.
   - Unparseable ADRs are unverifiable.
7. **Frontmatter normalization**
   - Plural `**Issues**` → singular `**Issue**` (N must match target directory leading number).
   - Status `Amended` / `Planning` / `In Review` → `Approved` if verification-report.md present, else `Draft`.
   - Applied as part of rename/split/flatten, or as standalone fix items for already-N dirs that still carry plural/Amended. Includes `feature.gherkin`.
8. **Repeat run (already current)**
   - All specs are `specs/{N}-{slug}/` with matching singular `**Issue**: #N`, no `specs/epic-*`, no leftover unmarked spike ADRs, no `epic-link.json`/`epic-scope.json`/`issue-scope.json` at any specs/ depth.
9. **v2 runner cleanup (kept)**
   - Exact paths: `sdlc-config.json`, the legacy v2 runner indicator file, the legacy v2 runner state file.
   - Managed `.gitignore` blocks under headers `# SDLC runner config`, `# SDLC runner artifacts`.
   - Delete only exact regular files; never inspect contents or follow symlinks into state.
   - Edit `.gitignore` to remove only the owned entries inside recognized blocks; preserve project-owned and unknown blocks.

## Apply contract

- Only approved ids cause mutation.
- Re-check preconditions immediately before each mutation (no silent overwrite on collision).
- On split/flatten/rename: preserve original file bytes except for the required frontmatter rewrite, section filtering (split), Related Spec additions, and historical append (epic).
- Update cross-spec `**Related Spec**` pointers that pointed at a renamed/removed source path.
- Return structured outcome with per-id status (`applied`, `skipped:collision`, `skipped:unverifiable`, `failed`).
- Idempotent: re-running detect+apply on same approved set after success reports already-current or already-clean.

## Reuse

- `parseBodyRelationships` from `scripts/epic-relationships.mjs` (exact regex for Depends on: / Blocks: lines).
- Minimal local parsers for frontmatter (`**Issues?**`), `issue-scope.json`, `epic-link.json` (schema v1).
- Never fork regexes or ownership logic.

## Fixtures for verification (used by tests)

- epic flatten: temp `specs/epic-foo/` + `specs/feature-bar/` (with valid `epic-link.json` naming child #11) → produces `specs/11-bar/`, removes epic dir + link.
- cumulative split: temp `specs/feature-baz/` with `**Issues**: #2, #6` + valid `issue-scope.json` → produces `specs/2-baz/` + `specs/6-baz/`, each with singular frontmatter for its N only, manifest deleted.

All other legacy types (`epic-scope.json`, `issue-scope.json`, `epic-link.json`) become absent after successful apply of their items.
