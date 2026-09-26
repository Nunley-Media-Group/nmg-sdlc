# Defect Report: Return write-spec to native plan mode after merged publication

**Issue**: #438
**Date**: 2026-09-26
**Status**: Approved
**Author**: NMG
**Related Spec**: specs/400-restore-per-spec-plan-approval-and-ci-gated-merge-waiting/

---

## Reproduction

1. In the OMP TUI, run `/sdlc-write-spec` and approve an issue's spec plan.
2. Let publication run the materialized `publish-approved-spec.mjs merge --issue N --dir specs/N-slug` helper and return `merged: true`.
3. Observe the extension queue a `followUp` user message whose text begins `/plan`.
4. Observe that OMP delivers the queued text as an ordinary prompt: builtin `/plan` never runs, so Continue/Finished and a selected next issue proceed in execution mode.

## Expected vs Actual

| | Description |
|---|-------------|
| **Expected** | After the publication execution turn ends, the same TUI session enters native plan mode and the first plan-mode prompt is the write-spec Continue loop carrying every published issue. |
| **Actual** | The queued follow-up text contains `/plan` but is not dispatched as a slash command; the session stays in execution mode. |

## Acceptance Criteria

### AC1: Merged publication re-enters native plan

**Given** a TUI write-spec session whose exact materialized merge helper call returns a sole JSON object with `merged: true` and a positive `pr`, including on a nonzero exit after post-merge checkout or label failure
**When** the execution turn that ran it ends terminally (`agent_end` without `willContinue: true`)
**Then** the extension submits `/plan` followed by the complete materialized write-spec workflow exactly once through the focused TUI editor
**And** builtin `/plan` runs before the Continue picker, with the continuation as the first plan-mode prompt
**And** the prompt begins `Post-publication continuation. published[] = [N, ...]`, lists each `N-slug`, and starts at the Continue loop without treating the text as `$ARGUMENTS`

### AC2: Continuation keeps plan mode and every published issue

**Given** a continuation prompt running in native plan mode
**When** the operator selects another issue M
**Then** only read-only Discovery and Interview run before M's distinct `local://spec-{M}-plan.md` and `xd://propose`
**And** `candidates` receives one `--published` pair for every published issue
**And** a later merged publication re-enters plan mode with the accumulated published list

### AC3: Fail closed without duplicate or stray submissions

**Given** a malformed, unrelated, or pre-merge helper result; a duplicate tool result or `agent_end`; a nonterminal `agent_end`; missing UI; an unfocused editor; a non-empty editor draft; or a synchronous submit failure
**When** the extension evaluates the continuation
**Then** it records or submits nothing extra and never toggles an already-active plan off
**And** it preserves any editor draft, keeps a recorded continuation pending with a notification, and never queues an execution-mode Continue message

## Functional Requirements

| ID | Requirement | Priority |
|----|-------------|----------|
| FR1 | Record each validated merged publication (issue and slug) for the TUI process, deduplicated by tool call and issue, without dispatching during the execution turn; keep the list across the session clear of plan approval and reset it on each new `/sdlc-write-spec` invocation. | Must |
| FR2 | On the first terminal `agent_end` with a pending publication, submit the continuation through the focused OMP `CustomEditor`, prefixed with `/plan` only when the session is not already in plan mode. | Must |
| FR3 | Render the continuation from the same prompt registry, controller-path materialization, and provenance path as the initial interactive rewrite. | Must |
| FR4 | Preserve candidate filtering, canned Continue/Finished labels, per-issue proposal, Finished summary, and post-merge remediation ordering. | Must |

## Out of Scope

- Changing the OMP host, calling private host mode methods, or synthesizing terminal input
- Changing publication helper subcommands or their JSON contracts

## Change History

| Issue | Date | Summary |
|-------|------|---------|
| #438 | 2026-09-26 | Initial defect report |
| #438 | 2026-09-26 | Keep published[] across plan-approval session clears (live smoke finding) |
