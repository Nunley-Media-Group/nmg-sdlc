---
name: upgrade-project
description: "Upgrade existing project to latest contract: detect/propose packaging, legacy layout, renames, splits, epic flatten, frontmatter, v2 cleanup. Use when `/sdlc-upgrade-project`. Actual changes via helper script after plan approval."
---

# Upgrade Project

Interactive detect + propose only. Mutators in scripts/sdlc-upgrade.mjs (called by approved plan execution).


## Detectors (read only, glob/read/gh)

1. Packaging: if .codex-plugin/plugin.json and no root package.json with omp.extensions → propose OMP plugin install + herdr. Note nmg-pi optional.

2. Legacy layout: .codex/steering/ or .codex/specs/ → propose relocate to root steering/ specs/ (git mv).

3. Directory rename: specs/feature-*/ bug-*/ or {N}-old → specs/{primaryN}-slug/ (from **Issue** or **Issues** first num). Collision ask.

4. Cumulative split: plural **Issues** or issue-scope.json multi → per-N dirs, copy owned, add Related Spec pointers, remove manifest.

5. Epic flatten: specs/epic-*/ + epic-link → per child {childN}-slug with **Issue** #child , historical note in owner; delete epic dirs/links. Convert edges to Depends on: body lines. Propose label clean only on explicit ask.

6. Leftover spikes: convert unmarked spike ADRs under docs/decisions/ into Draft specs/{N}-{slug}/ four-file packages and stamp `**SDLC-Migrated**` on the ADR. Delete leftover spike-researcher/template files. Remove Spike from the issue form. Unparseable ADRs stay unverifiable.

7. v2 cleanup: sdlc-config.json , legacy runner indicator file, legacy runner state , managed .gitignore blocks → propose delete.

8. This repo specs/ handled same.
Also read CHANGELOG/VERSION/CONTRIBUTING/AGENTS/gates/issue-form , propose reconcile to current (v3 list).

Read references/detection.md etc for details (update in tree).

## Ask ( <=3 total )

Use ask for choices on each category group or conflicts (rec first, 2-4 opts):

e.g. for layout: "Relocate legacy .codex/* ? (recommended yes)"

For splits/renames: approve group or preserve per item.

For epic: explicit per group "Flatten this epic group?"

Runner cleanup: approve batch or narrow.

No silent apply.

## Plan

Write local://upgrade-{slug or date}-plan.md with:

- findings per category

- exact actions / file writes / deletes proposed

- argv for helper e.g. ["node", "scripts/sdlc-upgrade.mjs", "--project", ".", "--apply", "--categories", "layout,rename,split,frontmatter,cleanup"]

## After Propose

xd://propose the slug + "Upgrade plan for current layout/packaging"

Approved plan execution runs the helper script with the chosen scope (the skill does not call it directly; the plan does).

## Generated

Assets use exact v3 invocations list.

## Integration with SDLC Workflow

Utility, run after plugin updates or from onboard.

```
/sdlc-upgrade-project  →  (plan + approved helper)  →  /sdlc-draft-issue
     ▲ You are here
```
