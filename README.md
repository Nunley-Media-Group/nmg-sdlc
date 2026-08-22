# nmg-sdlc

Spec-driven delivery for Oh My Pi and Herdr.

## Overview

nmg-sdlc is a stack-agnostic BDD spec-driven development toolkit. It turns GitHub issues into verified implementations through extension commands. Interactive commands enter native `/plan` for grooming and spec approval; `/sdlc-execute` drives automated delivery.

Primary user journey:

```text
/sdlc-draft-issue [need]
  → /sdlc-write-spec #N
  → /sdlc-execute [#N …]
```

`/sdlc-status` is the read-only diagnostic available at any point.

Public commands are registered by `src/extension.ts` with an `sdlc-` prefix. Interactive commands (`sdlc-draft-issue`, `sdlc-write-spec`, `sdlc-onboard-project`, `sdlc-upgrade-project`) enter native `/plan` using built-in `ask` + `xd://propose`. Automated stages after spec approval are driven by `/sdlc-execute`, which orchestrates Herdr `omp` worker panes.

Project `steering/` documents encode product and engineering conventions for the stack. `run-retro` derives reusable learnings from past defect specs into `steering/retrospective.md`.

## Installation

Install via the OMP plugin system (this repository or its entry in the nmg-plugins marketplace):

```bash
omp plugin install <this github repo or marketplace entry>
```

Integrate with Herdr once per machine:

```bash
herdr integration install omp
```

Private repositories may require a `GITHUB_TOKEN` with appropriate read access.

## First-Time Setup

Interactive flows use native OMP `/plan`. Run onboarding from the project root:

```text
/sdlc-onboard-project
```

- Greenfield projects receive a product/technology interview, root steering documents, `VERSION` + manifest initialization, a `v1` milestone seed, and starter issues.
- Brownfield projects reconcile specs from closed issues, merged PR evidence, and the current source tree.
- Already-initialized projects delegate contract reconciliation to `/sdlc-upgrade-project`.

Onboarding and upgrade manage these repository artifacts:

- `CONTRIBUTING.md` plus an idempotent README link.
- A bounded nmg-sdlc spec-context section in root `AGENTS.md`.
- `.github/workflows/nmg-sdlc-contribution-gate.yml`.
- `.github/ISSUE_TEMPLATE/nmg-sdlc-ready-issue.yml`.

The contribution gate validates issue/spec identity (using singular `**Issue**: #N`), task or verification evidence for changed paths, steering context, and documented exception predicates. Documentation-only changes have a path-validated reduced mode. An owner-approved breaking repository rewrite may waive only current PR issue/spec identity when the `feat!:` title, required repository contract paths, explicit rewrite contract and durable verification, genuinely owned current specs, steering, exact path mapping, and specific verification all pass. The gate uses read-only GitHub token permissions and does not replace project CI or human review.

This repository's own CI (`.github/workflows/nmg-sdlc-verify.yml`) runs `cd scripts && npm test`, `node scripts/verify-plugin-surface.mjs --root . --label repository`, and `node scripts/verify-current-specs.mjs` on every pull request. Workflow-text drift is still gated by `.github/workflows/skill-inventory-audit.yml`.


## Spec Context

Project-root `specs/` contains the canonical current BDD contracts and active issue specs with genuine GitHub issue owners. Superseded or mismatched packages remain available in Git history instead of staying normative in the working tree. Rewrite-only behavior without an issue owner is documented in `references/rewrite-contract.{json,md}` with evidence in `references/rewrite-verification.md`, never assigned a synthetic `#N`. Workflows resolve the active issue spec first, then load only a bounded, relevant set of neighbors.

Specs use directories of the form `specs/{N}-{slug}/` where `N` is the GitHub issue number:

```text
specs/42-add-user-auth/
├── requirements.md
├── design.md
├── tasks.md
├── feature.gherkin
```

Every spec file begins with singular frontmatter:

```markdown
**Issue**: #42
**Date**: YYYY-MM-DD
**Status**: Draft | Approved
**Author**: ...
**Related Spec**: specs/17-prior-auth/   # required for defects; optional otherwise
```

- `**Status**` is `Draft` or `Approved` only.
- One issue owns exactly one `specs/{N}-{slug}/` directory.
- No `issue-scope.json`, no cumulative multi-issue manifests, no epic type.
- Sequencing uses `Depends on:` and `Blocks:` lines in issue bodies.
- Legacy `feature-*`, `bug-*`, `epic-*`, and `.codex/specs/` layouts are upgrade inputs only.
- Breaking repository rewrites remove obsolete spec packages and must pass `node scripts/verify-current-specs.mjs`.

## Workflow

### Draft an Issue

