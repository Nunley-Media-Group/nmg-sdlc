---
name: status
description: "Inspect and report the current manual nmg-sdlc lifecycle state without mutation. Use when the user asks for SDLC status, where active work stands, the current issue or stage, the next SDLC command, session context recovery, or machine-readable lifecycle status. Accepts no arguments or --json. Do not use to verify, deliver, or merge work."
---

# Status

Read `../../references/codex-tooling.md` when the workflow starts — it maps inspection and shell wording to Codex-native, argument-safe behavior.

Report the strongest lifecycle conclusion supported by current repository, active issue scope, verification, and read-only GitHub evidence. Delegate deterministic inspection to the bundled status CLI and pass its output through unchanged.

Read `../../references/issue-spec-scope.md` when interpreting the `spec.scope` field. The CLI imports the same resolver used by the delivery skills. `repair_required` or `unverifiable` scope is a lifecycle gap whose next action is `$nmg-sdlc:write-spec #N`, even when cumulative spec files, implementation paths, verification reports, or pull requests would otherwise imply a later stage.

Read `../../references/epic-relationships.md` when an active issue is present. The bundled CLI hydrates the same label/body/native evidence, uses `scripts/epic-relationships.mjs`, and exposes the shared result as the issue's nullable `coordination` field without changing lifecycle-stage inference.

Read `../../references/deliverable-dependencies.md` when an active issue is present. The CLI parses structured cross-child prerequisites, hydrates fully paged closing-PR evidence, and exposes `issue.deliverableDependencies`. `blocked`, `repair_required`, or `unverifiable` stops lifecycle advancement even when later local artifacts exist; issue closure alone never proves a prerequisite available. If the active issue body cannot be hydrated, initialize this result as `unverifiable` and remain blocked because the CLI cannot prove that the body contains no prerequisite record.

This skill is observational and never presents a `request_user_input` gate or requests confirmation.

## Workflow

### Step 1: Validate Arguments

Accept `$ARGUMENTS` only when it is empty or exactly `--json` after trimming surrounding whitespace.

For any other value, print this usage line and stop non-zero without inspecting or modifying the project:

```text
Usage: $nmg-sdlc:status [--json]
```

### Step 2: Resolve Runtime Paths

Resolve the project root with the read-only equivalent of:

```bash
git rev-parse --show-toplevel
```

Resolve the installed plugin root from this loaded skill's own source path: the plugin root is two parent directories above `skills/status/SKILL.md`. Do not use the target project's configured plugin path when locating the status CLI. Verify that `<plugin-root>/scripts/sdlc-status.mjs` exists before invoking it.

If the project root cannot be identified or the bundled CLI is missing, report the specific path failure and stop non-zero.

### Step 3: Invoke the Read-Only CLI

Invoke Node.js without a shell using an argument array:

```text
process.execPath, [statusCli, "--project", projectRoot]
process.execPath, [statusCli, "--project", projectRoot, "--json"]
```

Use the second form only when `$ARGUMENTS` is `--json`. Pass the resolved paths as distinct arguments; never concatenate, interpolate, or execute repository-derived values as shell source.

Stream the CLI exit code, stdout, and stderr without adding interpretation. In JSON mode, stdout must contain only the CLI's JSON document.

## Read-Only Boundary

Do not write, delete, stage, commit, checkout, push, signal, verify, deliver, merge, or mutate GitHub state. Dirty worktrees are evidence to report, not conditions to repair. The bundled CLI may use only read-only local and GitHub queries.

## Integration with SDLC Workflow

Status is a diagnostic utility available at every point; it does not add or renumber a delivery stage:

```text
$nmg-sdlc:status [--json]
        │
        └── reports current evidence and recommends the existing owning command
```
