---
name: upgrade-project
description: "Upgrade an existing project to the latest contract: detect and propose packaging, layout, specification, official dependency-graph, and cleanup repairs. Use when `/sdlc-upgrade-project`. Actual changes run only after plan approval."
---

# Upgrade Project

Interactive detect + propose only, in native plan mode. Mutators in scripts/sdlc-upgrade.mjs (called by approved plan execution). Tool names follow `../../references/claude-code-tooling.md`.


## Detectors (read only: `Read`, `Grep`, `Glob`, `gh` through `Bash`)

1. Packaging: if `.codex-plugin/plugin.json` exists, or root `package.json` still declares the v3 `omp.extensions` manifest, and `.claude-plugin/plugin.json` is absent → propose installing nmg-sdlc as a Claude Code plugin (`claude plugin marketplace add` + `claude plugin install`, or `claude --plugin-dir <checkout>`) plus Herdr.

2. Legacy layout: .codex/steering/ or .codex/specs/ → propose relocate to root steering/ specs/ (git mv).

3. Directory rename: specs/feature-*/ bug-*/ or {N}-old → specs/{primaryN}-slug/ (from **Issue** or **Issues** first num). Collision → `AskUserQuestion`.

4. Cumulative split: plural **Issues** or issue-scope.json multi → per-N dirs, copy owned, add Related Spec pointers, remove manifest.

5. Epic flatten: specs/epic-*/ + epic-link → per child `{childN}-slug` with `**Issue**: #childN` and a historical note in the owner; delete epic dirs/links. Treat any legacy relation text only as migration evidence for the issue-dependencies category.

6. Leftover spikes: convert unmarked spike ADRs under docs/decisions/ into Draft specs/{N}-{slug}/ four-file packages and stamp `**SDLC-Migrated**` on the ADR. Delete leftover spike-researcher/template files. Remove Spike from the issue form. Unparseable ADRs stay unverifiable.

7. Issue dependencies: list every open and closed repository issue and every official blocked-by edge with complete pagination. Propose only missing official edges supported by closed legacy fields or clear sequencing clauses. Ambiguous prose is a finding only. Reject dangling targets and open cycles before proposal.

8. Managed steering runtime: if legacy `steering/product.md`, `steering/tech.md`, or `steering/structure.md` exists, propose the exact `steering-runtime:<sourceDigest>` category returned by `scripts/sdlc-upgrade.mjs detect`. Approval calls the shared steering writer in migrate mode. It preserves the prose verbatim as registered snippets, validates the complete staged runtime, then removes the three legacy authorities. Existing manifests use update mode; unknown files, snippets, extensions, and `steering/retrospective.md` are preserved.

9. v2 cleanup: sdlc-config.json, legacy runner indicator/state files, and managed .gitignore blocks → propose exact deletion.

10. v3 → v4 runtime state: if legacy `.omp/sdlc/` exists, propose the `runtime-state-v4` category. Approval moves every legacy runtime file (handoffs, verification, `run.json`, `safe-recoveries.json`, prompt-provenance, smoke-deliveries, and any other file) to the same relative path under `.nmg-sdlc/`, drops byte-identical legacy duplicates, and deletes the OMP-only `omp-controller.yml` paste config. It never overwrites an existing `.nmg-sdlc/` file: conflicts stay in `.omp/sdlc/` with `runtime_state_conflict`, symlinks and unsafe targets with `runtime_state_unsafe_path`. Show every conflict in the category question.

11. Plugin runtime ignore: if `.gitignore` lacks an exact `.nmg-sdlc/` or `.nmg-sdlc` rule, or still carries the legacy managed `.omp/sdlc/` rule after the legacy directory is gone, propose `nmg-sdlc-ignore` after v2 cleanup and the runtime-state move. Apply swaps the legacy rule in place for `.nmg-sdlc/` (or appends `.nmg-sdlc/`); the legacy rule stays, with `runtime_state_legacy_present`, while legacy runtime files remain.

12. v4 host language: if root `AGENTS.md` carries the managed structure comment `agents/ … # OMP task agents (…)`, propose `agents-v4-host-language`, which rewrites only that comment to `# Claude Code plugin subagents (…)`. Project-authored prose is never rewritten.

12a. v4 steering host language: if registered steering snippets or manifest validation `config.program` / `config.args` carry v3 host tokens, propose `steering-v4-host-language`. It maps `herdr integration install omp`, `omp-sdlc-ignore.mjs`, `exercise-omp.mjs`, `omp --print`, `--kind omp`, `--kind pi`, and `.omp/sdlc/` to their Claude Code forms, `Oh My Pi` and whole-word `OMP` in snippets to `Claude Code`, and validation program `omp` to `claude` with `--print` to `-p`. It applies after `nmg-sdlc-ignore` through the shared steering writer; an unsafe snippet is skipped with `steering_host_language_unsafe_path`.

