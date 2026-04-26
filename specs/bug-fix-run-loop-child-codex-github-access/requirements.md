# Defect Report: Fix run-loop child Codex GitHub access

**Issue**: #122
**Date**: 2026-04-26
**Status**: Complete
**Author**: Codex
**Severity**: High
**Related Spec**: specs/feature-add-skill-to-run-full-sdlc-pipeline-loop-from-within-codex/

---

## Reproduction

### Steps to Reproduce

1. Run `$nmg-sdlc:run-loop` with installed plugin `1.65.0` against a project whose runner config points at the installed plugin.
2. Let the runner complete Step 1 (`startCycle`) and pre-select an automatable issue.
3. Observe Step 2 (`startIssue`) spawn nested `codex exec --full-auto --json` sessions.
4. Observe the child sessions fail `gh issue view` or `gh repo view` with `error connecting to api.github.com` while the parent shell can read the same issue with GitHub access.
5. Observe the runner retry Step 2 three times because no feature branch was created.

### Environment

| Factor | Value |
|--------|-------|
| **OS / Platform** | macOS / Codex CLI |
| **Version / Commit** | nmg-sdlc plugin 1.65.0 |
| **Browser / Runtime** | Node.js `scripts/sdlc-runner.mjs`, `codex exec --full-auto --json`, GitHub CLI |
| **Configuration** | SDLC runner unattended mode with nested Codex child sessions |

### Frequency

Always when a runner-spawned child Codex session needs network access that `--full-auto` sandboxing blocks.

---

## Expected vs Actual

| | Description |
|---|-------------|
| **Expected** | Every runner-spawned child Codex step runs with yolo/no-sandbox execution so it has the same effective GitHub, filesystem, and tool capability needed to complete SDLC automation as the parent runner process. |
| **Actual** | The runner launches every child Codex step with `--full-auto`, which is sandboxed automatic execution. GitHub-dependent child sessions cannot reach `api.github.com`, report the blocker in prose, exit 0, and leave Step 2 to retry on a missing-branch postcondition. |

### Error Output

```text
error connecting to api.github.com
check your internet connection or https://githubstatus.com
```

---

## Acceptance Criteria

**IMPORTANT: Each criterion becomes a Gherkin BDD test scenario.**

### AC1: All Runner-Spawned Child Steps Use Yolo Execution

**Given** the SDLC runner builds `codex exec` arguments for any configured pipeline step
**When** the child command is launched
**Then** the command uses Codex's yolo/no-sandbox execution mode
**And** it does not include `--full-auto` or another sandboxed automatic mode.

### AC2: GitHub-Dependent Child Steps Have GitHub Access

**Given** the SDLC runner spawns a child Codex session for a GitHub-dependent step
**When** the child session runs required `gh` commands such as `gh issue view`, `gh issue develop`, `gh pr create`, or `gh pr checks`
**Then** those commands run with network/auth reachability equivalent to the parent runner process
**And** the runner no longer launches those steps in a sandbox mode that blocks `api.github.com`.

### AC3: startIssue Does Not Retry Known GitHub Access Failures

**Given** Step 2 (`startIssue`) cannot reach GitHub from the child session
**When** the child output includes a GitHub auth or network failure such as `error connecting to api.github.com`
**Then** the runner treats the result as a GitHub-access failure
**And** it escalates with the concrete failure message without consuming all three no-branch retries.

### AC4: Missing Branch Postcondition Still Catches Silent startIssue Failures

**Given** Step 2 exits 0 without a GitHub auth/network failure message
**When** no feature branch is checked out after the child session completes
**Then** the existing missing-feature-branch postcondition still treats the step as a soft failure
**And** the runner routes through the normal retry/escalation path.

### AC5: Parent and Child Capability Parity Is Verified

**Given** the parent runner process can execute a representative operation needed by an SDLC step
**When** the runner child launch mode is exercised for the same operation
**Then** the child session can perform the operation with equivalent capability
**And** the verification fails with a capability-divergence diagnostic if the child is still sandboxed while the parent has access.

---

## Functional Requirements

| ID | Requirement | Priority |
|----|-------------|----------|
| FR1 | Update runner child `codex exec` launch arguments so every runner-spawned child step uses yolo/no-sandbox execution rather than `--full-auto`. | Must |
| FR2 | Preserve unattended/non-interactive execution semantics while changing only the child sandbox/capability level. | Must |
| FR3 | Add soft-failure detection for child output that reports GitHub auth/network failures while exiting 0. | Must |
| FR4 | Preserve the current no-feature-branch postcondition for non-GitHub silent Step 2 failures. | Must |
| FR5 | Add regression coverage for launch arguments and representative parent/child capability parity, with GitHub access as the concrete reproduced failure. | Must |

---

## Out of Scope

- Changing GitHub credentials or re-authentication flows.
- Fixing AgentChrome issue `#253` itself.
- Broad runner retry redesign beyond GitHub-access failure classification.
- Changing manual, non-runner Codex session sandbox defaults.
- Introducing per-step sandbox policy selection; all runner-spawned child steps must use the yolo/no-sandbox approach.

---

## Validation Checklist

Before moving to PLAN phase:

- [x] Reproduction steps are repeatable and specific
- [x] Expected vs actual behavior is clearly stated
- [x] Severity is assessed
- [x] Acceptance criteria use Given/When/Then format
- [x] At least one regression scenario is included
- [x] Fix scope is minimal -- no feature work mixed in
- [x] Out of scope is defined

---

## Change History

| Issue | Date | Summary |
|-------|------|---------|
| #122 | 2026-04-26 | Initial defect report |
