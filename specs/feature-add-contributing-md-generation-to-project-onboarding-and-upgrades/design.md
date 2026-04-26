# Design: Add CONTRIBUTING.md Generation to Project Onboarding and Upgrades

**Issues**: #109
**Date**: 2026-04-26
**Status**: Draft
**Author**: Codex

---

## Overview

This feature adds one shared contribution-guide workflow contract and wires it into the two project-lifecycle skills that can establish or refresh project standards: `$nmg-sdlc:onboard-project` and `$nmg-sdlc:upgrade-project`. The shared contract is responsible for inspecting steering docs, preserving existing project-authored contribution content, creating or appending an nmg-sdlc contribution section, inserting an idempotent README link, and returning a concise status for each calling skill's summary.

The design deliberately keeps the generated guide as project content, not plugin metadata. `CONTRIBUTING.md` is written at the consumer project root after steering exists; project-specific language comes from `steering/product.md`, `steering/tech.md`, and `steering/structure.md`; and existing `CONTRIBUTING.md` / `README.md` content is treated as user-owned. `$nmg-sdlc:upgrade-project` also changes its broader file-creation policy: instead of saying it never creates files, it may create missing project-root artifacts that the current plugin contract explicitly declares managed and non-destructive. `CONTRIBUTING.md` is the first artifact covered by that managed-artifact policy.

---

## Architecture

### Component Diagram

```text
Project lifecycle skills
  |
  |-- skills/onboard-project/SKILL.md
  |     |-- references/greenfield.md
  |     `-- references/brownfield.md
  |
  |-- skills/upgrade-project/SKILL.md
  |     `-- references/upgrade-procedures.md
  |
  `-- shared reference
        `-- references/contribution-guide.md
              |-- reads steering/product.md
              |-- reads steering/tech.md
              |-- reads steering/structure.md
              |-- creates or updates CONTRIBUTING.md
              `-- links README.md when present
```

### Data Flow

```text
1. Calling skill reaches a point where steering docs are known to exist.
2. Calling skill reads references/contribution-guide.md.
3. Contribution-guide workflow reads product, tech, and structure steering.
4. Workflow inspects root CONTRIBUTING.md and README.md if present.
5. Workflow creates a guide, appends a missing nmg-sdlc section, or reports already-present coverage.
6. Workflow inserts a README link when README.md exists and lacks one.
7. Workflow returns per-artifact status for the calling skill summary.
8. Calling skill continues its existing mode-specific flow.
```

---

## API / Interface Changes

### New Skill Reference Contract

| Interface | Type | Purpose |
|-----------|------|---------|
| `references/contribution-guide.md` | Shared reference | Defines how lifecycle skills ensure `CONTRIBUTING.md`, preserve existing content, insert README links, summarize status, and handle unattended mode |
| Managed artifact policy | Upgrade-project instruction contract | Defines that upgrade-project may create missing files only when the current plugin contract names them as managed, non-destructive project artifacts |

### Calling Skill Integration Points

| Caller | Integration Point | Purpose |
|--------|-------------------|---------|
| `skills/onboard-project/SKILL.md` | Workflow and summary sections | Declare the shared reference and include contribution-guide status in Step 5 |
| `skills/onboard-project/references/greenfield.md` | After steering bootstrap/enhancement verification | Ensure the guide for greenfield and greenfield-enhancement modes before milestone/issue seeding continues |
| `skills/onboard-project/references/brownfield.md` | After steering bootstrap/reverification in Step 2B | Ensure the guide for brownfield and brownfield-no-issues modes before reconciliation exits |
| `skills/upgrade-project/SKILL.md` | What Gets Analyzed, Step 8, Step 9, Key Rules | Treat contribution-guide coverage as a non-destructive upgrade finding and replace the blanket "never create files" rule with managed-artifact creation policy |
| `skills/upgrade-project/references/upgrade-procedures.md` | Apply procedures and output summary | Apply approved guide/README edits and report created, updated, skipped, or already-present statuses |

### Request / Response Shape

The shared reference is prompt-contract based rather than a code API. It should still define a stable session result shape for callers:

```text
Contribution Guide:
- CONTRIBUTING.md: created | updated | already present | skipped (<reason>)
- README.md link: added | already present | skipped (README missing)
- Gaps: <none | list>
```

---

## Database / Storage Changes

No database changes.

### Project File Changes

| File | Change | Rule |
|------|--------|------|
| `CONTRIBUTING.md` | Created when missing, or appended with a targeted nmg-sdlc contribution section when incomplete | Preserve existing content; managed non-destructive artifact for upgrade-project |
| `README.md` | Existing README receives an idempotent link to `CONTRIBUTING.md` | Do not create README when absent |

### Generated Guide Structure

The shared reference should define a stable default structure for newly created guides:

```markdown
# Contributing

## Project Context

## Issue and Spec Workflow

## Steering Expectations

## Implementation and Verification
```

For existing guides, the workflow should append a single targeted section such as `## nmg-sdlc Contribution Workflow` when equivalent coverage is absent. Equivalent coverage may be detected by a `CONTRIBUTING.md` link plus nearby references to issue, spec, and steering expectations, or by the canonical heading itself. The implementation should prefer conservative "already present" detection over duplicating near-identical sections.

---

## State Management

No runtime state is added. Each run derives guide status from the current filesystem:

