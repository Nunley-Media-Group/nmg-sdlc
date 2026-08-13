# Root Cause Analysis: Fix Epic Membership Deadlocking Issue Selection

**Issue**: #149
**Date**: 2026-08-13
**Status**: Investigating
**Author**: Rich Nunley

---

## Root Cause

The epic-child contract deliberately represents coordination identity twice. `skills/draft-issue/references/multi-issue.md` requires each child body to contain `Depends on: #{epic-number}` and also adds the epic as the child's native GitHub parent. Those durable signals are consumed later by `write-spec` to find the umbrella spec and by `open-pr` to classify intermediate versus final child delivery.

`skills/start-issue/SKILL.md` currently normalizes every native parent and body cross-reference into one `parentsOf` map. Its blocked filter then treats every open member of that map as an unresolved execution dependency. Because a coordination epic remains open until its children complete, the current representation makes a ready first child appear blocked for the full lifetime of the epic.

The runner reaches a different result for the wrong reason. `selectNextIssueFromMilestone()` builds a dependency map only from automatable candidates and treats targets outside that pool as satisfied. Epics normally lack the `automatable` label, so the runner often ignores the open epic incidentally instead of explicitly recognizing coordination semantics. Manual and unattended selection therefore implement different readiness rules over the same issue graph.

### Affected Code

| File | Lines | Role |
|------|-------|------|
| `skills/draft-issue/references/multi-issue.md` | 325-335 | Produces both the body dependency reference and native parent link that identify epic membership. |
| `skills/start-issue/SKILL.md` | 53-134 | Merges native and body relationships into `parentsOf`, then blocks on every open parent without checking its role. |
| `scripts/sdlc-runner.mjs` | 2094-2200 | Independently builds runner dependencies and assumes out-of-pool targets are satisfied, causing accidental rather than explicit epic handling. |
| `skills/write-spec/references/discovery.md` | 7-36 | Consumes parent identity to find and amend an umbrella spec. |
| `skills/open-pr/references/version-bump.md` | 31-45 | Consumes parent identity and the `epic` label for sibling-aware release classification. |

### Triggering Conditions

- An open child is linked to an open coordination epic by a native parent link, a `Depends on:` body reference, or both.
- The child has no genuine open sibling or non-epic prerequisite.
- Bare `$nmg-sdlc:start-issue` runs dependency filtering before presenting the candidate list.
- The defect escaped because runner selection usually omits the non-automatable epic from its candidate pool, masking the semantic mismatch in unattended operation.

---

## Fix Strategy

### Approach

Define one shared, documented relationship-role contract and apply it before either selector performs blocked filtering or topological ordering. Each supported same-repository native-parent, `Depends on:`, or `Blocks:` target is hydrated with live labels and state, deduplicated by child/target pair, and classified as one of:

- `epic-membership` when the target is confirmed to carry the `epic` label; this edge remains available as coordination identity but is excluded from blocking and topological in-degree.
- `execution-dependency` when the target is confirmed non-epic; existing blocking and ordering rules apply.
- `execution-dependency` with an actionable warning when target metadata cannot be confirmed; failure stays fail-safe and never silently marks the child ready.

The GitHub graph and issue bodies remain unchanged. This is a read-time semantic correction, not a migration. `write-spec` and `open-pr` continue consuming the same link forms. The runner continues to avoid the unsupported `gh issue view --json parent` field: it uses GraphQL for native-parent discovery, supported `gh issue view` fields for target labels/state, and body-only fallback when native metadata is unavailable.

### Changes

| File | Change | Rationale |
|------|--------|-----------|
| `references/epic-relationships.md` | Add the canonical signal, classification, fallback, and warning decision table. | Gives manual skills and deterministic code one semantic source of truth. |
| `skills/start-issue/SKILL.md` | Read the shared contract; request target labels in dependency metadata; partition coordination and execution edges before filtering; replace fail-open unknown-parent handling with a warning and blocking fallback. | Fixes the user-visible deadlock and makes manual/unattended skill paths agree. |
| `scripts/sdlc-runner.mjs` | Hydrate explicit relationship targets, discover native parents through GraphQL, classify roles before readiness checks, and evaluate genuine dependencies independently of automatable-pool membership. | Makes runner readiness intentional and consistent without requesting unsupported CLI JSON fields. |
| `scripts/__tests__/select-next-issue-from-milestone.test.mjs` | Extend mocks and assertions for native-plus-body, body-only, native-only, non-epic, genuine sibling, and metadata-failure paths. | Provides deterministic regression coverage for runner selection and fallbacks. |
| `scripts/__tests__/epic-relationship-contract.test.mjs` | Add a cross-skill contract test over producer, selectors, and downstream consumers. | Prevents future fixes from deleting identity signals or re-conflating their roles. |
| `scripts/__tests__/exercise-start-issue-epic.test.mjs` | Add an opt-in disposable bare-selection exercise using controlled GitHub metadata. | Verifies the prompt-driven skill behavior beyond static wording. |
| `README.md` | Document that coordination epics do not block their children while genuine prerequisites do. | Keeps the public workflow description aligned with behavior. |
| `CHANGELOG.md` | Add the issue #149 fix under `[Unreleased]`. | Records the pending user-visible correction for release. |

