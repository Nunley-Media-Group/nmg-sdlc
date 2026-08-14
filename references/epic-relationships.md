# Epic Relationship Roles

**Consumed by**: `start-issue` dependency resolution and child readiness, `write-spec` parent-spec discovery, `write-code` child readiness, and `open-pr` sibling-aware delivery.

Epic membership is coordination metadata, not an execution prerequisite. Both selectors must normalize the supported GitHub signals into child/target pairs, hydrate the target's live metadata, classify the pair, and only then perform blocked filtering or topological ordering.

## Supported Signals

| Signal | Normalized pair |
|--------|-----------------|
| Native parent `P` on child `C` | child `C`, target `P` |
| Native sub-issue `C` listed on parent `P` | child `C`, target `P` |
| `Depends on: #T` in issue `C` | child `C`, target `T` |
| `Blocks: #C` in issue `T` | child `C`, target `T` |

Accept only positive same-repository issue numbers. Ignore self-references and cross-repository references such as `owner/repo#N`. Deduplicate by `(child, target)` before classification so the current native-plus-body epic format remains one relationship while retaining both discovery signals.

## Hydration and Classification

Hydrate every unique target referenced by a supported signal, including targets outside the current candidate window. Request the target's live state and labels, and derive this metadata fresh on every selection run.

Classify each deduplicated pair with this decision table:

| Target result | Role | Readiness effect |
|---------------|------|------------------|
| Metadata confirms an `epic` label | `epic-membership` | Preserve the pair as parent identity, but exclude it from blockers, blocked counts, and topological in-degree. |
| Metadata succeeds without an `epic` label | `execution-dependency` | Apply the consuming selector's normal completion rule. |
| Metadata is missing, malformed, or the lookup fails | `execution-dependency` | Fail safe: retain the pair as blocking and emit the warning below. |

Target labels are authoritative for the current run. Do not infer epic status from candidate-pool membership, issue-number ordering, milestone membership, body wording, or the presence of a native parent link alone.

For an unknown target, emit:

```text
WARNING: Could not confirm relationship metadata for child #C -> target #T; treating #T as a blocking execution dependency. Retry after GitHub metadata is available.
```

Replace `C` and `T` with the affected issue numbers. Emit at most one warning per deduplicated pair.

## Completion Rule

A confirmed execution dependency is unresolved while its target state is not `CLOSED`. Unknown metadata is always unresolved. An open coordination epic is non-blocking, while an open sibling or other confirmed non-epic target remains a named blocker.

## Fetch and Fallback Boundaries

- Discover native parents through GitHub GraphQL. Never request `parent` through `gh issue view --json`.
- Use one batched GraphQL query for candidate native relationships when possible. After body parsing, hydrate the deduplicated target set in a bounded batch or with supported `gh issue view` fields (`number,state,labels,closedByPullRequestsReferences`).
- If native-relationship discovery is unavailable, warn and continue with body cross-references. This fallback does not erase any relationship already discovered.
- If metadata lookup fails for a known target, apply the unknown-target row above. Do not treat the relationship as satisfied.
- Do not scan an organization-wide graph, follow cross-repository references, mutate issue relationships, cache classifications, or rewrite issue bodies.

## Downstream Compatibility

Classification is read-only. `$nmg-sdlc:draft-issue` continues to produce native parent links and `Depends on: #{epic}` body lines; `$nmg-sdlc:write-spec` and `$nmg-sdlc:open-pr` continue to consume those same identity signals for umbrella-spec discovery and sibling-aware release classification.

## Canonical Parent-Spec Readiness

After a consuming child workflow confirms one `epic-membership` pair, read `references/canonical-umbrella-spec.md` and inspect the target issue with parent mode. Only `canonical` and `canonical_marker_lost` permit child branch, spec, plan, delegation, or code mutation.

- No confirmed epic parent preserves existing single-PR and keyword-fallback behavior.
- More than one confirmed epic parent is ambiguous and stops with the deduplicated child/target pairs.
- A confirmed non-epic or unknown target remains an execution dependency; do not reinterpret it as the coordination parent.
- Canonical readiness proves the parent baseline on refreshed default-branch state. It does not require an approved child branch amendment to equal that baseline tree.
- Run the check fresh at every child entry point. Do not cache the path, tree, default commit, or classification.
