# Root Cause Analysis: Require Deliverable Dependencies in Multi-PR Child Plans

**Issue**: #163
**Date**: 2026-08-14
**Status**: Approved
**Author**: Rich Nunley

---

## Root Cause

The multi-issue planner represents ordering only as whole-issue DAG edges. `skills/draft-issue/references/multi-issue.md` infers dependencies from planned asks, converts the Delivery Phases table into a child-local DAG, and persists those edges as `Depends on:` / `Blocks:` body records. It does not inventory task or artifact ownership across children, so prose such as “begin after T054” can survive without becoming an edge. Because independent child branches are created from the default branch, no intermediate task inside an open sibling is consumable unless it is extracted and merged as its own issue.

The readiness consumers then reason from the incomplete graph. `skills/start-issue/SKILL.md` filters candidates from normalized execution dependencies, and `scripts/sdlc-status.mjs` hydrates the same body/native relationship targets. Neither has a separate deliverable-prerequisite record or merged-default-branch proof. A manually closed target or an unmodeled sibling checkpoint can therefore look satisfied even when no closing pull request placed the artifact on the default branch.

Finally, `$nmg-sdlc:upgrade-project` audits epic identity and canonical umbrella specs but has no cross-child deliverable audit. Existing prose-only plans cannot be diagnosed or repaired through an owned, drift-checked, idempotent workflow.

### Affected Code

| File | Role |
|------|------|
| `skills/draft-issue/references/multi-issue.md` | Infers child DAGs and persists issue body relationships without task/artifact deliverability validation. |
| `skills/write-spec/references/umbrella-mode.md` | Converts Delivery Phases into independently deliverable children without requiring a deliverable-boundary proof. |
| `skills/start-issue/SKILL.md` | Determines readiness from execution dependencies but has no structured cross-child prerequisite or merged-PR check. |
| `scripts/sdlc-status.mjs` and `skills/status/SKILL.md` | Report lifecycle state from issue relationships without a deliverable-availability result. |
| `skills/upgrade-project/SKILL.md` | Owns initialized-project audits and approved metadata repair but does not inspect cross-child checkpoints. |
| `scripts/epic-relationships.mjs` | Supplies execution-dependency identity and target state but intentionally does not model artifact delivery. |

### Triggering Conditions

- A task or artifact is owned by one child and referenced by another.
- The reference describes an intermediate checkpoint rather than the owner issue's completed delivery.
- The children use independent branches from the default branch.
- No separate baseline issue exists and no whole-issue execution dependency waits for the owner.

---

## Fix Strategy

### Approach

Add a shared deliverable-dependency contract and a zero-dependency pure classifier. New child plans record each cross-child prerequisite with a line-anchored body entry:

```text
- Requires deliverable from #122: T054 validated schema/register baseline
```

Every record must have a matching whole-issue execution dependency such as `Depends on: #122`. The classifier combines those records with normalized execution dependencies, live target metadata, the repository default branch, and the target issue's `closedByPullRequestsReferences`. It returns `ready` only when every owner has a merged closing pull request targeting the default branch; otherwise it returns `blocked`, `repair_required`, or `unverifiable` with exact gaps. The existing epic parent remains coordination-only and never satisfies or blocks a deliverable record unless it is separately named as an execution dependency.

During planning, an intermediate checkpoint is not representable. The recommended repair is a whole-issue dependency because it preserves the existing issue/spec split with the smallest safe change. Baseline extraction remains available when real parallelism justifies a separate independently reviewable issue and pull request. The planner must resolve this before child creation and must keep task ownership, structured records, and `Depends on:` edges consistent.

`$nmg-sdlc:upgrade-project` becomes the supported existing-plan audit. It scans bounded canonical umbrella specs and their native-authoritative children, inventories task ownership and structured records, and flags bounded legacy lines that combine sibling references with task/artifact/checkpoint language. Legacy matches are findings, never silent authority. After one exact approved whole-issue repair, it re-fetches bodies and relationships, aborts on drift, writes through temporary body files, re-runs the classifier, and proves a second audit is a no-op. Baseline extraction is proposed as a separate reviewed issue/spec action rather than performed implicitly.

