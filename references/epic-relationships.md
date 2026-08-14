# Epic Relationship Identity

**Consumed by**: `draft-issue` and `write-spec` producers; `start-issue`, `write-spec`, `write-code`, `verify-code`, `status`, and `open-pr` consumers; `upgrade-project` audit and recovery.

Epic membership is durable coordination metadata, not an execution prerequisite. Normalize the same GitHub evidence and derive the same result at every lifecycle entry point. `scripts/epic-relationships.mjs` is the deterministic reference implementation for normalization, classification, and sibling reconciliation; prompt-defined skills must preserve its fields and decision table.

## Durable Identity Tuple

A newly created umbrella relationship is complete only when all four records agree:

| Record | Required value |
|--------|----------------|
| Parent label | `epic` |
| Child label | Exactly one `epic-child-of-P` where `P` is the parent issue number |
| Native GitHub relationship | Child `C` has parent `P`, equivalently parent `P` lists sub-issue `C` |
| Body representation | Child contains line-anchored `Depends on: #P`; parent checklist lists `#C` when that representation is maintained |

The producer must re-fetch the written records and classify them before handoff. Do not retain `P` only in session state. Existing records that have a confirmed `epic` target and an agreeing native or body relationship but lack the child label remain supported as `legacy`; report the exact missing label and route repair through `$nmg-sdlc:upgrade-project`.

## Supported Signals

| Signal | Normalized pair |
|--------|-----------------|
| Native parent `P` on child `C` | child `C`, target `P` |
| Native sub-issue `C` listed on parent `P` | child `C`, target `P` |
| `Depends on: #T` in issue `C` | child `C`, target `T` |
| `Blocks: #C` in issue `T` | child `C`, target `T` |
| `epic-child-of-T` label on issue `C` | child `C`, target `T` |

Accept only positive same-repository issue numbers. Ignore self-references and cross-repository references such as `owner/repo#N`. Deduplicate by `(child, target)` while retaining every contributing signal.

## Hydration

Hydrate every referenced target, including targets outside the candidate window, with live issue state and labels. Request the active child's labels and the confirmed parent's body plus native `subIssues`. Derive this evidence fresh at each entry point; never cache a role, parent, path, tree, sibling list, or completion state.

- Discover native parents and sub-issues through GitHub GraphQL. Never request `parent` through `gh issue view --json`.
- Batch candidate and target hydration when possible. Page native `subIssues` to exhaustion within the current parent; an unconsumed page makes sibling classification `unverifiable`. A successful GraphQL `null` parent or fully consumed empty `subIssues` result is an authoritative empty native contribution, not an API failure.
- If native discovery itself fails, warn and retain body/label evidence. Record sibling authority as `checklist-fallback`; do not claim native reconciliation.
- If required target metadata is missing or malformed, fail closed as described below.

## Shared Result

Every consumer derives these fields, whether represented as an in-memory object, status JSON, or named session values:

| Field | Values |
|-------|--------|
| `role` | `ordinary`, `epic`, `epic-child`, `inconsistent`, `ambiguous`, `unverifiable` |
| `parentNumber` | One confirmed coordination parent or `null` |
| `identity` | `none`, `durable`, `legacy`, `inconsistent`, `ambiguous`, `unverifiable` |
| `coordinationPairs` | Deduplicated confirmed epic pairs with all signals |
| `executionDependencies` | Non-epic or unknown targets with state and blocking result |
| `siblingNumbers` | Native-authoritative child set, or checklist fallback only when native discovery failed |
| `siblingReconciliation` | Authority plus `nativeOnly` and `checklistOnly` discrepancies |
| `gaps` | Bounded, actionable evidence failures or repair recommendations |

## Classification

Apply this decision order after normalization:

