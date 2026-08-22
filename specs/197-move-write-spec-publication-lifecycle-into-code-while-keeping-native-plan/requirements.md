# Requirements: Move write-spec publication lifecycle into code while keeping native plan

**Issue**: #197
**Date**: 2026-08-21
**Status**: Approved
**Author**: NMG
**Related Spec**: specs/5-write-spec-skill/

---

## User Story

**As a** write-spec operator in the TUI
**I want** issue discovery, approval publication, and continue-loop candidate filtering to run in existing publish helpers
**So that** the model spends tokens on requirements and design, not git/gh lifecycle prose

---

## Background

`scripts/publish-approved-spec.mjs` already implements the mutation boundary: `prepare`, `commit-push`, `merge`, and `default-branch`. `scripts/sdlc-execute.mjs` already exports `specStatus`, `isSpecApproved`, and `resolveSpecDir`. The write-spec workflow still describes deterministic discovery, branch-ref approval filtering, and publication lifecycle in prose.

The native `/plan` surface is intentional. Code must not generate requirements or design, remove the four full file bodies from `local://spec-{N}-plan.md`, bypass `xd://propose`, or add a print/RPC command surface.

---

## Acceptance Criteria

### AC1: one lifecycle helper owns deterministic discovery

**Given** an explicit issue number N
**When** write-spec begins discovery
**Then** it invokes `node scripts/publish-approved-spec.mjs discover --issue N`
**And** the helper returns one JSON object containing issue number, title, body, labels, state, feature-or-bug classification, derived slug, target directory, resolved existing spec directory, approval state, and approval source
**And** slug derivation is lowercase title with non-alphanumeric runs replaced by hyphens, trimmed, with `issue` fallback
**And** `bug` label selects bug while every other label set selects feature; leftover `spike` does not create a third path
**And** approval and unique-directory resolution reuse `specStatus` / `resolveSpecDir` rather than reimplementing them
**And** unreadable issues, ambiguous spec directories, and invalid issue arguments fail closed with stable reason codes

### AC2: helper returns sorted continue candidates

**Given** zero or more issue numbers already published in this session
**When** write-spec invokes `node scripts/publish-approved-spec.mjs candidates [--published N ...]`
**Then** the helper reads up to 100 open GitHub issues, drops published numbers, and drops issues whose unique worktree, local branch, or remote branch package is Approved under `specStatus`
**And** it returns every remaining `{number,title}` candidate sorted by issue number ascending
**And** it does not truncate to three or generate TUI labels
**And** the workflow still owns the native 2–4-option ask, shows at most three candidate choices plus Finished, and recommends the first

### AC3: publication behavior remains exact

**Given** a native plan has been approved
**When** plan execution publishes the package
**Then** it still runs `prepare`, writes exactly four Approved files, runs `commit-push`, and runs `merge` in that order
**And** commit and PR title remain `docs: approve spec for #N`
**And** the spec PR body mentions `#N` without any GitHub closing keyword
**And** helpers never force-push, never stage with `git add -A`, never guess `main`, and leave recoverable branch/files on failure
**And** successful merge leaves the working tree on the repository default branch while issue N remains open
**And** existing publication helper behaviors and JSON failures remain compatible

### AC4: native plan and interview behavior remain

**Given** a first `/sdlc-write-spec #N` TUI session
**When** requirements and design are prepared
**Then** `local://spec-{N}-plan.md` still contains the full final text for `requirements.md`, `design.md`, `tasks.md`, and `feature.gherkin`
**And** every issue gets at most three interview asks
**And** only the first spec in the session uses `xd://propose`; continuation specs do not
**And** post-approval execution writes `**Status**: Approved` and singular `**Issue**: #N` on all four files
**And** code does not generate, summarize, or truncate spec bodies

### AC5: public surfaces and finish text remain

**Given** write-spec runs outside the interactive TUI
**When** print or RPC attempts invocation
**Then** it still fails closed with `Run /sdlc-write-spec in the TUI.`
**And** no `commands/sdlc-write-spec.md` is created
**And** Finished still prints exactly `Published specs: #<n> on <n>-<slug>[, ...]` followed by `Next step: /sdlc-execute #<first-published>`
**And** the session remains on the repository default branch

---

## Functional Requirements

| ID | Requirement | Priority | Notes |
|----|-------------|----------|-------|
| FR1 | Extend `scripts/publish-approved-spec.mjs` with `discover --issue N`. | Must | Return complete deterministic discovery JSON. |
| FR2 | Extend the same helper with `candidates` accepting repeated `--published N`. | Must | Return all sorted data rows, not ask presentation. |
| FR3 | Import and reuse execute `specStatus` / `resolveSpecDir` approval rules. | Must | No second approval detector. |
| FR4 | Keep `prepare`, `commit-push`, `merge`, and `default-branch` argv and behavior compatible. | Must | Existing tests remain authoritative. |
| FR5 | Compact write-spec lifecycle prose around helper calls while preserving native interview and full-text plan authoring. | Must | Requirements/design remain model-authored. |
| FR6 | Preserve TUI-only routing, one initial `xd://propose`, continue-loop ask shape, exact finish text, and absence of generated write-spec command markdown. | Must | No public surface expansion. |

---

## Change History

| Issue | Date | Summary |
|-------|------|---------|
| #197 | 2026-08-21 | Initial feature spec |
