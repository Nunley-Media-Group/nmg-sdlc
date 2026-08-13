# Requirements: Add Lifecycle Status Command for Active SDLC Work

**Issues**: #145
**Date**: 2026-08-12
**Status**: Approved — amended
**Author**: Codex

---

## User Story

**As a** developer using the manual nmg-sdlc workflow
**I want** a concise lifecycle-status command that infers the active issue, stage, and exact next action
**So that** I can recover work quickly without manually inspecting git state, specs, verification evidence, and GitHub metadata

---

## Background

The manual nmg-sdlc workflow spans issue selection, specification, implementation, simplification, verification, pull-request delivery, and review cleanup. After a session resumes, the current stage is encoded across the branch, local files, issue metadata, pull requests, and CI rather than exposed through one diagnostic surface.

The lifecycle-status command provides that surface without becoming another workflow mutator. It prefers current evidence over assumptions, distinguishes known facts from unavailable evidence, and recommends the existing nmg-sdlc command that owns the next mutation. The command serves both people who want a compact summary and automation that needs stable structured output.

The automated SDLC runner is scheduled for removal in milestone 2. This feature must not add, preserve, or depend on runner-specific contracts while that removal is pending.

---

## Acceptance Criteria

### AC1: Infer the Current Manual SDLC Stage

**Given** a developer is on `main`, an issue branch, or a branch associated with a pull request
**When** the lifecycle-status command reads available local artifacts and GitHub metadata
**Then** it reports the inferred issue, branch, lifecycle stage, completed artifacts, missing artifacts, and exact next nmg-sdlc command
**And** each stage claim is supported by observed evidence rather than branch position alone

### AC2: Remain Read-Only

**Given** the repository contains dirty worktree changes or stale local artifacts
**When** the lifecycle-status command runs in human-readable or machine-readable mode
**Then** it reports relevant conditions without modifying files, git refs, branches, issues, pull requests, project status, or processes
**And** repeated invocations over unchanged evidence produce equivalent lifecycle conclusions

### AC3: Handle Partial and Unavailable Context

**Given** one or more optional sources such as a spec package, verification report, pull request, CI result, or GitHub access are absent or unavailable
**When** the lifecycle-status command infers the stage
**Then** it uses the remaining bounded evidence, labels unavailable facts as unknown, and lists material evidence gaps
**And** it does not advance the reported stage beyond the strongest consistent evidence

### AC4: Never Prompt

**Given** a developer invokes the lifecycle-status command in any repository state
**When** it evaluates the available lifecycle evidence
**Then** it produces a result without a review, confirmation, or clarification prompt
**And** it never performs the next recommended action itself

### AC5: Provide Stable Automation Output

**Given** a caller requests machine-readable output
**When** the lifecycle-status command completes
**Then** it emits valid JSON with a documented schema version and stable fields for project, issue, spec, verification, pull request, stage, completed artifacts, missing artifacts, gaps, and next action
**And** diagnostic prose and recoverable probe failures do not corrupt the JSON stream

---

## Functional Requirements

| ID | Requirement | Priority | Notes |
|----|-------------|----------|-------|
| FR1 | Add a first-class `$nmg-sdlc:status` command that is read-only for every invocation. | Must | The skill delegates deterministic inspection to a bundled zero-dependency Node.js CLI. |
| FR2 | Infer the active issue, branch, manual lifecycle stage, completed artifacts, missing artifacts, and next action from bounded local and GitHub evidence. | Must | Prefer direct local and live GitHub evidence over assumptions. |
| FR3 | Guarantee that status collection does not write, delete, stage, commit, checkout, push, signal, or invoke a mutating GitHub operation. | Must | Dirty worktrees are reportable inputs, not cleanup triggers. |
| FR4 | Produce concise human-readable output containing the exact recommended nmg-sdlc command and the evidence supporting it. | Must | Unknown or conflicting evidence is surfaced as a gap. |
| FR5 | Degrade safely when optional local artifacts or GitHub metadata are absent, malformed, unsupported, or unreachable. | Must | Recoverable probe failures must not turn into false stage completion. |
| FR6 | Support `--json` output with a schema-versioned, stable automation contract. | Should | JSON is the only stdout content in machine-readable mode. |
| FR7 | Document the command, output contract, evidence precedence, and read-only boundary. | Should | README is the public capability reference. |
| FR8 | Keep runner integration outside the status implementation. | Must | No runner state, logs, sentinel, PID, resume, cleanup, or runner-file modifications. |

---

## Non-Functional Requirements

