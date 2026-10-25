# Upgrade Detectors (v3 contract + v4 migration)

**Consumed by**: `upgrade-project` (via `scripts/sdlc-upgrade.mjs`).

This reference documents the read-only detectors and apply contract implemented in `scripts/sdlc-upgrade.mjs`, including the v3 (Oh My Pi) → v4 (Claude Code) migration in "v4 Detectors" below. The workflow stays in native plan mode, interviews with `AskUserQuestion`, writes the plan file, and calls `ExitPlanMode`; approved plan execution then calls these helpers. Detectors never mutate.

## Exported API

```js
import {
  applyPublicationUpgrade,
  applyUpgrade,
  detectPublicationUpgrade,
  detectUpgrade,
} from '../scripts/sdlc-upgrade.mjs';

const report = detectUpgrade(projectRoot);
const outcome = applyUpgrade(projectRoot, approvedItemIds);

const selected = detectPublicationUpgrade(projectRoot, {
  specDirs: ['specs/42-slug'],
});
const selectedOutcome = applyPublicationUpgrade(projectRoot, selected.item.id, {
  specDirs: selected.specDirs,
});
```

CLI:

```
node "<plugin-root>/scripts/sdlc-upgrade.mjs" detect [--root <dir>]
node "<plugin-root>/scripts/sdlc-upgrade.mjs" apply --approve <id1,id2,...> [--root <dir>]
node "<plugin-root>/scripts/sdlc-upgrade.mjs" detect-publication --root <dir> --spec specs/N-slug
node "<plugin-root>/scripts/sdlc-upgrade.mjs" apply-publication --root <dir> --spec specs/N-slug --approve publication-files:<digest>
```

`applyUpgrade` is safe to call on temporary fixtures for tests (never mutates the nmg-sdlc specs/ tree directly).

## Selected publication-only contract

Use the selected contract only for exactly one explicitly authorized issue package. Resolve the CLI with the pre-#388 legacy command set and option-value consumption first. If any legacy `detect` or `apply` command resolves, publication-command tokens in positional locations remain ignored; only when no legacy command resolves may `detect-publication` or `apply-publication` select strict parsing. A resolved publication command requires exactly one command token and one `--spec specs/N-slug`. Command-named option values remain compatible. The package must contain four regular Approved files whose exact issue digit strings match its directory. Caller root, specs root, package, and inventory must not traverse symlinks.

Detection hashes canonical root/package, complete directly sorted inventory with digests/high-resolution identities, stable recursive directory listings, and the exact rewrite/finding plan built from the descriptor-carried tasks Buffer. Apply creates one exclusive fsynced regular root lock containing token/pid bytes and one exclusive fsynced root stage. Authorized nmg-sdlc invocations honor the lock. The uninterrupted final boundary first reruns complete descriptor-bound authority and exact approval-id equality, then proves final target identity/bytes, staged identity/exact output bytes, and lock identity/exact owner bytes before immediate atomic rename. Each file proof uses pre-open lstat, one `O_RDONLY | O_NOFOLLOW` descriptor where supported, descriptor fstat/exact bytes, and post-read path identity; without `O_NOFOLLOW`, that chain supplies the cooperative proof. Every observed pre-boundary change fails closed. Successful rename defines `applied: true`; a later cleanup failure retains validated lock evidence.

Node has no portable identity-conditional pathname rename or unlink. Mutation of non-target inventory after the completed authority rerun, and non-cooperative same-credential mutation or replacement after a target, stage, or lock final proof inside the immediately following pathname syscall gap, are undefined external interference outside this contract.

`applyPublicationUpgrade` and `apply-publication` call only the publication line rewriter. Task discovery applies declaration-validation visibility to Markdown-fenced and HTML-commented headings. Minimal approved ASCII Buffer slices preserve invalid UTF-8 and line endings; repeated detection returns `writeCount: 0`. They do not call general apply, dependencies, label backfill, GitHub, or another phase.

The unbounded `detectUpgrade` / `applyUpgrade` API and `detect` / `apply` CLI remain the full-repository compatibility path.

## Detectors (all read-only; report actionable items)

1. **Packaging**
   - Signal: `.codex-plugin/plugin.json` exists, or root `package.json` declares the v3 `omp.extensions` manifest, AND `.claude-plugin/plugin.json` is absent.
   - Item `packaging-v4-claude-code-herdr` (detector-only): report that v4 installs as a Claude Code plugin (`claude plugin marketplace add` + `claude plugin install`, or `claude --plugin-dir <checkout>`) and requires Herdr.
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
   - Parse explicit legacy fields and clear sequencing clauses only after removing fenced code, HTML comments, inline code spans, and block quotes.
   - Skip markdown table rows and drop references qualified as a pull request (`PR #N`, `pull request #N`) or by another project or repository (`PennyScan issue #N`, `owner/repo#N`); these never name a local issue. A determiner (`the`, `a`, `an`, `this`, `that`, `our`, `its`, `each`, `every`, `same`, matched case-insensitively) directly before a run of capitalized words that ends at `issue #N` marks a local descriptor, so `After the Auth API issue #N` yields a local edge. `PennyScan issue #N`, a capitalized word with no determiner before it, and punctuated names such as `nmg-pi issue #N` stay foreign.
   - Ambiguous prose is a finding, not an edge. Preserve all issue body text.
   - A candidate whose endpoint is not a repository issue is a report-only `dependency_dangling_candidate` finding with its source line and edge; it is never proposed, and detection still returns every other category.
   - Merge the remaining candidates with official edges and reject existing official edges with dangling targets, dangling approved edges, or deterministic open cycles before proposal.
   - Apply only the approved exact edge set after a live graph-digest check; POST numeric REST database ids.