```text
/sdlc-draft-issue "add user authentication"
```

Classifies the request (Bug / Enhancement), investigates relevant code, interviews via native `ask`, drafts BDD acceptance criteria as Given/When/Then plus functional requirements, and creates the GitHub issue after approval. Multi-part requests may be split into dependency-aware ordinary issues.

### Write Specs

```text
/sdlc-write-spec #42
```

Creates or updates the executable spec package under `specs/{N}-{slug}/`. The spec frontmatter is set to `**Status**: Approved`.

### Automated Delivery

```text
/sdlc-execute #42
/sdlc-execute          # selects from ready backlog when no argument
```

After an approved spec, `/sdlc-execute` drives automated SDLC delivery using Herdr `omp` worker panes for implementation (`write-code`), two host `/review` passes against literal `main` with dedicated finding-fix panes, verification, and delivery (`open-pr`). Implementation is conventionally committed and pushed before the first review. Execute submits `/review` directly to each host worker, selects PR-style mode and `main` interactively, then persists the review result; it never starts nested OMP. It creates sibling panes, writes validated handoff records under `.omp/sdlc/handoffs/`, and advances only on explicit handoff `passed` with `intervention=false`.

`open-pr` (via execute) handles staging approved paths, version bump (per steering/tech.md rules), commit, push, PR creation or resume, remediation of actionable findings, exact-head merge, and issue closure. Success requires the PR to be `MERGED` and the issue `CLOSED`.

### Address Review Comments

`/sdlc-execute` includes `address-pr-comments` in the delivery loop for automated-reviewer threads.

### Lifecycle Status

```text
/sdlc-status
/sdlc-status --json
```

Status reports read-only git state, active spec, verification evidence, issue/PR state, and next recommended action. It never prompts or mutates. An executing run also surfaces via `.omp/sdlc/run.json` and custom session entries.

## Project Upgrades

```text
/sdlc-upgrade-project
```

Reconciles steering/spec trees, templates, and managed assets. Detects and proposes (never silently applies) layout modernizations such as legacy spec directory renames, cumulative splits, leftover spike conversion, and removal of obsolete v2 runner files. All changes require explicit per-group approval. Legacy directories remain readable until upgraded.

## Versioning

`VERSION` is the source of truth and must stay synchronized with `package.json` `"version"`. `/sdlc-execute` (via open-pr) consults `steering/tech.md` for label-to-bump rules:

| Issue label   | Default bump |
|---------------|--------------|
| `bug`         | Patch        |
| `enhancement` | Minor        |

Unmatched defaults to minor. Major bumps require an explicit `**Version bump**: major` line (case-insensitive) inside an approved `requirements.md` or `design.md`. If the issue title/body contains `BREAKING` and that marker is absent, delivery fails closed.

`[Unreleased]` changelog entries are rolled into the versioned heading on successful delivery.

## Verification Gates

`steering/tech.md` may declare project-specific gates. Applicable gates become mandatory evidence for `verify-code`.

## Commands

| Command                      | Invocation                          | Purpose |
|------------------------------|-------------------------------------|---------|
| sdlc-onboard-project         | /sdlc-onboard-project               | Initialize or reconcile a project with steering and managed assets |
| sdlc-draft-issue             | /sdlc-draft-issue [need]            | Create a groomed GitHub issue with BDD acceptance criteria |
| sdlc-write-spec              | /sdlc-write-spec #N                 | Publish `specs/{N}-{slug}/` and mark Approved |
| sdlc-execute                 | /sdlc-execute [#N …]                | Drive automated delivery through Herdr omp workers to merge + close |
| sdlc-status                  | /sdlc-status [--json]               | Report current manual lifecycle state |
| sdlc-verify-code             | /sdlc-verify-code #N                | Verify an already-implemented branch against the approved spec |
| sdlc-open-pr                 | /sdlc-open-pr #N                    | Deliver a verified branch through exact-head merge |
| sdlc-upgrade-project         | /sdlc-upgrade-project               | Reconcile contracts and propose legacy repairs |
| sdlc-run-retro               | /sdlc-run-retro                     | Derive steering learnings from defect specs |
| address-pr-comments          | (internal to open-pr)               | Close automated-reviewer feedback loops |

`/sdlc-execute` owns the full start → implement → review1 → fix1 → review2 → fix2 → verify → deliver queue. `/sdlc-verify-code` and `/sdlc-open-pr` are the phase commands for trees that already have implementation or verification evidence.

## License

MIT License. See [LICENSE](LICENSE) for details.

## Contributing

See [CONTRIBUTING.md](CONTRIBUTING.md) for the issue, specification, verification, and automated-delivery contracts used by this repository.
