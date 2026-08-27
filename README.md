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

Public commands are registered by `src/extension.ts` with an `sdlc-` prefix. Interactive commands (`sdlc-draft-issue`, `sdlc-write-spec`, `sdlc-onboard-project`, `sdlc-upgrade-project`, `sdlc-steering`) enter native `/plan` using built-in `ask` + `xd://propose`. Automated stages after spec approval are driven by `/sdlc-execute`, which orchestrates Herdr `omp` worker panes.

Project context is registered by `steering/manifest.json`: four plugin-managed runtime modules, project-owned Markdown snippets, optional trusted extensions, and deterministic validations. `/sdlc-steering` plans exact initialize/update/migrate actions and applies them through a staged, approval-gated writer. `run-retro` independently maintains `steering/retrospective.md`.

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

- Greenfield projects receive a product/technology interview, a managed steering runtime with registered project snippets and validations, `VERSION` + manifest initialization, a `v1` milestone seed, and starter issues.
- Brownfield projects reconcile specs from closed issues, merged PR evidence, and the current source tree.
- Already-initialized projects delegate contract reconciliation to `/sdlc-upgrade-project`.

Onboarding and upgrade manage these repository artifacts:

- `CONTRIBUTING.md` plus an idempotent README link.
- A bounded nmg-sdlc spec-context section in root `AGENTS.md`.
- `.github/workflows/nmg-sdlc-contribution-gate.yml`.
- `.github/ISSUE_TEMPLATE/nmg-sdlc-ready-issue.yml`.
- `.gitignore` rule `.omp/sdlc/`, keeping plugin run state and handoffs out of commits; upgrade adds the ignore rule, and start/execute subsequently untrack previously committed runtime without deleting working-tree files.

The contribution gate validates issue/spec identity (using singular `**Issue**: #N`), task or verification evidence for changed paths, steering context, and documented exception predicates. Documentation-only changes have a path-validated reduced mode. An owner-approved breaking repository rewrite may waive only current PR issue/spec identity when the `feat!:` title, required repository contract paths, explicit rewrite contract and durable verification, genuinely owned current specs, steering, exact path mapping, and specific verification all pass. The gate uses read-only GitHub token permissions and does not replace project CI or human review.

This repository's own CI (`.github/workflows/nmg-sdlc-verify.yml`) runs `cd scripts && npm test`, `node scripts/verify-plugin-surface.mjs --root . --label repository`, and `node scripts/verify-current-specs.mjs` on every pull request. Workflow-text drift is still gated by `.github/workflows/skill-inventory-audit.yml`.


## Managed Steering

Run `/sdlc-steering` from the project root when project context or verification policy changes:

```text
/sdlc-steering "update the supported runtime and deployment constraints"
/sdlc-steering "register a required integration-test validation"
```

The command is interactive and TUI-only. It enters native `/plan`, inspects the current steering runtime, and proposes an exact `initialize`, `update`, or `migrate` plan. No live file changes occur until that plan is explicitly approved. Apply rejects a stale source digest, builds and validates the complete candidate runtime before replacing live files, and reports stable reason codes without making an unapproved retry.

`steering/manifest.json` is the only registration authority:

- `steering/modules/{product,tech,structure,verification}.mjs` are the four plugin-managed runtime descriptors.
- `steering/snippets/*.md` are project-owned context files loaded only by their declared consumers, slots, order, and byte bounds.
- `steering/extensions/*.mjs` are explicitly trusted project providers.
- `validations[]` registers deterministic required or optional gates and their closed applicability conditions. Canonical descriptors omit `timeoutMs`; missing means no deadline.

The command reads only registered module, snippet, and extension files. Unknown project-owned files are preserved and never loaded implicitly. `/sdlc-run-retro` separately maintains `steering/retrospective.md`; `/sdlc-steering` does not manage that file.

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
- Sequencing uses only GitHub's official blocked-by relation; body fields, labels, epics, spikes, and sub-issues are not dependency authority.
- Legacy `feature-*`, `bug-*`, `epic-*`, and `.codex/specs/` layouts are upgrade inputs only.
- Breaking repository rewrites remove obsolete spec packages and must pass `node scripts/verify-current-specs.mjs`.

## Workflow

### Draft an Issue

```text
/sdlc-draft-issue "add user authentication"
```

Classifies the request (Bug / Enhancement), investigates relevant code, and interviews via native `ask` until every material preference, acceptance criterion, and scope boundary that tools cannot discover is gathered. It then drafts BDD acceptance criteria as Given/When/Then plus functional requirements and creates the GitHub issue after approval. Multi-part requests may be split into ordinary issues connected by preflighted official blocked-by edges.

### Write Specs

```text
/sdlc-write-spec [#42]
```

