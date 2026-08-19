# Design: Add Lifecycle Status Command for Active SDLC Work

**Issue**: #145
**Date**: 2026-08-12
**Status**: Approved
**Author**: Codex

---

## Overview

This feature adds a thin `$nmg-sdlc:status` skill backed by a deterministic, zero-dependency Node.js CLI. The skill resolves the active project and its installed plugin root, then invokes `scripts/sdlc-status.mjs` in text or JSON mode. The CLI owns evidence collection and stage inference so behavior is testable outside a model-authored prompt.

Status inference is evidence-first and conservative. Local git and artifact evidence is always collected; read-only GitHub probes add issue, pull-request, and CI facts when available. Conflicts and probe failures become explicit gaps. The inference engine advances only to the strongest stage supported by consistent evidence and delegates every mutation to an existing nmg-sdlc command through `nextAction`.

The automated SDLC runner is scheduled for removal in milestone 2. The status implementation intentionally has no runner integration or shared runner contract: it does not read state, sentinels, logs, PIDs, or runner configuration, and it does not modify runner code or tests.

---

## Architecture

```text
┌─────────────────────────────────────────────────────────────┐
│ `$nmg-sdlc:status [--json]`                                │
│ `skills/status/SKILL.md`                                   │
│ - resolve project/plugin root                              │
│ - invoke deterministic CLI                                 │
└──────────────────────────────┬──────────────────────────────┘
                               │
                               ▼
┌─────────────────────────────────────────────────────────────┐
│ `scripts/sdlc-status.mjs`                                  │
│                                                             │
│  Evidence collectors → Normalized snapshot → Inference      │
│                                            ├→ Text renderer  │
│                                            └→ JSON renderer  │
└───────────────┬──────────────────────────────┬──────────────┘
                │                              │
                ▼                              ▼
┌────────────────────────────┐   ┌────────────────────────────┐
│ Local read-only evidence   │   │ GitHub read-only evidence  │
│ git, specs, verification   │   │ issue, PR, checks          │
└────────────────────────────┘   └────────────────────────────┘
```

### Data Flow

1. The status skill resolves the git project root and installed plugin root from its own location.
2. The skill validates `$ARGUMENTS` as empty or `--json`, then invokes `node <plugin-root>/scripts/sdlc-status.mjs --project <project-root>` with the optional JSON flag.
3. The CLI collects local evidence without mutation: branch, worktree status, commits relative to the base branch, strict spec match, required spec files, and verification report plus its latest Git commit.
4. The CLI performs optional read-only `gh` probes for issue, pull request, and checks. Each probe returns a value or a named gap.
5. Evidence is normalized into a snapshot independent of rendering.
6. The inference engine derives the strongest consistent manual SDLC stage and exact next action.
7. The text renderer prints a concise operator summary, or the JSON renderer emits a schema-versioned object as the only stdout content.

---

## API / Interface Changes

### Skill Interface

| Interface | Input | Output | Purpose |
|-----------|-------|--------|---------|
| `$nmg-sdlc:status` | No arguments | Human-readable summary | Recover the current manual lifecycle context and next command. |
| `$nmg-sdlc:status --json` | Literal `--json` | JSON schema version 1 | Provide stable automation/debug output. |

The skill is always non-interactive and never uses `request_user_input`.

### CLI Interface

```text
node scripts/sdlc-status.mjs --project <repo-root> [--json]
```

Invalid arguments or a non-git project exit non-zero. Optional source failures produce degraded status with exit code zero.

### JSON Schema Version 1

```json
{
  "schemaVersion": 1,
  "project": {
    "root": "/project",
    "branch": "145-add-lifecycle-status-command-for-active-sdlc-work",
    "dirty": false
  },
  "issue": {
    "number": 145,
    "title": "Add lifecycle status command for active SDLC work",
    "state": "OPEN",
    "source": "branch"
  },
  "spec": {
    "path": "specs/145-add-lifecycle-status-command-for-active-sdlc-work",
    "complete": true
  },
  "verification": null,
  "pullRequest": null,
  "stage": "specified",
  "completedArtifacts": ["issue branch", "spec package"],
  "missingArtifacts": ["implementation", "verification", "pull request"],
  "gaps": [],
  "nextAction": {
    "command": "$nmg-sdlc:write-code #145",
    "reason": "The approved spec exists and implementation evidence is absent.",
    "manualRepairRequired": false
  }
}
```

Nullable objects remain present with `null`; arrays remain arrays when empty. Additive fields may be introduced without changing `schemaVersion`; removing, renaming, or changing a documented field's meaning/type requires a version increment.

### Human-Readable Output

```text
SDLC status: specified
Issue: #145 Add lifecycle status command for active SDLC work (OPEN)
Branch: 145-add-lifecycle-status-command-for-active-sdlc-work (clean)
Spec: specs/145-add-lifecycle-status-command-for-active-sdlc-work (complete)
Verification: unknown
Pull request: unknown
Completed: issue branch, spec package
Missing: implementation, verification, pull request
Next: $nmg-sdlc:write-code #145
```

`Gaps:` is appended only when non-empty. The first and last lines remain stage and next action.

---

## Lifecycle Inference

### Evidence Precedence

1. Current local git state and directly observed artifact existence.
2. Live read-only GitHub issue, pull-request, and check state.
3. Valid local verification report content tied to the strict active spec and an immutable report commit in the current branch history.

Lower-precedence sources enrich higher-precedence evidence but cannot override a direct contradiction. A contradiction becomes a gap and stage advancement stops at the last consistent boundary.

### Verification Freshness

