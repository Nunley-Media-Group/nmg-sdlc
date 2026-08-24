---
name: onboard-project
description: "Initialize a project for the SDLC. Use when `/sdlc-onboard-project`. Bootstrap greenfield or reconcile brownfield specs from history. Delegates template upgrade to /sdlc-upgrade-project. Once per project."
---

# Onboard Project

Read tooling and gates references (now native /plan + ask + xd://propose).

## Mode Detection (use glob/read)

Detect:

- steering/ + specs/ present → already-initialized → recommend /sdlc-upgrade-project

- no steering, no source beyond scaffold → greenfield

- steering but no specs, no source → greenfield-enhancement

- source + closed issues, no specs → brownfield

Use git ls-files + gh issue list (closed, limit) + glob specs/*-*/requirements.md

## Greenfield / Enhancement

Use ask (rec first, max 3 total qs) for vision/personas/success, tech stack, deployment if needed.

Each interview or preference question, including the already-initialized delegate-or-exit ask, includes a short paragraph stating the situation and the facts needed to choose among the shown options. Do not paste a full product vision or repository dump into `question`.

Bootstrap or enhance steering/product tech structure from templates/ (read runtime).

Init VERSION (0.1.0 or from manifest), create specs/ empty.

Install managed assets: update CONTRIBUTING.md , AGENTS.md , .github/... using v3 snippets (see references/).

Seed v1 milestone (ask if VERSION semver for choice? but greenfield usually v1).

Optionally seed 1-3 starter via internal plan data? But per contract, use /sdlc-draft-issue for new; onboard may emit starter plan data or note next step.

For plan: write local://onboard-plan.md with actions, then xd propose.

## Brownfield

gh auth, bootstrap steering if needed, reconcile closed issues (non dup/wont) into per {N}-slug specs using template fill + PR evidence if linked + source.

Source backfill if no closed.

Write specs/{N}-{slug}/ + 4 files with singular **Issue** #N , initial history.

Approved greenfield, brownfield, and source-backfill plan execution runs `node <plugin-root>/scripts/spec-created-label.mjs backfill` after writing spec packages or the empty greenfield `specs/` tree. It uses no per-issue confirmation. Already-initialized onboarding that does not mutate specs skips backfill.

## Already

List existing, ask once: delegate to upgrade or exit. On delegate, the plan will note "Run /sdlc-upgrade-project"

Do not mutate specs here.

## Generate Snippets (v3 list)

CONTRIBUTING / AGENTS / gates must emit:

- /sdlc-draft-issue [need]

- /sdlc-write-spec #N

- /sdlc-onboard-project

- /sdlc-upgrade-project

- /sdlc-execute [#N …]

- /sdlc-status
## Finish

Derive slug e.g. onboard-{project or date}

Write local://onboard-{slug}-plan.md (contains mode, files written or to write, next actions)

Write to xd://propose:

onboard-{slug}

Onboard {mode} complete
