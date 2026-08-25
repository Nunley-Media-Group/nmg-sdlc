---
name: upgrade-project
description: "Upgrade an existing project to the latest contract: detect and propose packaging, layout, specification, official dependency-graph, and cleanup repairs. Use when `/sdlc-upgrade-project`. Actual changes run only after plan approval."
---

# Upgrade Project

Interactive detect + propose only. Mutators in scripts/sdlc-upgrade.mjs (called by approved plan execution).


## Detectors (read only, glob/read/gh)

1. Packaging: if .codex-plugin/plugin.json and no root package.json with omp.extensions → propose OMP plugin install + herdr. Note nmg-pi optional.

2. Legacy layout: .codex/steering/ or .codex/specs/ → propose relocate to root steering/ specs/ (git mv).

3. Directory rename: specs/feature-*/ bug-*/ or {N}-old → specs/{primaryN}-slug/ (from **Issue** or **Issues** first num). Collision ask.

4. Cumulative split: plural **Issues** or issue-scope.json multi → per-N dirs, copy owned, add Related Spec pointers, remove manifest.

5. Epic flatten: specs/epic-*/ + epic-link → per child `{childN}-slug` with `**Issue**: #childN` and a historical note in the owner; delete epic dirs/links. Treat any legacy relation text only as migration evidence for the issue-dependencies category.

6. Leftover spikes: convert unmarked spike ADRs under docs/decisions/ into Draft specs/{N}-{slug}/ four-file packages and stamp `**SDLC-Migrated**` on the ADR. Delete leftover spike-researcher/template files. Remove Spike from the issue form. Unparseable ADRs stay unverifiable.

7. Issue dependencies: list every open and closed repository issue and every official blocked-by edge with complete pagination. Propose only missing official edges supported by closed legacy fields or clear sequencing clauses. Ambiguous prose is a finding only. Reject dangling targets and open cycles before proposal.

8. Managed steering runtime: if legacy `steering/product.md`, `steering/tech.md`, or `steering/structure.md` exists, propose the exact `steering-runtime:<sourceDigest>` category returned by `scripts/sdlc-upgrade.mjs detect`. Approval calls the shared steering writer in migrate mode. It preserves the prose verbatim as registered snippets, validates the complete staged runtime, then removes the three legacy authorities. Existing manifests use update mode; unknown files, snippets, extensions, and `steering/retrospective.md` are preserved.

9. v2 cleanup: sdlc-config.json, legacy runner indicator/state files, and managed .gitignore blocks → propose exact deletion.

10. Plugin runtime ignore: if `.gitignore` lacks an exact `.omp/sdlc/` or `.omp/sdlc` rule, propose adding `.omp/sdlc/` after v2 cleanup.

11. This repository's specs/ are handled identically. Also read CHANGELOG/VERSION/CONTRIBUTING/AGENTS/gates/issue-form and propose current-contract reconciliation.

Read references/detection.md etc for details (update in tree).

## Ask ( <=3 total )

Use ask for choices on each category group or conflicts (rec first, 2-4 opts):

Each category-group or collision question includes a short paragraph stating the situation and the facts needed to choose among the shown options.

e.g. for layout: "The detector found a legacy .codex/ layout that should move to root steering/ and specs/. Relocate legacy .codex/*?" (recommended yes)

For splits/renames: approve group or preserve per item.

For epic: explicit per group "The detector found an epic group whose child specs can become ordinary issue-owned packages. Flatten this epic group?"

Runner cleanup: approve batch or narrow.
Official dependency reconciliation is one category-group ask showing the exact proposed edges and evidence. Approval authorizes those writes; do not ask per edge.
Steering-runtime migration or update is one category-group ask showing the exact source digest, writes, registrations, preserved paths, and legacy deletions. Approval authorizes only that plan.

No silent apply.

## Plan

Write local://upgrade-{slug or date}-plan.md with:

- findings per category

- exact actions / file writes / deletes proposed

- exact helper argv using the detector-returned ids, for example `["node","<plugin-root>/scripts/sdlc-upgrade.mjs","apply","--root",".","--approve","issue-dependencies:<approved-graph-digest>,..."]`

## After Propose

xd://propose the slug + "Upgrade plan for current layout/packaging"

Approved plan execution runs the helper script with the chosen scope (the skill does not call it directly; the plan does).
Approved apply always backfills `spec-created` for unique complete issue-owned spec packages; this is not a declineable category and has no per-issue prompt.

## Generated

Assets use exact v3 invocations list.