A `Pass` string alone is not delivery evidence. The collector resolves the latest commit containing the strict active spec's `verification-report.md`, verifies that commit is an ancestor of `HEAD`, and compares the current working tree to that checkpoint. The report is current only when the report itself is unchanged and no implementation path has changed since the checkpoint. Documentation-only changes after verification do not invalidate it. An uncommitted report, divergent report commit, modified report, implementation change, or failed Git provenance probe produces a named gap and keeps the lifecycle at `implemented`.

This design avoids a self-referential hash inside the report and preserves the existing verification-report producer. All provenance commands (`git log`, `git merge-base --is-ancestor`, and `git diff`) are read-only.

### Manual Lifecycle Stages

| Stage | Minimum consistent evidence | Typical next action |
|-------|-----------------------------|---------------------|
| `idle` | On the base branch with no active issue | `$nmg-sdlc:start-issue` |
| `started` | Issue branch and issue number are known; complete spec package absent | `$nmg-sdlc:write-spec #N` |
| `specified` | Strict matching spec contains all four required files; implementation evidence absent | `$nmg-sdlc:write-code #N` |
| `implemented` | Implementation commits/changes exist; passing verification evidence absent | `$nmg-sdlc:verify-code #N` |
| `verified` | Current verification evidence is Pass and no open pull request exists | `$nmg-sdlc:open-pr #N` |
| `pull-request-open` | An open pull request exists | `$nmg-sdlc:address-pr-comments #N` or a reported CI/manual-repair action |
| `complete` | Pull request is merged | `$nmg-sdlc:start-issue` |
| `unknown` | Core evidence is inconsistent beyond safe inference | Manual repair diagnostic |

---

## State Management

The CLI uses an immutable in-memory snapshot assembled for one invocation:

```text
EvidenceSnapshot
├── project
├── issue
├── spec
├── verification
├── pullRequest
└── gaps[]

EvidenceSnapshot → inferLifecycle() → StatusResult → renderText() | renderJson()
```

Collectors return structured values and gaps rather than throwing for optional failures. Inference and renderers are pure functions over the normalized snapshot.

No persistent storage or schema change is introduced. The command does not create caches, indexes, reports, state files, or logs.

---

## Components Modified

| Component | Change | Responsibility |
|-----------|--------|----------------|
| `skills/status/SKILL.md` | Create through `$skill-creator` | Trigger status requests, validate arguments, resolve roots, invoke the CLI, and pass output through unchanged. |
| `scripts/sdlc-status.mjs` | Create | Collect manual-workflow evidence, infer stage, render output, and expose the CLI. |
| `scripts/__tests__/sdlc-status.test.mjs` | Create | Test collection adapters, inference, rendering, degraded operation, and read-only invariants. |
| `scripts/__tests__/status-skill-contract.test.mjs` | Create | Assert skill trigger/interface, non-interactivity, command formation, and read-only wording. |
| `scripts/__fixtures__/skill-exercise/status/` | Create | Provide representative manual lifecycle states for deterministic exercise verification. |
| `scripts/__fixtures__/skill-exercise/rubrics/status.md` | Create | Document the six deterministic status exercise criteria. |
| `scripts/skill-exercise-runner.mjs` | Modify | Add non-placeholder evaluation for captured status artifacts. |
| `scripts/__tests__/skill-exercise-runner.test.mjs` | Modify | Cover the status evaluator and no-skip contract. |
| `README.md` | Modify | Document invocation, output, evidence behavior, and workflow placement. |
| `CHANGELOG.md` | Modify | Record issue #145 under `[Unreleased]`. |
| `scripts/skill-inventory.baseline.json` | Modify if audit requires | Accept only intentional new skill clauses after inspection. |

Runner source, tests, state, configuration, and artifacts are deliberately absent from this table.

---

## Security Considerations

- Use argument arrays for all child commands; never build shell commands from branch, file, or GitHub values.
- Allow only read-only `gh issue view`, `gh pr list`, and `gh pr checks` calls.
- Include lifecycle metadata, not full file bodies, environment variables, tokens, or arbitrary issue content.
- Parse malformed Markdown and GitHub responses as data; never execute them.

---

## Testing Strategy

| Layer | Type | Coverage |
|-------|------|----------|
| Evidence collectors | Unit with injected adapters | Clean/dirty git, spec/report matching, committed-current and stale/uncommitted report provenance, GitHub success/failure. |
| Inference engine | Table-driven unit | Idle, started, specified, implemented, verified, open PR, complete, unknown, and conflicts. |
| Renderers | Unit | Stable text ordering, valid schema-versioned JSON, null/array stability, stdout purity. |
| Read-only boundary | Integration | Before/after git/filesystem snapshots and command-spy rejection of mutating operations. |
| Status skill | Contract + fixture | Trigger surface, argument validation, installed-root resolution, non-interactivity, and deterministic invocation. |
| Runner independence | Static + diff | No runner path, state artifact, log, PID, sentinel, resume, or cleanup integration. |
| Feature | BDD | Five Gherkin scenarios map one-to-one to the amended acceptance criteria. |

---

## Out-of-Scope Boundary

Automated-loop support is intentionally excluded because the runner is scheduled for removal in milestone 2. Status must not:

- import from or modify `scripts/sdlc-runner.mjs`;
- inspect `.codex/sdlc-state.json` or `.codex/unattended-mode`;
- inspect runner logs, configuration, PIDs, or process liveness;
- infer active/interrupted/failed/stale runner conditions;
- recommend resume, cleanup, or `$nmg-sdlc:end-loop` actions.

---

## Change History

| Issue | Date | Summary |
|-------|------|---------|
| #145 | 2026-08-12 | Initial feature design |
| #145 | 2026-08-12 | Removed automated-runner integration ahead of milestone-2 removal |
| #145 | 2026-08-12 | Added read-only Git provenance for verification freshness |