| Aspect | Requirement |
|--------|-------------|
| **Performance** | Use bounded filesystem and GitHub probes; do not scan full file bodies or histories when targeted queries suffice. |
| **Security** | Treat repository and GitHub values as untrusted data; never interpolate unvalidated values into a shell command. |
| **Reliability** | A failed optional probe produces an explicit gap while preserving successfully collected evidence. |
| **Determinism** | Identical collected evidence yields the same stage, artifact classification, gaps, and next action. |
| **Platforms** | Use Node.js ESM and `node:path`/`node:fs` conventions for macOS, Linux, and Windows. |

---

## UI/UX Requirements

| Element | Requirement |
|---------|-------------|
| **Invocation** | `$nmg-sdlc:status` for text and `$nmg-sdlc:status --json` for structured output. |
| **Human summary** | Lead with stage and end with the exact next action; show issue/branch, artifacts, and gaps in stable order. |
| **Unknown state** | Use explicit `unknown`/`unavailable` wording; never imply that absent evidence passed. |
| **Errors** | Reserve non-zero exit for invalid invocation or inability to identify a git project; optional-source failures return degraded output. |
| **Prompts** | Never prompt. Status is observational. |

---

## Data Requirements

### Input Data

| Source | Type | Validation | Required |
|--------|------|------------|----------|
| Git repository root and branch/worktree state | Local git metadata | Resolve from the current working directory and parse branch issue prefix conservatively | Yes |
| `specs/*/requirements.md` and sibling artifacts | Local files | Strict issue/frontmatter or branch-slug match; bounded metadata reads | No |
| Verification report | Local Markdown | Require an explicit current implementation status | No |
| GitHub issue, pull request, and checks | `gh` JSON | Use read-only commands with bounded fields; isolate command failures | No |

### Output Data

| Field | Type | Description |
|-------|------|-------------|
| `schemaVersion` | integer | Structured-output contract version, initially `1`. |
| `project` | object | Repository root, branch, cleanliness, and changed paths. |
| `issue` | object or null | Number, title/state when known, and evidence source. |
| `spec` | object or null | Strictly matched spec directory and required-file status. |
| `verification` | object or null | Report location/status and whether it supports delivery readiness. |
| `pullRequest` | object or null | Number/state/check state when available. |
| `stage` | string | Conservative manual lifecycle conclusion. |
| `completedArtifacts` | array | Evidence-backed completed artifacts or transitions. |
| `missingArtifacts` | array | Expected artifacts absent at the inferred stage. |
| `gaps` | array | Unavailable, malformed, or conflicting evidence. |
| `nextAction` | object | Exact command, reason, and whether manual repair is required. |

---

## Dependencies

### Internal Dependencies

- [ ] Strict issue-to-spec lookup and required spec-file contract
- [ ] Verification-report structure from `$nmg-sdlc:verify-code`
- [ ] Read-only issue, pull-request, and CI queries supported by `gh`
- [ ] `$skill-creator` for authoring the new skill-bundled file

### External Dependencies

- [ ] Node.js v24+ runtime
- [ ] Git CLI for local repository evidence
- [ ] GitHub CLI for optional live metadata

### Blocked By

None.

---

## Out of Scope

- Automated-loop runner integration, which is scheduled for removal in milestone 2.
- Reading or interpreting `scripts/sdlc-runner.mjs`, `.codex/sdlc-state.json`, `.codex/unattended-mode`, runner logs, runner PIDs, or runner configuration.
- Recommending runner resume, runner cleanup, or `$nmg-sdlc:end-loop` actions.
- Modifying runner code, runner tests, runner configuration, or runner lifecycle contracts.
- Mutating GitHub Project status or any other issue or pull-request metadata.
- Applying repairs, implementing missing work, running verification, creating a pull request, or merging.
- Building a visual dashboard or cross-repository status aggregator.

---

## Success Metrics

| Metric | Target | Measurement |
|--------|--------|-------------|
| Scenario coverage | 5/5 approved acceptance criteria | Gherkin mapping plus automated fixture cases |
| Read-only safety | Zero repository or GitHub mutations across fixtures | Before/after filesystem, git, and command-spy assertions |
| Stage correctness | All supported manual lifecycle fixtures classify as expected | Table-driven status tests |
| Degraded behavior | Every optional-probe failure returns useful output with a named gap | Malformed/absent/unavailable fixture tests |
| Runner independence | Zero runner files, artifacts, or contracts read or modified | Static path and command coverage |

---

## Open Questions

None.

---

## Change History

| Issue | Date | Summary |
|-------|------|---------|
| #145 | 2026-08-12 | Initial feature spec |
| #145 | 2026-08-12 | Amended to make automated-runner integration explicitly out of scope ahead of milestone-2 removal |
