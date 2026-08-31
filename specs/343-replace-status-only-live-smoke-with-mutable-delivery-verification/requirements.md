# Requirements: Replace status-only live smoke with mutable delivery verification

**Issue**: #343
**Date**: 2026-08-31
**Status**: Approved
**Author**: rnunley-nmg
**Related Spec**: specs/269-fix-project-runtime-loading-under-compiled-omp-host/

---

## User Story

**As a** developer verifying nmg-sdlc in Oh My Pi / Herdr
**I want** every verify to run a controlled mutable delivery smoke against the allowlisted consumer repository
**So that** a passing result proves queued smoke issues were delivered, merged at exact head, and closed — not merely that `/sdlc-status --json` still prints

---

## Background

The always-required `repository.nmg-sdlc-smoke` gate currently clones `Nunley-Media-Group/nmg-sdlc-smoke` and exercises `/sdlc-status --json`. Product and tech steering still call that clone read-only and treat status JSON with a `/sdlc-` next action as proof. That cannot satisfy live-smoke integrity or terminal delivery integrity.

Verification may own issue, spec, branch, PR, comment, check, merge, and closure mutations only through normal nmg-sdlc workflow ownership (`scripts/sdlc-execute.mjs run` and its workers), against exactly `Nunley-Media-Group/nmg-sdlc-smoke` and an explicit issue queue. The nmg-sdlc verify worker is an invoker/observer only.

**Version bump**: minor

---

## Acceptance Criteria

Each criterion becomes a Gherkin scenario.

### AC1: Passing smoke proves delivered, merged, and closed outcomes

**Given** authenticated GitHub access, valid Herdr OMP context, a clean smoke checkout, and an explicit queue of at least one allowlisted-repo issue with an approved spec
**When** nmg-sdlc verification runs the required `repository.nmg-sdlc-smoke` gate
**Then** the provider invokes or observes exactly one execute controller whose cwd is the local smoke clone and whose issue list is exactly that configured queue
**And** a `passed` result includes nonempty evidence that every queued issue reached exact-head merge and GitHub `CLOSED`, including issue URL, PR URL, observed head SHA, `MERGED`, and `CLOSED`
**And** `/sdlc-status --json` output alone is not sufficient to pass

### AC2: Explicit multi-issue queue is executed without inventing identities

**Given** the smoke validation is configured with two or more explicit issue identities on `Nunley-Media-Group/nmg-sdlc-smoke`
**When** the gate runs
**Then** execute processes that entire queue in the configured order in one controller-owned run
**And** the gate does not draft issues, guess lowest-numbered issues, use the empty-execute picker, or substitute any identity that was not configured
**And** missing, empty, or non-explicit queue configuration yields a required `failed` result

### AC3: Preflight and allowlist fail closed

**Given** GitHub auth is missing, Herdr OMP context is missing, the smoke checkout is dirty, a queued issue lacks an approved spec, the configured remote is not `Nunley-Media-Group/nmg-sdlc-smoke`, or explicit issue identities are absent
**When** the gate runs
**Then** the result is not `passed` and is not skipped
**And** policy misses (auth, Herdr context, dirty checkout, missing approved spec, non-allowlisted remote, missing identities) are `failed`
**And** the gate does not invent issues, mutate a non-allowlisted repository, or weaken exact-head delivery to pass

### AC4: Controller ownership does not nest

**Given** nmg-sdlc verify-code is already running `repository.nmg-sdlc-smoke`
**When** the provider starts or observes smoke delivery
**Then** the nmg-sdlc verify worker is not the smoke clone's execute controller
**And** smoke-issue verification does not re-enter `repository.nmg-sdlc-smoke`
**And** the plugin checkout is not subjected to a nested `/sdlc-execute`
**And** only processes the gate spawned are eligible for cancellation cleanup; foreign Herdr or OS processes are not killed

### AC5: Local cleanup retains failure evidence and never deletes GitHub artifacts

**Given** a smoke run has finished
**When** the result is `passed`
**Then** the local disposable clone is removed
**And** GitHub issues, PRs, comments, checks, merge commits, and closures created or updated through workflow ownership remain
**When** the result is `failed` or `incomplete`
**Then** local evidence needed to diagnose the failure is retained
**And** remote GitHub lifecycle artifacts are still not deleted

### AC6: Mutations stay inside workflow ownership and remain stack-neutral

**Given** the gate is allowed to mutate the allowlisted smoke repository
**When** it creates or updates issues, specs, branches, PRs, comments, checks, merges, or closures
**Then** those mutations occur only through normal nmg-sdlc workflow ownership (execute and its workers), not ad-hoc GitHub edits outside that ownership
**And** the gate does not invoke a smoke-project language toolchain, test runner, or framework; stack details stay in the smoke project's own steering
**And** exact-head merge and issue-closure rules are unchanged

---

## Functional Requirements

| ID | Requirement | Priority | Notes |
|----|-------------|----------|-------|
| FR1 | Keep `repository.nmg-sdlc-smoke` an always-required steering validation, but change its pass contract from status JSON to complete delivered/merged/closed proof for the explicit queue. | Must | |
| FR2 | Allowlist exactly `Nunley-Media-Group/nmg-sdlc-smoke` and require explicit configured issue identities; fail closed on any other remote or on missing/empty/non-explicit identities. | Must | Production `config.issues` is `[30]`. |
| FR3 | Permit verification-owned mutations only by invoking this checkout's `scripts/sdlc-execute.mjs run` against a local clone of that repository. | Must | |
| FR4 | Fail closed without authenticated GitHub access, valid Herdr OMP context, a clean clone, or approved-spec/delivery proof for every queued issue; do not skip, pass, or fixture-substitute. | Must | Execute exit 0 with `Run /sdlc-write-spec` is not pass. |
| FR5 | Define one controller ownership boundary: provider/verify worker invokes or observes one smoke-clone execute controller; no nested nmg-sdlc execute on the plugin checkout; no re-entry of this validation. | Must | Env `NMG_SDLC_SMOKE_OWNED=1`. |
| FR6 | Never invent arbitrary issues, never kill foreign processes, never delete remote GitHub evidence, and never weaken exact-head delivery. | Must | |
| FR7 | Remove the local clone after pass; retain local failure evidence; leave GitHub artifacts auditable. | Must | |
| FR8 | Add deterministic regressions covering preflight, explicit queue, mutation allowlist, multi-issue execution, cleanup, failure retention, and stack independence. | Must | Jest fakes GitHub/Herdr/execute. |
| FR9 | Update product and tech steering so the gate is no longer described as read-only status smoke. | Must | |
| FR10 | Keep clone/network/cancel/process-loss as `incomplete` environmental outcomes with evidence when available. | Should | |

---

## Out of Scope

- Changing `/sdlc-status` into a mutating command
- Changing exact-head merge, required-check, or issue-closure semantics in `scripts/sdlc-execute.mjs` / `scripts/sdlc-deliver.mjs`
- Auto-drafting or auto-specifying smoke issues when the queue is empty
- Deleting or rewriting remote GitHub history as cleanup
- Multi-repository smoke, epic/spike types, or a plugin-owned background execution service
- Killing or stopping Herdr sessions the gate did not start

---

## Change History

| Issue | Date | Summary |
|-------|------|---------|
| #343 | 2026-08-31 | Initial feature spec |
