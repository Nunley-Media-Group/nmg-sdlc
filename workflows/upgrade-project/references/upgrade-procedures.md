# Upgrade Procedures

Detailed apply rules for findings already accepted through `upgrade-project`'s interactive plan. Never apply an unapproved category or path.

All mutations go through `scripts/sdlc-upgrade.mjs` (`detectUpgrade` / `applyUpgrade`). Do not hand-edit specs during apply. Do not write `.codex/upgrade-exclusions.json`. Do not route leftover epics through `epic-lifecycle-recovery.md`; epic flatten is a detector/apply kind in the helper.

## Categories

| Kind | Apply |
|------|-------|
| packaging / legacy-layout | Detector-only here; the approved plan may `git mv` `.codex/{steering,specs}` |
| directory-rename | Helper rename + singular frontmatter |
| cumulative-split | Helper split from a valid `issue-scope.json` |
| epic-flatten | Helper child → `specs/{childN}-{slug}/`, then delete epic artifacts |
| spike-flatten | Helper seeds Draft `specs/{N}-{slug}/` from a leftover spike ADR, then stamps `**SDLC-Migrated**` on the ADR |
| spike-remove | Delete leftover spike bundle files |
| spike-issue-form | Remove the Spike option from the managed issue form |
| agents-spike-language | Helper strips leftover spike wording from AGENTS.md structure comments |
| agents-host-language | Helper rewrites only the managed `agents/ … # OMP task agents (…)` comment to `# Claude Code plugin subagents (…)` |
| agents-to-claude-md | Rename root `AGENTS.md` to `CLAUDE.md` (`git mv` when tracked), or append it to an existing `CLAUDE.md` after one blank line with a single spec-context managed section, then delete `AGENTS.md`; runs at order 7.75, after `agents-host-language` |
| steering-v4-host-language | Rewrite v3 host tokens in registered snippets and validation `config.program` / `config.args` (`omp`→`claude`, `--print`→`-p`) through the shared steering writer; `Oh My Pi` / whole-word `OMP` prose lines are report-only `proseFindings` and are never rewritten; runs at order 10.5 |
| contributing-v4-host-language | Replace the exact v3 `drives Herdr omp worker panes …` sentence in `CONTRIBUTING.md` with the `Claude` form; runs at order 10.5 |
| frontmatter-fix | Singular `**Issue**`; Status Draft or Approved only, including `feature.gherkin` |
| issue-dependencies | Re-read approved graph digest, preflight combined graph, then add only approved official blocked-by edges |
| v2-cleanup | Exact runner files and managed `.gitignore` entries |
| runtime-state-v4 | Move legacy `.omp/sdlc/**` files to the same paths under `.nmg-sdlc/` without overwriting; drop byte-identical duplicates; delete `omp-controller.yml`; prune emptied legacy directories |
| nmg-sdlc-ignore | After v2 cleanup and runtime-state: swap the legacy `.omp/sdlc/` rule in place for `.nmg-sdlc/` (or append `.nmg-sdlc/`); preserve every unrelated ignore rule |
| changelog-create | Helper creates root `CHANGELOG.md` containing `# Changelog`, a blank line, and `## [Unreleased]` only when nothing exists there at apply time (live re-check; an existing file returns `already-current` and is never overwritten); runs at order 10.75 |

For the v4 host-language groups, fail-closed reason codes are `steering_host_language_unsafe_path` (symlinked, non-regular, or unreadable registered snippet; skipped with no write), `contributing_unsafe_path` (symlinked or unreadable `CONTRIBUTING.md`), and `skipped:collision` (symlinked or unreadable `AGENTS.md` / `CLAUDE.md`). A steering writer failure returns `failed:<message>` with the writer's reason code.
On spike-flatten collision: stamp the ADR only when the existing directory already has all four artifacts with matching `**Issue**: #N`. Otherwise `skipped:collision`.
For runtime-state-v4, an existing `.nmg-sdlc/` file with different bytes is never overwritten: the legacy file stays and is reported with `runtime_state_conflict`; symlinks and non-directory targets report `runtime_state_unsafe_path`; an I/O failure reports `runtime_state_move_failed`. While any legacy file remains, nmg-sdlc-ignore keeps the legacy rule and reports `runtime_state_legacy_present`.
For issue-dependencies, a changed digest returns `dependency_plan_stale`. Apply is idempotent; on failure it rolls back only edges added by that invocation and reports exact partial state if rollback cannot restore the graph. Never rewrite legacy body prose.

## After apply

Report applied, skipped:collision, skipped:unverifiable, and failed ids. Recommend `/sdlc-write-spec #N` for any Draft package created from a leftover spike.
