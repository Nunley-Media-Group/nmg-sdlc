# Epic Aggregate Design: [Epic title]

**Issue**: #[epic-number]
**Date**: [YYYY-MM-DD]
**Status**: Draft
**Author**: [Author]

---

> This design records integration contracts and topology only. Executable
> implementation and verification design belongs to child packages.
> Pull-request delivery remains active through exact-head merge and child
> closure; eligible epic ancestors are reconciled explicitly afterward.

## Architecture Outcome

[Describe how the child deliverables compose into the aggregate result.]

## Child Boundaries

| Child Issue | Responsibility | Produces | Consumes |
|-------------|----------------|----------|----------|
| #[child-number] | [Bounded responsibility] | [Artifact/contract] | [Artifact/contract or None] |

## Dependency Topology

```text
#[prerequisite-child] -> #[dependent-child]
```

Epic membership is not an execution dependency. Record only genuine deliverable
or execution prerequisites in the topology.

## Integration Contracts

### [Contract name]

- Producer: #[child-number]
- Consumer: #[child-number]
- Stable interface: [Interface or artifact]
- Compatibility rule: [Rule]

## Rollout and Recovery

[Describe cross-child rollout order, compatibility window, and recovery.]

## Risks and Mitigations

| Risk | Mitigation |
|------|------------|
| [Cross-child risk] | [Mitigation] |

## Change History

| Issue | Date | Summary |
|-------|------|---------|
| #[epic-number] | [YYYY-MM-DD] | Initial coordination design |