| State | Detection | Action |
|-------|-----------|--------|
| Missing guide | `CONTRIBUTING.md` absent | Create root guide after steering exists |
| Incomplete guide | Guide exists but lacks nmg-sdlc issue/spec/steering coverage | Append targeted section |
| Complete guide | Guide includes equivalent coverage | Report already present |
| README missing | `README.md` absent | Report gap/skip; do not create README |
| README linked | README already links to `CONTRIBUTING.md` | Report already present |
| README unlinked | README exists without guide link | Insert or append a discoverable contribution link |

---

## UI Components

No graphical UI is introduced.

### User-Facing Output

| Output | Location | Purpose |
|--------|----------|---------|
| Contribution-guide status | `onboard-project` Step 5 summary | Shows guide and README-link outcomes for onboarding modes |
| Contribution-guide finding | `upgrade-project` Step 8 findings | Allows interactive review when contribution-guide changes are proposed |
| Upgrade complete status | `upgrade-project` Step 9 summary | Reports applied, skipped, or already-present guide/link outcomes |

---

## Alternatives Considered

| Option | Description | Pros | Cons | Decision |
|--------|-------------|------|------|----------|
| Duplicate guide logic in both skills | Add separate instructions to onboard-project and upgrade-project | Minimal new files | High drift risk; two skills could generate different guide content | Rejected |
| Add a new public `$nmg-sdlc:contribution-guide` skill | Make guide generation user-invoked | Clear standalone command | Adds workflow ceremony for an artifact that should be automatic during lifecycle setup | Rejected |
| Shared reference consumed by lifecycle skills | Put content/update/idempotency rules in `references/contribution-guide.md` | One source of truth; fits existing shared-reference architecture | Adds a new shared prompt file that must be inventory-checked | Selected |
| Template-only guide generation | Add a static `CONTRIBUTING.md` template | Simple creation path | Does not handle existing guide preservation or steering-derived content | Rejected |
| Narrow `CONTRIBUTING.md` exception in upgrade-project | Keep "never create files" but carve out this file | Smallest text change | Preserves a rule the user explicitly wants fixed and invites future one-off exceptions | Rejected |
| Managed-artifact creation policy in upgrade-project | Allow creation of declared, non-destructive project artifacts | Fixes the underlying workflow rule while preserving guardrails against arbitrary file creation | Requires clearer wording in key rules and tests | Selected |

---

## Security Considerations

- [x] **Authentication**: No new authentication surface.
- [x] **Authorization**: No external permissions beyond the existing skills' file editing scope.
- [x] **Input Validation**: Treat steering and existing Markdown as project-owned input; summarize cautiously and avoid fabricating stack-specific requirements.
- [x] **Data Sanitization**: Do not copy secrets or internal URLs from steering into README links; generated content should summarize expectations, not dump entire steering files.
- [x] **Sensitive Data**: Preserve existing policy content without exposing additional data outside the repository.

---

## Performance Considerations

- [x] **Caching**: No caching required; inspect a small, fixed set of Markdown files each run.
- [x] **Large Files**: For unusually large existing guides or README files, use heading/link search before targeted edits to avoid broad rewrites.
- [x] **Repeated Runs**: Idempotency checks must short-circuit when guide and link are already present.

---

## Testing Strategy

| Layer | Type | Coverage |
|-------|------|----------|
| Skill contract | Static/unit | Assert both lifecycle skills reference `references/contribution-guide.md`, upgrade-project classifies guide creation as non-destructive, and no blanket "never create files" prohibition remains |
| Markdown behavior | Static/unit | Assert the shared reference defines preservation, README-missing skip, README-link idempotency, steering-derived content, and summary status contracts |
| Public docs | Static/unit | Assert README mentions contribution-guide creation during first-time setup and upgrade behavior |
| Feature | Exercise/BDD | Exercise onboarding and upgrade against disposable projects where feasible, checking guide creation, existing-guide preservation, README link insertion, and clean rerun status |
| Inventory | Audit | Run `node scripts/skill-inventory-audit.mjs --check`; update `scripts/skill-inventory.baseline.json` if the new shared reference changes the inventory contract |
| Compatibility | Audit | Run `npm --prefix scripts run compat` to catch loader limits and Codex compatibility issues |

---

## Risks & Mitigations

| Risk | Likelihood | Impact | Mitigation |
|------|------------|--------|------------|
| Existing `CONTRIBUTING.md` content is overwritten | Low | High | Shared reference must require additive edits only and targeted section insertion; tests include existing-guide preservation |
| README link is duplicated | Medium | Medium | Detect any existing `CONTRIBUTING.md` link before inserting; rerun tests assert no diff |
| `upgrade-project` creates arbitrary files | Low | High | Replace the blanket prohibition with an explicit managed-artifact policy: only files named by the current upgrade contract may be created |
| Generated content becomes stack-specific | Low | Medium | Source project-specific expectations only from steering docs; keep default guide language stack-agnostic |
| Exercise verification is blocked by environment constraints | Medium | Medium | Record the limitation in verification and retain static contract tests as the deterministic fallback |

---

## Open Questions

None.

---

## Change History

| Issue | Date | Summary |
|-------|------|---------|
| #109 | 2026-04-26 | Initial feature spec |

---

## Validation Checklist

Before moving to TASKS phase:

- [x] Architecture follows existing project patterns per `structure.md`
- [x] All API/interface changes documented
- [x] Database/storage changes planned
- [x] State management approach is clear
- [x] UI components and hierarchy addressed
- [x] Security considerations addressed
- [x] Performance impact analyzed
- [x] Testing strategy defined
- [x] Alternatives were considered and documented
- [x] Risks identified with mitigations
