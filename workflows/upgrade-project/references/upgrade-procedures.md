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
| frontmatter-fix | Singular `**Issue**`; Status Draft or Approved only, including `feature.gherkin` |
| issue-dependencies | Re-read approved graph digest, preflight combined graph, then add only approved official blocked-by edges |
| v2-cleanup | Exact runner files and managed `.gitignore` entries |
| omp-sdlc-ignore | Append `.omp/sdlc/` after v2 cleanup; preserve every unrelated ignore rule |

On spike-flatten collision: stamp the ADR only when the existing directory already has all four artifacts with matching `**Issue**: #N`. Otherwise `skipped:collision`.
For issue-dependencies, a changed digest returns `dependency_plan_stale`. Apply is idempotent; on failure it rolls back only edges added by that invocation and reports exact partial state if rollback cannot restore the graph. Never rewrite legacy body prose.

## After apply

Report applied, skipped:collision, skipped:unverifiable, and failed ids. Recommend `/sdlc-write-spec #N` for any Draft package created from a leftover spike.
