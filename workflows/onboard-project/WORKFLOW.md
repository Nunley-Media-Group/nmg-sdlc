---
name: onboard-project
description: "Initialize a project for the SDLC. Use when `/sdlc-onboard-project`. Bootstrap greenfield or reconcile brownfield specs from history. Delegates template upgrade to /sdlc-upgrade-project. Once per project."
---

# Onboard Project

Read `../../references/claude-code-tooling.md` and `../../references/interactive-gates.md` when applying the native plan-mode, `AskUserQuestion`, and `ExitPlanMode` contract.

## Mode Detection (use `Glob` / `Read`)

Detect:

- steering/ + specs/ present → already-initialized → recommend /sdlc-upgrade-project

- no steering, no source beyond scaffold → greenfield

- steering but no specs, no source → greenfield-enhancement

- source + closed issues, no specs → brownfield

Use git ls-files + gh issue list (closed, limit) + `Glob` for specs/*-*/requirements.md

## Greenfield / Enhancement

Use `AskUserQuestion` (recommended option first with ` (Recommended)` appended, max 3 total questions) for vision/personas/success, tech stack, deployment if needed.

Each interview or preference question, including the already-initialized delegate-or-exit question, includes a short paragraph stating the situation and the facts needed to choose among the shown options. Do not paste a full product vision or repository dump into `question`.

Build an exact initialize plan JSON for `node <plugin-root>/scripts/sdlc-steering.mjs apply --project . --plan .nmg-sdlc/plans/onboard-steering.plan.json`. Embed it in the plan file as a fenced `json` block; plan mode is read-only, so write it to `.nmg-sdlc/plans/onboard-steering.plan.json` only after approval, then run that `apply` command. The plan installs the four managed module templates, `steering/manifest.json`, registered project snippets, and deterministic validations. Do not create live `steering/product.md`, `steering/tech.md`, or `steering/structure.md`.

Initialize VERSION (0.1.0 or from manifest), create specs/ empty.

Install managed assets: update CONTRIBUTING.md , AGENTS.md , .github/... using the v4 snippets (see references/).

Seed v1 milestone (ask with `AskUserQuestion` only if VERSION semver leaves a real choice; greenfield usually v1).

Optionally seed 1-3 starter via internal plan data? But per contract, use /sdlc-draft-issue for new; onboard may emit starter plan data or note next step.

For the plan: write the actions to the plan file described in ## Finish, then call `ExitPlanMode`.

## Brownfield

gh auth, bootstrap steering if needed, reconcile closed issues (non dup/wont) into per {N}-slug specs using template fill + PR evidence if linked + source.

Source backfill if no closed.

Write specs/{N}-{slug}/ + 4 files with singular **Issue** #N , initial history.

Approved greenfield, brownfield, and source-backfill plan execution runs `node <plugin-root>/scripts/nmg-sdlc-ignore.mjs ensure --root .` after writing the empty greenfield `specs/` tree or issue-owned spec packages, then runs `node <plugin-root>/scripts/spec-created-label.mjs backfill`. Both commands use no per-issue confirmation. Already-initialized onboarding that does not mutate specs skips both commands and still only recommends `/sdlc-upgrade-project`.

## Already

List existing, ask once with `AskUserQuestion`: delegate to upgrade or exit. On delegate, the plan will note "Run /sdlc-upgrade-project"

Do not mutate specs here.

## Generate Snippets (v4 list)

CONTRIBUTING / AGENTS / gates must emit:

- /sdlc-draft-issue [need]

- /sdlc-write-spec #N

- /sdlc-onboard-project

- /sdlc-upgrade-project

- /sdlc-execute [#N …]

- /sdlc-status
## Finish

Derive slug e.g. onboard-{project or date}

Write the complete plan to the plan-mode plan file (its path is in plan mode's system reminder). It contains mode, files to write, embedded payloads such as the steering initialize plan JSON, and next actions, and its first line is:

```text
# onboard-{slug}: Onboard {mode} complete
```

Then call `ExitPlanMode`; the person approves, edits, or rejects it in the approval dialog. Plan approval starts execution; approval may clear context, so execution takes every file body and payload from the approved plan.