8. **Frontmatter normalization**
   - Plural `**Issues**` → singular `**Issue**` (N must match target directory leading number). Plural detection reads only a `**Issues**:` field line; prose or headings that merely contain "Issues" do not trigger it.
   - Status `Amended` / `Planning` / `In Review` → `Approved` if verification-report.md present, else `Draft`.
   - Gherkin comment headers (`# Issue:` / `# Issues:` / `# Date:` / `# Status:` / `# Author:`) are normalized in place: Issue and Status values are updated and missing fields are added in comment syntax, so no bold `**Issue**`/`**Date**`/`**Status**`/`**Author**` duplicates are created.
   - Applied as part of rename/split/flatten, or as standalone fix items for already-N dirs that still carry plural/Amended. Includes `feature.gherkin`.
9. **Repeat run (already current)**
   - All specs are issue-owned and no approved official dependency additions remain.
10. **v2 runner cleanup**
   - Delete only exact regular files and owned entries inside recognized blocks; never follow symlinks or remove unknown content.

## v4 Detectors (v3 Oh My Pi → v4 Claude Code)

v3 kept plugin runtime state under `.omp/sdlc/` and ignored it with the managed `.omp/sdlc/` rule. v4 keeps it under `.nmg-sdlc/` (`handoffs/`, `verification/`, `run.json`, `safe-recoveries.json`, `prompt-provenance/`, `smoke-deliveries/`, `plans/`, …). The `.omp/sdlc` names here are legacy-detection input only.

11. **Runtime state** (`id: runtime-state-v4`, `kind: runtime-state-v4`)
   - Signal: `.omp/sdlc` exists (any entry type).
   - Walks `.omp/sdlc/` without following symlinks, in locale-independent sorted order, and classifies every entry:
     - `moves`: regular file whose `.nmg-sdlc/<same relative path>` is absent.
     - `duplicates`: target is a regular file with identical bytes; apply deletes only the legacy copy.
     - `obsolete`: top-level `omp-controller.yml` (the OMP paste config, which has no v4 equivalent), reason `runtime_state_obsolete`; apply deletes it.
     - `conflicts`: target exists with different bytes or is not a regular file → `runtime_state_conflict`; legacy entry is a symlink or non-regular file, `.omp` / `.omp/sdlc` is a symlink, or a `.nmg-sdlc/` target component is a symlink or non-directory → `runtime_state_unsafe_path`.
   - `actionable` is true when `moves`, `duplicates`, or `obsolete` is non-empty; conflicts alone are reported with `actionable: false`.
   - Apply re-plans from live state, creates target directories one segment at a time (refusing symlinks), and moves each file with an exclusive hard link (or `COPYFILE_EXCL` copy plus byte check across devices) before unlinking the source, so an existing `.nmg-sdlc/` file is never overwritten, even one created after approval. It then prunes emptied directories under `.omp/sdlc/`, including `.omp/sdlc/` itself; `.omp/` and its other contents are never touched.
   - Result: `{ id, status, moved, deduplicated, removedObsolete, conflicts }` with `status` `applied` (something changed), `skipped:collision` (only conflicts remain), `already-current`, or `failed:<message>` with `reasonCode: runtime_state_move_failed`.
12. **Runtime ignore** (`id: nmg-sdlc-ignore`, `kind: nmg-sdlc-ignore`)
   - Signal: `.gitignore` lacks an exact non-comment `.nmg-sdlc/` or `.nmg-sdlc` rule, or carries the legacy managed `.omp/sdlc/` / `.omp/sdlc` rule while `.omp/sdlc` no longer exists (`swapLegacy: true`).
   - Apply (after `v2-cleanup` and `runtime-state-v4`): when `.omp/sdlc` is gone, replace the first legacy rule in place with `.nmg-sdlc/` (or drop it when `.nmg-sdlc/` is already present) and drop any repeats, preserving CRLF endings; otherwise append `.nmg-sdlc/`. While legacy runtime files remain, the legacy rule is retained and the result carries `legacyIgnoreRetained: true` and `reasonCode: runtime_state_legacy_present`. Every unrelated rule is preserved. An unreadable or unwritable `.gitignore` returns `preserved (unmanaged)` with `gitignore_unwritable`.
