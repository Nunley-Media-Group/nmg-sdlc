# Root Cause Analysis: Persist Multi-PR Umbrella Identity Across Child Workflows

**Issue**: #160
**Date**: 2026-08-14
**Status**: Investigating
**Author**: Rich Nunley

---

## Root Cause

The surviving umbrella workflow has the right GitHub primitives but no complete persisted identity invariant. `skills/write-spec/references/umbrella-mode.md` describes an `epic` parent label, an `epic-child-of-N` child label, a native sub-issue link, and a `Depends on: #N` body fallback, yet its transition sequence retains `epicParentNumber` only in session state. The related `$nmg-sdlc:draft-issue` epic fan-out currently labels children only by issue type. Neither flow revalidates the full identity tuple before handing control to a later session.

Consumers then reconstruct membership independently. `references/epic-relationships.md` treats a live `epic` label on a relationship target as authoritative, while `skills/open-pr/references/version-bump.md` enumerates siblings only from the parent's `## Child Issues` checklist. `write-spec` and `write-code` use the shared relationship prose for the canonical parent gate, but `verify-code` has no equivalent entry gate and `status` delegates to a CLI that does not expose coordination identity. A missing label or stale checklist can therefore produce a different answer at each stage even though native GitHub relationships still exist.

### Affected Code

| File | Role |
|------|------|
| `references/epic-relationships.md` | Shared relationship signals and readiness classification, currently missing the durable child-label invariant and consistency states. |
| `skills/write-spec/SKILL.md` | Transitions a canonical parent toward child creation without first persisting and revalidating the parent identity. |
| `skills/write-spec/references/umbrella-mode.md` | Documents the intended metadata tuple but retains the parent only in session state. |
| `skills/draft-issue/references/multi-issue.md` | Produces epic children without consistently applying `epic-child-of-N`. |
| `skills/start-issue/SKILL.md`, `skills/write-code/SKILL.md`, `skills/verify-code/SKILL.md`, `skills/status/SKILL.md`, `skills/open-pr/references/version-bump.md` | Lifecycle consumers with incomplete or independently expressed classification and sibling-discovery behavior. |
| `scripts/sdlc-status.mjs` | Reports lifecycle stage without persisted coordination identity. |
| `skills/upgrade-project/SKILL.md` | Existing approval-gated utility surface lacks an umbrella-identity audit and recovery route. |

### Triggering Conditions

- A parent that became an umbrella during specification publication does not retain the `epic` label.
- A child lacks `epic-child-of-N`, leaving later commands dependent on native/body evidence alone.
- The native relationship graph and body checklist disagree.
- A later command begins in a fresh session and cannot use the ephemeral `epicParentNumber` value.

---

## Fix Strategy

### Approach

Make the existing four-part tuple explicit and reconstructable:

1. The coordination parent carries `epic`.
2. Every child carries exactly one matching `epic-child-of-N` label.
3. GitHub's native parent/sub-issue relationship is the authoritative membership graph when available.
4. The supported body reference and checklist remain readable reconciliation evidence and report-only fallback when native discovery fails.

Add a zero-dependency `scripts/epic-relationships.mjs` module for pure normalization and classification. The module accepts hydrated issue records rather than performing writes. It deduplicates signals, distinguishes `durable`, `legacy`, `inconsistent`, `ambiguous`, and `unverifiable` coordination states, and preserves genuine execution dependencies. `sdlc-status.mjs` uses the module to expose the active issue's coordination result. Prompt-defined consumers continue to read `references/epic-relationships.md`, which specifies the same inputs, outputs, and fail-safe decision table and names the module as the deterministic reference implementation.

Producer contracts persist and revalidate labels before child handoff. Sibling enumeration uses native `subIssues` as authoritative and unions checklist evidence only to identify stale or degraded representations. Legacy repairs belong to `$nmg-sdlc:upgrade-project`: it audits exact issue records read-only, proposes the minimal label/link/checklist changes, asks for approval per mutation set, re-fetches the same records before applying commands, and proves a second audit is clean.

### Changes

| File | Change | Rationale |
|------|--------|-----------|
| `scripts/epic-relationships.mjs` | Add pure signal normalization, role classification, consistency diagnostics, and sibling reconciliation helpers. | Provides one executable semantics layer for deterministic consumers and tests. |
| `references/epic-relationships.md` | Define the durable tuple, consistency states, shared result fields, consumer obligations, and legacy behavior. | Keeps prompt-defined skills aligned with the executable classifier. |
| `skills/write-spec/SKILL.md` | Persist and revalidate the current umbrella's `epic` label before child creation; retain the existing canonical-spec gate and no-reseal behavior. | Removes session-only parent identity. |
| `skills/write-spec/references/umbrella-mode.md` | Require the full tuple and replace session-only handoff with live re-resolution. | Makes the production recipe durable across sessions. |
| `skills/draft-issue/references/multi-issue.md` | Create/apply `epic-child-of-N` to every epic child and preserve native/body signals. | Makes every new child self-identifying. |
| `skills/start-issue/SKILL.md`, `skills/write-code/SKILL.md`, `skills/verify-code/SKILL.md`, `skills/status/SKILL.md` | Consume the shared result and stop safely on ambiguity/inconsistency before stage-specific work. | Aligns selection, implementation, verification, and reporting. |
| `skills/open-pr/references/version-bump.md` | Consume the shared classification and reconcile native siblings with checklist evidence. | Prevents stale checklists from omitting delivery siblings. |
| `scripts/sdlc-status.mjs` | Hydrate read-only relationship metadata and include coordination identity in text/JSON evidence. | Makes status agree with other lifecycle consumers across fresh sessions. |
| `skills/upgrade-project/SKILL.md`, `skills/upgrade-project/references/epic-identity-recovery.md` | Add exact, approval-gated, revalidated, idempotent audit and repair instructions. | Supplies the supported recovery path without background mutation. |
| `scripts/__tests__/epic-relationships.test.mjs`, existing epic/status contract tests, and a lifecycle fixture | Cover durable, legacy, dependency, mismatch, ambiguity, sibling-reconciliation, and fresh-session paths. | Proves behavior and protects cross-skill consistency. |
| `README.md` | Document persisted umbrella metadata, authoritative sibling discovery, and upgrade recovery. | Keeps public behavior aligned. |