All edits to `references/epic-relationships.md` and `skills/start-issue/SKILL.md` are performed through `$skill-creator`, as required by `steering/tech.md` and `steering/structure.md` for skill-bundled files.

### Internal Interfaces

```text
classifyRelationship(targetMetadata)
  -> "epic-membership" | "execution-dependency"

hydrateRelationshipTargets(candidateIssues, parsedEdges)
  -> target metadata keyed by issue number, plus warning records
```

These are internal implementation boundaries only. The plugin adds no CLI arguments, configuration fields, persistent state, or public output-schema changes.

### Blast Radius

- **Direct impact**: Candidate readiness and ordering in bare `start-issue` and runner preselection; dependency diagnostics and blocked counts; GitHub metadata query shapes.
- **Indirect impact**: `draft-issue` remains the producer of epic identity, while `write-spec` and `open-pr` remain downstream consumers of those unchanged links. Candidate-pool behavior for explicit same-repository non-epic dependencies becomes fail-safe instead of assuming an unlisted target is satisfied.
- **Risk level**: Medium. The fix touches both prompt-defined workflow behavior and deterministic runner code, but it is bounded to relationship classification and adds no graph mutation.

---

## Regression Risk

| Risk | Likelihood | Mitigation |
|------|------------|------------|
| A genuine dependency is misclassified as coordination and a child starts early. | Medium | Require a confirmed `epic` label; unknown or failed metadata remains blocking and emits an actionable warning. |
| Duplicate native-plus-body signals produce inconsistent counts or ordering. | Medium | Deduplicate by child/target pair before role classification and test the current dual-link contract explicitly. |
| Body-only or native-only degraded graphs stop resolving the epic. | Medium | Cover both forms independently; use GraphQL for native parent data and supported body/label fields for fallback. |
| Runner reintroduces unsupported `gh issue view --json parent`. | Low | Preserve and extend the existing regression test that rejects that field; native discovery stays on GraphQL. |
| `write-spec` umbrella amendment or `open-pr` sibling-aware versioning loses its parent identity. | Low | Do not mutate issue links and add cross-skill contract assertions for both downstream consumers. |
| Added metadata lookups slow selection or hit transient GitHub failures. | Medium | Deduplicate targets, batch GraphQL queries, avoid graph-wide scans, and fail safe with a named warning when lookup fails. |

---

## Alternatives Considered

| Option | Description | Why Not Selected |
|--------|-------------|------------------|
| Remove `Depends on: #epic` or the native parent link | Eliminate the signal that currently causes blocking. | Breaks body/native fallback resilience and risks downstream umbrella discovery and release classification. |
| Special-case an issue number that is absent from the automatable pool | Preserve current runner behavior and imitate it in manual selection. | Candidate-pool membership is not relationship semantics; genuine dependencies can also be outside that pool. |
| Treat every parent as non-blocking | Exclude all native parents from readiness checks. | Silently discards genuine non-epic prerequisites and violates backward compatibility. |
| Cache epic classifications in runner state | Resolve labels once and reuse them across cycles. | GitHub labels and relationships can change; stale cache would reintroduce manual/runner drift. |

---

## Change History

| Issue | Date | Summary |
|-------|------|---------|
| #149 | 2026-08-13 | Initial defect design |

---

## Validation Checklist

Before moving to TASKS phase:

- [x] Root cause is identified with specific code references
- [x] Fix is minimal -- no unrelated refactoring
- [x] Blast radius is assessed
- [x] Regression risks are documented with mitigations
- [x] Fix follows existing project patterns (per `structure.md`)