With an issue number, creates or updates its executable spec package under `specs/{N}-{slug}/`. With no argument, presents up to three open issues missing the exact `spec-created` label. Published spec frontmatter is set to `**Status**: Approved`.

### Automated Delivery

```text
/sdlc-execute #42
/sdlc-execute          # choose from open spec-created issues
```

After an approved spec, `/sdlc-execute` drives automated SDLC delivery using Herdr `omp` worker panes for implementation (`write-code` plus behavior-preserving `simplify`), two host `/review` passes against literal `main` with dedicated finding-fix panes, verification, and delivery (`open-pr`). Implementation is conventionally committed and pushed before the first review. Herdr/controller waits remain unbounded while the worker is observable; they end only on success, genuine failure, explicit cancellation, or confirmed process loss. Execute submits `/review` directly to each host worker, selects PR-style mode and `main` interactively—including when OMP wraps long prompts—and never starts `--kind pi` workers or stops Herdr.

Publishing an approved spec applies the `spec-created` label. Execute accepts comma- or whitespace-separated lists, preserves listed order after deduplication, normalizes OMP-expanded `issue://N` and `pr://N` arguments, and starts only labeled issues. Empty invocation presents the packaged multi-select over open labeled issues; Continue starts selected chips followed by valid Other tokens, while an empty Continue reopens the picker. A failed handoff may route a later resume back to a validated earlier lifecycle gate; execute keeps the current issue and reruns every downstream gate before delivery or later issues.

`open-pr` invokes the deterministic `sdlc-deliver.mjs` controller for approved-spec and verification gates, version synchronization, commit and non-force push, exact-branch PR creation or resume, readiness polling, exact-head merge, issue-closure proof, and deliver handoff writing. Readiness and automated-review polling have no wall-clock or poll-count deadline while their processes remain observable. Success requires the PR to be `MERGED` at the observed head and the issue `CLOSED`.

### Address Review Comments

`address-pr-comments` remains on-demand guidance. The deliver worker loads remediation context only when the controller exits 3 with an `NMG_SDLC_REMEDIATION` packet for an actionable automated-reviewer thread or failing check; green delivery does not inline it.

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

Reconciles steering/spec trees, templates, managed assets, and the complete repository dependency graph. It detects and proposes—never silently applies—managed steering-runtime migration, layout modernizations, cumulative splits, leftover spike conversion, official blocked-by edges supported by explicit legacy evidence, obsolete v2 runner cleanup, and the `.omp/sdlc/` runtime ignore rule. Steering migration preserves legacy prose as registered snippets and removes legacy authority only after staged validation. Every mutation group requires approval.

## Versioning

`VERSION` is the source of truth. `/sdlc-execute` (via `open-pr`) synchronizes `CHANGELOG.md` and each stack-specific version mirror declared in the manifest-registered technical steering `## Versioning` table. JSON and TOML mirrors use dot-separated field paths; other text mirrors use an unambiguous field locator. `package.json` is updated only when the project declares it, so Python and other non-Node projects retain their native version artifacts. The same steering snippets provide label-to-bump rules:

| Issue label   | Default bump |
|---------------|--------------|
| `bug`         | Patch        |
| `enhancement` | Minor        |

Unmatched defaults to minor. Major bumps require an explicit `**Version bump**: major` line (case-insensitive) inside an approved `requirements.md` or `design.md`. If the issue title/body contains `BREAKING` and that marker is absent, delivery fails closed.

`[Unreleased]` changelog entries are rolled into the versioned heading on successful delivery. Missing, unsafe, ambiguous, or unsynchronized declared version mirrors fail before the delivery commit.

## Verification Gates

Manifest validations declare deterministic providers and closed applicability conditions. `/sdlc-verify-code` runs every applicable validation without a wall-clock deadline and records identity-bound results plus exact declaration/result coverage in `.omp/sdlc/verification/<issue>.json`. Commands run in owned process groups; explicit cancellation and confirmed process loss trigger platform-appropriate cleanup and remain fail-closed outcomes. A project with zero declared validations has complete zero-result coverage; declared results that are missing, duplicated, unknown, failed, or incomplete forbid successful status under the applicable ceiling rules. After a passing report is generated, delivery revalidates the same immutable evidence against the exact head.

## Commands

| Command                      | Invocation                          | Purpose |
|------------------------------|-------------------------------------|---------|
| sdlc-onboard-project         | /sdlc-onboard-project               | Initialize or reconcile a project with steering and managed assets |
| sdlc-draft-issue             | /sdlc-draft-issue [need]            | Create a groomed GitHub issue with BDD acceptance criteria |
| sdlc-write-spec              | /sdlc-write-spec [#N]               | Choose an issue missing `spec-created`, or publish the specified `specs/{N}-{slug}/` package |
| sdlc-steering                | /sdlc-steering [prompt]              | Plan and apply managed steering, snippets, extensions, and validations |
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