### Result Contract

```json
{
  "status": "none | ready | blocked | repair_required | unverifiable",
  "issueNumber": 123,
  "defaultBranch": "main",
  "requirements": [
    {
      "ownerIssue": 122,
      "description": "T054 validated schema/register baseline",
      "executionEdge": true,
      "ownerState": "OPEN",
      "mergedPullRequest": null,
      "available": false
    }
  ],
  "reasonCode": "deliverable_not_merged",
  "gaps": []
}
```

Stable meanings:

| Status | Meaning | Consumer behavior |
|--------|---------|-------------------|
| `none` | The child declares no cross-child deliverable prerequisite. | Preserve ordinary readiness behavior. |
| `ready` | Every declared owner has a matching execution edge and a merged closing PR to the default branch. | The deliverable contract does not block the child. |
| `blocked` | The graph is consistent, but at least one required owner has no merged default-branch delivery yet. | Exclude from start selection and report the owner/PR gap in status. |
| `repair_required` | A prerequisite lacks its whole-issue edge or the plan/spec/body mappings disagree. | Stop lifecycle progress and route to the approved initialized-project repair. |
| `unverifiable` | Required issue, relationship, default-branch, pagination, or closing-PR evidence is unavailable or malformed. | Fail closed without inferring readiness. |

### Validation Rules

1. Parse only positive same-repository owner numbers from exact line-anchored deliverable bullets; ignore self-references and deduplicate identical owner/description pairs.
2. Require a normalized execution dependency for every declared owner. Coordination membership alone is not an execution edge.
3. Hydrate every owner and fully page `closedByPullRequestsReferences`; incomplete or malformed evidence is `unverifiable`.
4. Treat a deliverable as available only when a closing pull request is `MERGED`, targets the live repository default branch, and supplies a merge commit. `CLOSED` issue state alone is insufficient.
5. Treat an open owner, a pending/unmerged closer, or a closer to another base as `blocked` when the edge is otherwise consistent.
6. Keep structured requirements, task ownership, child plan DAG, and body dependency pairs consistent; mismatches are `repair_required` even when the target later merges.
7. Bound audit candidates, body sizes, issue/connection pages, and API request counts; preserve partial evidence and fail closed at any bound.

### Changes

| File | Change | Rationale |
|------|--------|-----------|
| `scripts/deliverable-dependencies.mjs` | Add pure parsing/classification for structured prerequisite records, execution edges, and merged-default-branch evidence. | Gives start/status/tests one deterministic contract. |
| `references/deliverable-dependencies.md` | Define authoring, validation, readiness, audit, and repair rules shared by four lifecycle consumers. | Prevents prompt and CLI behavior from drifting. |
| `skills/draft-issue/references/multi-issue.md` | Inventory cross-child task/artifact prerequisites before graph approval; require baseline extraction or whole-issue edges; persist exact records and verify the complete graph. | Prevents invalid plans at creation. |
| `skills/write-spec/references/umbrella-mode.md` and `skills/write-spec/SKILL.md` | Hand the approved task/artifact ownership map into child planning and reject midpoint-only Delivery Phases. | Connects the canonical spec to the issue graph. |
| `skills/start-issue/SKILL.md` | Hydrate deliverable owners and merged closing PRs; filter blocked/repair/unverifiable candidates before selection and explicit starts. | Makes readiness truthful before branch creation. |
| `scripts/sdlc-status.mjs` and `skills/status/SKILL.md` | Expose `issue.deliverableDependencies`, add blocked/repair lifecycle handling, and render exact evidence in JSON/text. | Keeps diagnostics aligned with start. |
| `skills/upgrade-project/SKILL.md` and a focused recovery reference | Audit existing umbrellas and apply only an approved, drift-free, idempotent whole-issue repair. | Provides the supported repair path without broad GitHub mutation. |
| `scripts/__tests__/`, `scripts/__fixtures__/` | Add classifier, contract, status, audit, and independent-branch regression coverage. | Proves all seven acceptance criteria without production mutation. |
| `README.md`, `CHANGELOG.md`, inventory baseline | Document the new contract and keep the packaged surface current. | Keeps public workflow and validators aligned. |

