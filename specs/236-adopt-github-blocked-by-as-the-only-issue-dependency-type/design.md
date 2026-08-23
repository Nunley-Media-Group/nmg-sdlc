# Design: GitHub blocked-by as the sole issue dependency

**Issue**: #236
**Date**: 2026-08-23
**Status**: Approved
**Author**: NMG

---

## Overview

Create `scripts/issue-dependencies.mjs` as the only production adapter and validator for issue dependencies. It talks to GitHub's official REST dependency endpoints, normalizes complete evidence, validates repository-local targets and open-issue cycles, computes eligibility, and applies preflighted edges. Draft, upgrade, execute, start, and status call this module.

Remove `parseBodyRelationships` from runtime dependency decisions. Keep legacy parsing only as an explicitly named upgrade input where historical body text is converted to official edges after plan approval.

## GitHub API contract

Resolve `owner/repo` once with `gh repo view --json nameWithOwner`. Use:

```text
GET  /repos/{owner}/{repo}/issues/{issue_number}/dependencies/blocked_by?per_page=100
POST /repos/{owner}/{repo}/issues/{issue_number}/dependencies/blocked_by
```

POST body is `{ "issue_id": <numeric GitHub database id> }`, not an issue number. The shared runner invokes `gh api` with explicit argument arrays. It must consume every page; pagination failure or malformed response fails `dependency_unreadable` rather than returning a partial list.

Issue metadata records are normalized to:

```json
{
  "id": 123456,
  "number": 42,
  "state": "OPEN",
  "repository": "owner/repo",
  "title": "Example"
}
```

`id` and `number` must be positive safe integers, state must be `OPEN` or `CLOSED`, and the dependency's repository must equal the active repository. A dependency record that is structurally present but whose target cannot be resolved is `dependency_dangling`; transport, authorization, pagination, or parse failure is `dependency_unreadable`.

## Shared module API

```js
export function createIssueDependencyClient({ cwd, run } = {})
export function readBlockedBy(client, issueNumber)
export function readDependencyGraph(client, issueNumbers, options = {})
export function validateDependencyGraph(graph)
export function issueDependencyStatus(graph, issueNumber)
export function eligibleIssues(graph, issues)
export function preflightBlockedByEdges(graph, edges)
export function applyBlockedByEdges(client, edges)
export function parseLegacyDependencyEvidence(body)
```

The client caches issue metadata and blocked-by responses only for one operation. Callers never persist cache across invocations. Returned graph data is immutable and sorted numerically for deterministic tests and diagnostics.

`parseLegacyDependencyEvidence` is not exported to execute/start/status. Its only production caller is upgrade detection. Rename or retire `parseBodyRelationships`; historical epic-repair code may use an explicitly legacy helper but cannot feed runtime eligibility.

## Graph model and validation

An edge `{ issue: A, blockedBy: B }` means A cannot execute while B is open. The graph includes requested issues and recursively includes all blockers until each blocker is closed or has its own blockers loaded. Upgrade loads every repository issue, including closed issues, before proposing writes.

Validation order:

1. Every node and edge has valid positive ids and belongs to the active repository.
2. Every edge target has readable issue metadata; otherwise `dependency_dangling`.
3. Self-edges fail `dependency_cycle`.
4. Build the subgraph induced by OPEN nodes and OPEN blockers.
5. Run deterministic depth-first cycle detection in ascending issue-number order and ascending blocker order.
6. On a cycle, return the canonical path starting at its lowest issue number, ending with that number again; fail `dependency_cycle`.

Closed blocker edges are valid and satisfied. They are retained as official history but excluded from the open-cycle graph. An issue with no edges has status `eligible`.

`issueDependencyStatus` returns one of:

```json
{ "status": "eligible", "reasonCode": null, "openBlockers": [] }
{ "status": "blocked", "reasonCode": "dependency_blocked", "openBlockers": [7] }
{ "status": "blocked", "reasonCode": "dependency_cycle", "cycle": [3, 7, 3] }
{ "status": "unknown", "reasonCode": "dependency_unreadable" }
{ "status": "blocked", "reasonCode": "dependency_dangling", "edge": [3, 999] }
```

A graph-level read error aborts the caller. No caller falls back to body text.

## Draft-issue integration

Update the multi-issue plan schema. Each issue entry has a stable plan-local id and `blockedBy` array whose members are either `{ "planId": "..." }` or `{ "issue": 123 }`. Edges come from:

- the already-approved split topology; and
- explicit blocked-by, precursor, requires, or after language that names an existing issue.

Do not search for or link existing issues based only on thematic similarity. Do not add a second dependency ask. The existing split choice and final plan approval authorize the exact edge set.

Approved execution creates issues in topological order, records each returned issue number and database id, resolves plan-local edges, then calls the shared preflight/apply helper. Issue bodies no longer receive `Depends on:` or `Blocks:` lines.