| Evidence | Result | Behavior |
|----------|--------|----------|
| Confirmed `epic` target, one matching `epic-child-of-P`, and at least one agreeing native/body signal | `epic-child` / `durable` | Preserve parent identity and exclude only `P` from blockers and topological in-degree. |
| Confirmed `epic` target and agreeing native/body signal, but no child label | `epic-child` / `legacy` | Continue with a named repair recommendation; preserve backward compatibility. |
| More than one confirmed epic target | `ambiguous` | Stop before mutation and name every deduplicated child/target pair. |
| Multiple child labels, a child label that disagrees with the confirmed parent, a child-label-only claim, or a label targeting a confirmed non-epic issue | `inconsistent` | Stop before mutation and report every conflicting signal. |
| A claimed coordination target cannot be hydrated | `unverifiable` | Stop before mutation; never infer readiness. |
| Confirmed target lacks `epic` and is not claimed by a child label | `execution-dependency` | Apply normal completion rules. |
| Non-label relationship target metadata is missing or malformed | `execution-dependency` with unknown metadata | Retain it as blocking and emit the warning below. |

An issue carrying `epic` with no child identity is `role = epic`. No supported coordination evidence yields `role = ordinary`.

For an unknown execution target, emit at most once per deduplicated pair:

```text
WARNING: Could not confirm relationship metadata for child #C -> target #T; treating #T as a blocking execution dependency. Retry after GitHub metadata is available.
```

## Completion and Mutation Gates

A confirmed execution dependency is unresolved while its target state is not `CLOSED`; unknown metadata is always unresolved. An open coordination parent is non-blocking. `inconsistent`, `ambiguous`, or `unverifiable` coordination results stop `start-issue`, `write-spec`, `write-code`, `verify-code`, and `open-pr` before their first branch, spec, code, verification, version, or PR mutation. `status` reports the result without mutation.

`legacy` is deliberately non-blocking when the confirmed parent and native/body relationship agree. Include `$nmg-sdlc:upgrade-project` as the repair action, but do not rewrite metadata during the consuming lifecycle stage.

## Sibling Reconciliation

For a confirmed parent `P`, query and fully page GraphQL `subIssues`, then parse only supported checklist rows matching `^\s*-\s*\[[ xX]\]\s*#([1-9]\d*)\b`.

- When the native query succeeds, `siblingNumbers` comes from the native child set. Report native children omitted by the checklist as `nativeOnly`; report checklist entries absent from the native set as `checklistOnly`. Do not silently omit `nativeOnly` children or trust `checklistOnly` entries as authoritative membership.
- When native discovery fails, use the checklist as `checklist-fallback`, warn that authority degraded, and retain all successfully discovered evidence.
- Exclude the active child only after reconciliation. Hydrate every remaining sibling before completion or version classification.

## Producer and Recovery Invariants

- `$nmg-sdlc:draft-issue` epic fan-out and `$nmg-sdlc:write-spec` umbrella transition create/apply the parent and child labels, native relationship, and body representations within the user-approved creation action.
- Lazily create `epic` with color `5319E7` and `epic-child-of-P` with color `BFD4F2` when absent. Re-fetch the exact parent and children and require `durable` results before successful handoff.
- A partial write is reported with exact surviving metadata; never hide it or create a second child to compensate.
- Existing-record audit and repair is owned by `$nmg-sdlc:upgrade-project`. It is read-only until the user approves one exact mutation set, then re-fetches and compares the same records immediately before writing. Abort on drift and prove idempotence with a second audit.

## Canonical Parent-Spec Readiness

After a consumer obtains `role = epic-child`, read `references/canonical-umbrella-spec.md` and inspect `parentNumber` with parent mode. Only `canonical` and `canonical_marker_lost` permit child branch, spec, plan, verification, or delivery mutation.

- `ordinary` preserves existing single-PR and keyword-fallback behavior.
- `legacy` uses the same canonical gate as `durable` and reports its repair recommendation.
- Canonical readiness proves the parent baseline on refreshed default-branch state; it does not require an approved child amendment to equal that baseline tree.
- Run the check fresh at every child entry point.