12b. v4 contributing host language: if a regular root `CONTRIBUTING.md` contains the exact sentence `drives Herdr omp worker panes through implementation, verification, and delivery`, propose `contributing-v4-host-language`, which replaces it with the `Claude` form and leaves every other byte unchanged. It applies in the same order as `steering-v4-host-language`; a symlinked or unreadable file is skipped with `contributing_unsafe_path`.

12c. Project instructions move: if root `AGENTS.md` exists, propose `agents-to-claude-md`. Without `CLAUDE.md` it renames the file (`git mv` when tracked); with a regular `CLAUDE.md` it appends the `AGENTS.md` content after one blank line, keeps one spec-context managed section (the `CLAUDE.md` copy), and deletes `AGENTS.md`. It applies after `agents-spike-language` and `agents-host-language`; a symlinked or unreadable file on either side is `skipped:collision` with no change.

13. This repository's specs/ are handled identically. Also read CHANGELOG/VERSION/CONTRIBUTING/CLAUDE.md/gates/issue-form and propose current-contract reconciliation.

14. Publication File(s): inspect issue-owned `specs/{N}-{slug}/tasks.md` declarations with the shared `publicationFileEntries` grammar. Propose the exact `publication-files:<digest>` rewrites only when rejected lines contain exclusively valid backtick-quoted repository-relative paths plus surrounding prose. Report mixed unsafe quoted spans and unquoted prose-only lines without extracting them. Approved apply must reject a changed source tree with `publication_files_plan_stale` before mutation.

When authorization is bounded to one issue-owned package, do not use repository-wide `detect` or `apply`. Run `detect-publication --root <real-project-root> --spec specs/N-slug`, then `apply-publication` with that same single spec and exact approved id. Resolve with the pre-#388 legacy command set first: if `detect` or `apply` resolves, publication-command positional tokens remain ignored; strict publication parsing applies only when no legacy command resolves. Apply uses one exclusive fsynced root lock and one fsynced root stage. Authorized nmg-sdlc invocations honor the lock. Under that cooperative model every inventory directory is identity-bound around its captured deterministic listing, and selected planning uses the descriptor-carried tasks Buffer. The uninterrupted final boundary completes descriptor-bound authority and exact approval equality, then proves target, stage, and lock through descriptor identity/exact-byte checks before immediate atomic rename. Every observed pre-boundary change fails closed. Node has no portable identity-conditional rename or unlink; non-target inventory mutation after authority completion, and non-cooperative same-credential mutation after a target, stage, or lock proof inside the immediately following pathname syscall gap, are undefined external interference outside this contract. Failed lock cleanup after commit reports `applied: true` and retains validated evidence. No dependencies, backfill, GitHub, or other phase runs.

Read references/detection.md and references/v3-detectors.md (including its v4 section) for details.

## Interview (`AskUserQuestion`, at most 3 calls)

Use `AskUserQuestion` for choices on each category group or conflict: 2-4 options per question, the recommended option first with its label ending in ` (Recommended)`, at most 4 questions per call. Never add Other, Cancel, or Skip options; the typed Other answer is automatic.

Each category-group or collision question includes a short paragraph stating the situation and the facts needed to choose among the shown options.

e.g. for layout: "The detector found a legacy .codex/ layout that should move to root steering/ and specs/. Relocate legacy .codex/*?" (recommended yes)

For splits/renames: approve group or preserve per item.

For epic: explicit per group "The detector found an epic group whose child specs can become ordinary issue-owned packages. Flatten this epic group?"

Runner cleanup: approve batch or narrow.
v3 → v4 runtime state and the ignore-rule swap are one category-group question showing the exact moves, duplicates, obsolete deletions, and preserved conflicts with their reason codes.
Official dependency reconciliation is one category-group question showing the exact proposed edges and evidence. Approval authorizes those writes; do not ask per edge.
Steering-runtime migration or update is one category-group question showing the exact source digest, writes, registrations, preserved paths, and legacy deletions. Approval authorizes only that plan.

No silent apply.

## Plan

Write the plan to the plan-mode plan file (its path is in plan mode's system reminder), headed `# upgrade-{slug or date}: Upgrade plan for current layout/packaging`, with:

- findings per category

- exact actions / file writes / deletes proposed

- exact helper argv using the detector-returned controller path, for example `["node","<plugin-root>/scripts/sdlc-upgrade.mjs","apply","--root",".","--approve","issue-dependencies:<approved-graph-digest>,..."]`
- for package-bounded publication only, exact argv of the form `["node","<plugin-root>/scripts/sdlc-upgrade.mjs","apply-publication","--root",".","--spec","specs/42-slug","--approve","publication-files:<approved-selection-digest>"]`

## After Propose

Call `ExitPlanMode`. The person approves, edits, or rejects the plan in Claude Code's approval dialog; never ask for approval in prose or with `AskUserQuestion`.

Approved plan execution runs the helper script with the chosen scope (the skill does not call it directly; the plan does).
Full `apply` always backfills `spec-created` for unique complete issue-owned spec packages; this is not a declineable category and has no per-issue prompt. Selected `apply-publication` never backfills labels or runs any other upgrade phase.

## Generated

Assets use the exact v4 invocations list.