13. **Host language** (`id: agents-v4-host-language`, `kind: agents-host-language`)
   - Signal: root `AGENTS.md` has a line matching the managed structure comment `agents/<spaces># OMP task agents (<list>)`.
   - Apply rewrites only that comment to `# Claude Code plugin subagents (<list>)`, keeping the column and agent list. Other text that mentions OMP is project-authored and is never rewritten. `agents-spike-language` runs first and strips `spike-researcher` from either the OMP or the Claude Code form.
14. **Steering host language** (`id: steering-v4-host-language`, `kind: steering-v4-host-language`)
   - Signal: a registered snippet under `steering/snippets/` or a manifest validation `config.program` / `config.args` contains a mapped token (`herdr integration install omp`, `omp-sdlc-ignore.mjs`, `exercise-omp.mjs`, `omp --print`, `--kind omp`, `--kind pi`, `.omp/sdlc/`, `.omp/sdlc`). Validation program `omp` becomes `claude` and `--print` becomes `-p`. Lowercase `omp` changes only inside mapped tokens.
   - Prose lines are report-only prose findings: a snippet line containing `Oh My Pi` or whole-word, case-sensitive `OMP` is recorded as a `proseFindings` entry `{ file, line, text }` (`text` is the original line without its newline). Prose is never rewritten, and prose findings alone never make the item actionable; `actionable` is true only when token or validation occurrences exist.
   - Apply (order 10.5, after `nmg-sdlc-ignore`) re-plans from live state and writes only through the shared steering writer in update mode. A plan with no token or validation occurrences returns `already-current` and writes nothing, so prose lines stay byte-for-byte. A symlinked, non-regular, or unreadable snippet yields `skipped:unverifiable` with `steering_host_language_unsafe_path` and no write; a writer failure yields `failed:<message>` with the writer's reason code.
15. **Contributing host language** (`id: contributing-v4-host-language`)
   - Signal: a regular root `CONTRIBUTING.md` contains the exact sentence `drives Herdr omp worker panes through implementation, verification, and delivery`, under any heading.
   - Apply (order 10.5) replaces every occurrence with the `Claude` sentence and leaves all other bytes unchanged. A symlinked or unreadable file yields `skipped:unverifiable` with `contributing_unsafe_path`.
16. **Project instructions move** (`id: agents-to-claude-md`)
   - Signal: root `AGENTS.md` exists.
   - Apply (order 7.75, after `agents-spike-language` and `agents-host-language`): without `CLAUDE.md`, rename with identical bytes (`git mv` when tracked). With a regular `CLAUDE.md`, append `AGENTS.md` after exactly one blank line, keep one spec-context managed section (the `CLAUDE.md` copy), and delete `AGENTS.md`. A symlinked or unreadable file on either side yields `skipped:collision` with no change.
17. **Changelog create** (`id: changelog-create`, `kind: changelog-create`)
   - Signal: root `VERSION` is a regular file and root `CHANGELOG.md` is absent (`lstatOrNull` returns nothing).
   - Apply (order 10.75, after `steering-v4-host-language` and `contributing-v4-host-language`) re-checks live state first. Anything present at `CHANGELOG.md` yields `already-current` with no write. Otherwise it writes `# Changelog`, a blank line, then `## [Unreleased]` with a trailing newline. An existing `CHANGELOG.md` is never overwritten.
   - Without this heading, `prepare-version` fails with `version_artifact_missing`, so the item is the upgrade path for onboarded projects that predate the onboarding fix.

Re-running detect after a successful v4 apply reports none of these items.

## Apply contract

- Only approved ids cause mutation.
- Re-check preconditions immediately before each mutation (no silent overwrite on collision).
- On split/flatten/rename: preserve original file bytes except for the required frontmatter rewrite, section filtering (split), Related Spec additions, and historical append (epic).
- Update cross-spec `**Related Spec**` pointers that pointed at a renamed/removed source path.
- Return structured outcome with per-id status (`applied`, `skipped:collision`, `skipped:unverifiable`, `failed`).
- Idempotent: re-running detect+apply on same approved set after success reports already-current or already-clean.
- Selected publication-only apply additionally requires exact root/selection/report equality and never executes full-upgrade post-processing or GitHub side effects.

## Reuse

- `scripts/issue-dependencies.mjs` is the sole production official blocked-by client, graph validator, and edge writer.
- `parseLegacyDependencyEvidence` is migration-only and must not feed execute, start, or status.
- Minimal local parsers remain for legacy frontmatter and ownership artifacts.

## Fixtures for verification (used by tests)

- epic flatten: temp `specs/epic-foo/` + `specs/feature-bar/` (with valid `epic-link.json` naming child #11) → produces `specs/11-bar/`, removes epic dir + link.
- cumulative split: temp `specs/feature-baz/` with `**Issues**: #2, #6` + valid `issue-scope.json` → produces `specs/2-baz/` + `specs/6-baz/`, each with singular frontmatter for its N only, manifest deleted.

All other legacy types (`epic-scope.json`, `issue-scope.json`, `epic-link.json`) become absent after successful apply of their items.
