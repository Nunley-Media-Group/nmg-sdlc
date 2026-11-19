# Root Cause Analysis: Commit resolved queue-head merges and retry transient GitHub reads in /sdlc-execute

**Issue**: #575
**Date**: 2026-11-19
**Status**: Approved
**Author**: Claude Code
**Related Spec**: specs/573-accept-a-merge-of-origin-main-as-a-valid-implement-result-in-publication-proof/

## Root Cause

1. **No supported merge conclusion.**
   - `runCli` in `scripts/sdlc-safe-recoveries.mjs` accepts only `probe`, `bind`, and `reconcile`.
   - write-code's commit step stages and commits with the machine-checked issue subject, and step 3 forbids creating a commit on a clean tree. Neither applies to concluding a merge that already has its own merge message.
   - A worker holding a staged resolution with `MERGE_HEAD` present therefore has no supported command. It stops without a merge commit.
2. **Single-attempt GitHub reads.**
   - `statusEvidence` in `scripts/sdlc-execute.mjs` passes the raw `run` adapter to `collectEvidence`.
   - `collectGithub` in `scripts/sdlc-status.mjs` runs `gh issue view` once. On any failure it records a gap and leaves `issue` null.
   - The controller loop then throws `issue #N evidence unavailable`, which ends the controller even when the failure was a momentary network error or GitHub 5xx.

## Affected Code

| File | Symbol / Area | Role |
|------|---------------|------|
| `scripts/sdlc-safe-recoveries.mjs` | `runCli` action list | No action concludes an integration merge |
| `workflows/write-code/WORKFLOW.md` | Commit steps; `queue_integration_conflict` repair | Has no supported command for a resolved merge |
| `scripts/sdlc-execute.mjs` | `statusEvidence`; `issue #N evidence unavailable` throw | A single `gh` attempt decides the run |
| `scripts/sdlc-status.mjs` | `collectGithub` | Single `gh issue view` and `gh pr view` attempts |

## Fix Strategy

**`commit-merge` action (`scripts/sdlc-safe-recoveries.mjs`)**

1. Accept `commit-merge` with `--issue`, `--step implement`, `--spec`, and optional `--controller-run-id`. Any `--subject` is a usage error (exit 2).
2. Enter the controller lease and require the issue branch, as `bind` does (`publication_branch_mismatch`). Run `inspectPublicationScope`.
3. Require `git rev-parse -q --verify MERGE_HEAD` to succeed; otherwise refuse with `merge_not_in_progress`.
4. Resolve the base with #573's `integrationBaseRef`, and require `inProgressIntegration`; otherwise refuse with `publication_scope_unproven`.
5. Require `git ls-files -u -z` to be empty; otherwise refuse with `merge_unresolved`.
6. Require `git diff --name-only -z` and `git ls-files --others --exclude-standard -z` to list no non-runtime path (anything outside `.nmg-sdlc/`); otherwise refuse with `merge_unstaged`.
7. Apply `publicationPathDenied` to #573's `integrationChangeSet` for the in-progress merge; a denied entry refuses with `publication_scope_unproven` and names the `entry`.
8. Run `git commit --no-edit`. Failure refuses with `merge_commit_failed`. On success, print `NMG_SDLC_PUBLICATION: {"passed":true,"commit":"<HEAD sha>","ownerId":...,"scope":...}` and exit 0.
9. Each refusal prints its reason code on stderr and exits 1, with nothing committed. `commit-merge` never pushes.

**write-code (`workflows/write-code/WORKFLOW.md`)**

- The `queue_integration_conflict` repair (bind, conclude, push, reconcile; from #573) concludes the merge with `node <plugin-root>/scripts/sdlc-safe-recoveries.mjs commit-merge --issue N --step implement --spec specs/N-SLUG [--controller-run-id R]` instead of `git commit --no-edit`. It requires `passed: true`.
- The same applies whenever the worker finds an in-progress merge of the remote default branch with every conflict resolved.
- A `commit-merge` refusal follows the existing failed-handoff rule (`implementation_failed`).

**Transient `gh` retry (`scripts/sdlc-execute.mjs`)**

- Add exported `transientGhFailure(response)`. It is true for a failed `gh` result whose stderr or stdout matches `/HTTP 5\d\d|\b50[234]\b|bad gateway|service unavailable|gateway timeout|timed? ?out|connection (reset|refused)|ECONNRESET|ETIMEDOUT|EAI_AGAIN|could not resolve host|TLS handshake|unexpected EOF/i`, or that has a spawn `error` other than `ENOENT`.
- Add exported `retryingRun(run, { sleep, delays = [1000, 2000, 4000] })`. For command `gh`, it re-runs a transient failure after each delay in turn and returns the first success or the last response. Every other command and every non-transient failure returns the first response.
- `statusEvidence` wraps `run` in `retryingRun`, using the same `Atomics.wait` sleep the controller already uses for queue polling. The final response flows through unchanged, so a persistent failure still produces today's error.

## Changes

| File | Change | Behavioral reason |
|------|--------|-------------------|
| `scripts/sdlc-safe-recoveries.mjs` | Add the `commit-merge` action | AC1, FR1, FR2 |
| `workflows/write-code/WORKFLOW.md` | Conclude resolved integration merges with `commit-merge` | AC1, FR3 |
| `scripts/sdlc-execute.mjs` | Add `transientGhFailure` and `retryingRun`; wrap `statusEvidence`'s run | AC2, FR4, FR5 |
| `scripts/__tests__/sdlc-safe-recoveries.test.mjs` | `commit-merge` success and refusal tests | AC1, FR1, FR2 |
| `scripts/__tests__/sdlc-execute.test.mjs` | Retry helper and controller evidence-retry tests | AC2, FR4, FR5 |
| `scripts/__tests__/` write-code contract test | Assert that write-code names `commit-merge` for the integration merge | FR3 |

## Blast Radius

- `commit-merge` is a new action. `probe`, `bind`, and `reconcile` are unchanged.
- Retries apply only to `gh` calls made inside `statusEvidence`. GitHub writes and Git commands are untouched.
- A persistent outage still ends the run after the retries, about 7 s later than today.

## Alternatives Considered

| Option | Decision | Reason |
|--------|----------|--------|
| Keep #573's raw `git commit --no-edit` | Rejected | It leaves the merge conclusion without the helper's integration, unmerged-entry, and deny checks |
| Standalone merge checks in `commit-merge` | Rejected | It duplicates #573's integration logic |
| Catch `issue evidence unavailable` and keep the controller alive indefinitely | Rejected | It would hide persistent failures; bounded retry of transient failures is enough |
| `commit-merge` reusing #573 helpers, plus bounded transient `gh` retry in `statusEvidence` | Selected | Each half has one supported path, and failures stay observable |

## Change History

| Issue | Date | Summary |
|-------|------|---------|
| #575 | 2026-11-19 | Initial defect design |