All edits under `skills/` and `references/` are routed through `$skill-creator`. The shared reference holds the multi-consumer contract; skill entrypoints and per-skill references retain only their stage-specific procedures.

### Blast Radius

- **Direct impact**: multi-issue/epic planning, umbrella child creation, issue selection, active lifecycle status, initialized-project audit/repair, GraphQL relationship hydration, tests, and public documentation.
- **Compatibility impact**: ordinary issues and epic membership remain unchanged. Existing children without structured deliverable records preserve ordinary behavior until the explicit audit identifies a bounded legacy checkpoint candidate.
- **Failure-mode change**: a declared deliverable with missing, inconsistent, or unavailable merge evidence now blocks rather than falling through as ready.
- **Risk level**: Medium-high because the change intentionally tightens readiness and adds bounded GitHub evidence hydration across several manual lifecycle stages.

---

## Regression Risk

| Risk | Likelihood | Mitigation |
|------|------------|------------|
| Epic membership is mistaken for an execution dependency. | Low | Reuse the shared epic classifier and require deliverable owners in `executionDependencies`, never `coordinationPairs` alone. |
| A manually closed prerequisite is treated as delivered. | Low | Require one merged closing PR targeting the live default branch and test manual closure explicitly. |
| A legitimate no-dependency child is blocked by prose heuristics. | Medium | Start/status parse only structured records; legacy heuristics are report-only audit candidates until approved. |
| Existing valid whole-issue DAGs are rewritten unnecessarily. | Low | Normalize and compare existing body edges before proposing a repair; prove second-run no-op. |
| Baseline extraction causes hidden issue/spec mutations. | Low | Keep extraction guidance separate; automatic repair supports only the exact approved whole-issue body/graph change. |
| GraphQL pagination or API failure produces false readiness. | Low | Bound and fully consume required connections; return `unverifiable` on any incomplete evidence. |
| Status and start disagree. | Low | Use the same result contract, fixtures, and cross-contract assertions for both consumers. |
| Independent child branches predate the prerequisite merge. | Medium | Start only after merged default-branch evidence; retain stale-branch reconciliation and exercise creation from the refreshed default branch. |

---

## Alternatives Considered

| Option | Description | Why Not Selected |
|--------|-------------|------------------|
| Support stacked child branches | Branch downstream work from the prerequisite child. | Out of scope and introduces a different delivery/rebase model across the entire pipeline. |
| Treat issue closure as delivery | Reuse the existing execution-dependency completion rule. | Manual closure and non-default-base PRs do not make an artifact available from the child's branch point. |
| Infer every prerequisite from free-form prose at start time | Scan arbitrary child bodies and block on likely task references. | Too many false positives; legacy heuristics belong in an explicit audit and approval flow. |
| Always extract a baseline issue | Split every shared task into a new issue and PR. | Preserves parallelism but adds unnecessary coordination for plans that can safely wait for the whole owner issue. |
| Add a whole-issue edge by default | Wait for the owner issue whenever a midpoint checkpoint is discovered. | **Selected default**: smallest safe representation; baseline extraction remains an explicit alternative when parallelism matters. |

---

## Change History

| Issue | Date | Summary |
|-------|------|---------|
| #163 | 2026-08-14 | Initial defect design |

---

## Validation Checklist

- [x] Root cause identifies the planner-to-readiness representation gap
- [x] Structured records and whole-issue execution edges have distinct roles
- [x] Availability requires merged default-branch delivery rather than issue closure
- [x] New-plan prevention and existing-plan audit/repair are both specified
- [x] Repair is exact, approval-gated, drift-checked, and idempotent
- [x] Legacy heuristics cannot silently mutate or block ordinary work
- [x] Independent-branch exercise covers the actual availability boundary
- [x] Skill and shared-reference edits are routed through `$skill-creator`