Before the first POST, preflight merges proposed edges with current official graph, verifies every target, and rejects open cycles. Applying an existing edge is an idempotent success. If a later POST fails, the helper best-effort removes only edges added by that invocation; an incomplete rollback reports `dependency_apply_partial` with exact applied and remaining edges. It never edits issue bodies as recovery.

## Upgrade integration

Add an automatic `issue-dependencies` detector category to `scripts/sdlc-upgrade.mjs`. Detection:

1. List every open and closed repository issue with number, id, state, title, and body using complete pagination.
2. Read every issue's official blocked-by list.
3. Parse legacy migration evidence after removing fenced code, HTML comments, and block quotes.
4. Recognize only explicit relation fields (`Depends on:`, `Blocks:`, `Blocked by:`, `Precursor:`) and plain sequencing clauses that contain an issue reference with one of `blocked by`, `depends on`, `requires`, `after`, or `precursor`.
5. Convert evidence to candidate `{ issue, blockedBy, source }` edges, deduplicate, and subtract existing official edges.
6. Validate the combined graph and include exact additions plus evidence in the upgrade plan.

The category is screened automatically whenever upgrade runs. As with other mutating categories, writes occur only after the user approves the exact upgrade plan. No separate per-edge confirmation is required. Ambiguous prose produces a finding, not an edge. Historical text is not rewritten or deleted.

Apply re-reads the graph and compares a digest of sorted nodes/edges to the approved detection digest. Drift fails `dependency_plan_stale`. It then uses the same preflight/apply helper as draft.

## Execute integration

Replace body parsing in `selectBacklog` and `listSpecifiedIssues` with official graph evidence.

No-argument flow:

1. List open `spec-created` issues as today.
2. If the list is empty, print `No open spec-created issues.` and stop.
3. Read and validate official dependency evidence for every listed issue and its reachable blockers.
4. On any read/parse error, print the named reason and stop without a picker.
5. Exclude blocked, dangling, or cyclic issues and issues whose readable project statuses are exclusively Done.
6. If the eligible list is empty, print the same `No open spec-created issues.` and stop without a picker.
7. Present only the eligible sorted rows.

`selectBacklog` uses the same eligible set and retains lowest-number selection. Explicit `/sdlc-execute #N` validates the requested issue graph before writing run state or creating/reusing any worker. A failure leaves the queue unchanged and emits the graph reason.

## Start and status integration

`startIssue` calls the shared client before branch naming, `git`, issue develop, or handoff mutation other than the required failure handoff. Open blockers return `dependency_blocked`; unreadable evidence returns `dependency_unreadable`; dangling/cycle reasons pass through. No Git/project mutation occurs.

`sdlc-status` reads the same graph result. It reports `stage: blocked` for blocked/dangling/cycle, and an unknown/evidence gap for unreadable state. Status does not independently parse bodies or infer closure.

## Error codes

| Code | Meaning |
|------|---------|
| `dependency_unreadable` | Repository, issue, dependency page, or required metadata could not be completely read or parsed. |
| `dependency_dangling` | An official or proposed edge target does not resolve to a valid issue in the active repository. |
| `dependency_cycle` | The proposed or existing open subgraph contains a cycle. |
| `dependency_blocked` | One or more readable blockers remain open. |
| `dependency_plan_stale` | Live graph digest differs from the approved draft/upgrade plan. |
| `dependency_apply_failed` | An edge POST failed and all newly added edges were rolled back. |
| `dependency_apply_partial` | Edge apply failed and rollback could not restore the prior graph. |

Existing callers that already expose `dependency_unreadable` and `dependency_blocked` retain those strings.

## Tests

Add `scripts/__tests__/issue-dependencies.test.mjs` covering pagination, normalization, repository mismatch, malformed responses, recursive blockers, independent/closed/open status, deterministic cycle paths, dangling targets, idempotent preflight, numeric database ids, apply rollback, and every reason code.

Update draft tests to assert plan-local edge resolution, no body fields, preflight before POST, no second ask, and explicit existing-issue linking only. Update upgrade tests for full issue screening, closed-pattern parsing, ambiguity findings, digest drift, cycles, dangling targets, idempotency, and preservation of body text.

Update execute tests to prove filtering occurs before the picker, zero eligible rows use the existing empty message, unreadable evidence shows no picker, explicit issue validation precedes run-state/worker mutation, and Project Done/spec-created/spec-approval behavior remains unchanged. Update start and status tests to share official responses and assert no body fallback.

Remove or repurpose body-relationship tests as legacy-upgrade-only tests. Update README, CONTRIBUTING, steering, workflow references, fixtures, and changelog. Run the full scripts suite and GitHub adapter tests with injected runners; tests must not mutate live dependencies.

## Change History

| Issue | Date | Summary |
|-------|------|---------|
| #236 | 2026-08-23 | Initial feature spec |