All edits below `skills/` and `references/` are routed through `$skill-creator`, as required by technical steering.

### Internal Interface

```text
classifyEpicRelationships({ issues, activeIssueNumber })
  -> {
       role,
       parentNumber,
       identity,
       consistency,
       nativeAuthority,
       degraded,
       coordinationPairs,
       executionDependencies,
       siblingNumbers,
       gaps
     }

reconcileEpicSiblings({ nativeChildren, checklistChildren })
  -> { siblingNumbers, nativeOnly, checklistOnly }
```

The module does not execute `gh`, mutate issue metadata, or cache results. Callers hydrate current records and rerun classification at each lifecycle entry point.

### Consistency Rules

| Evidence | Classification | Behavior |
|----------|----------------|----------|
| Parent has `epic`, child has matching `epic-child-of-N`, and every available native/body identity signal agrees with both required signal classes present | `epic-child` / `durable` | Continue with `consistency = consistent`, `nativeAuthority = native`, and exclude the parent from blockers. |
| Native discovery completed; parent has `epic` and a supported native/body relationship agrees, but the child label is absent | `epic-child` / `legacy` | Continue with a named repair recommendation; do not erase backward compatibility. |
| Child label points at a confirmed non-epic target, labels disagree with native/body parent, a required native/body signal is missing while its source is available, or more than one child label exists | `inconsistent` | Stop before branch/spec/code/delivery mutation and report exact signals. |
| More than one confirmed epic parent remains after deduplication | `ambiguous` | Stop and name each candidate. |
| Required target metadata cannot be hydrated | `unverifiable` for claimed coordination; execution dependencies remain blocking | Fail closed with bounded diagnostics. |
| Native parent/sub-issue discovery fails while body or checklist evidence remains | `unverifiable` / `checklist-fallback` | Preserve evidence for reporting, but stop completion, version, delivery, and consuming mutation. |

### Blast Radius

- **Direct impact**: umbrella creation, child readiness, canonical-spec routing, verification entry, lifecycle status, sibling-aware version classification, and upgrade auditing.
- **Indirect impact**: GitHub query shapes gain labels/native relationships; the status JSON schema gains a nullable coordination object; exercise fixtures must model the durable labels.
- **Risk level**: Medium-high. The change crosses the full manual pipeline, but it is constrained to coordination metadata and read-time classification and adds no automatic background workflow.

---

## Regression Risk

| Risk | Likelihood | Mitigation |
|------|------------|------------|
| A genuine dependency is mistaken for coordination and stops blocking. | Medium | Require a confirmed `epic` target and an agreeing supported signal; unknown targets remain blocking. |
| Existing valid umbrellas without child labels become unusable. | Medium | Preserve an explicit `legacy` classification that continues with a repair recommendation. |
| A stale checklist adds a non-native issue as a sibling. | Medium | Treat native children as authoritative when available; report checklist-only entries rather than silently trusting them. |
| Native relationship API degradation hides every sibling. | Medium | Preserve checklist fallback for reporting, surface degraded authority, and block consuming mutations until native discovery succeeds. |
| Status introduces GitHub mutations or changes lifecycle stage inference. | Low | Keep queries read-only, isolate coordination as evidence, and retain existing stage logic. |
| Recovery overwrites concurrent issue edits. | Medium | Require exact approval, re-fetch and compare evidence before mutation, and abort on drift. |
| Skill contracts drift from executable classification. | Medium | Add cross-skill contract assertions for shared result fields and decision table wording. |

---

## Alternatives Considered

| Option | Description | Why Not Selected |
|--------|-------------|------------------|
| Treat any native parent as an epic | Make all GitHub parent links non-blocking. | Native relationships can encode genuine execution dependencies; this would start blocked work. |
| Use only `epic-child-of-N` | Make the child label the sole source of truth. | A mistyped label could suppress a real dependency and would discard native graph authority. |
| Use only the parent `epic` label | Keep the current classification and fix only one producer. | It leaves child identity incomplete, status opaque, and sibling discovery dependent on stale checklists. |
| Persist a local state file | Cache umbrella identity in the repository. | GitHub is the coordination authority, and local state would drift across branches and sessions. |
| Automatically repair every discovered legacy record | Rewrite labels, relationships, and bodies during normal lifecycle entry. | Violates remote-write ownership and explicit approval requirements. |

---

## Change History

| Issue | Date | Summary |
|-------|------|---------|
| #160 | 2026-08-14 | Initial defect design |

---

## Validation Checklist

Before moving to TASKS phase:

- [x] Root cause is identified with specific code references
- [x] Fix preserves the existing GitHub coordination model
- [x] Every issue acceptance criterion maps to a design element
- [x] Blast radius is assessed
- [x] Regression risks include fail-safe dependency handling and concurrent repair drift
- [x] Skill-bundled edits are routed through `$skill-creator`
- [x] No new persistent state or background automation is introduced
