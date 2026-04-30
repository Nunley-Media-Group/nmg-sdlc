# Design: Add Bounded Relevant-Spec Discovery for nmg-sdlc Projects

**Issues**: #139
**Date**: 2026-04-30
**Status**: Approved
**Author**: Codex

---

## Overview

This feature adds two shared contracts and wires them into the SDLC pipeline. `references/spec-context.md` defines how skills establish active-plus-neighboring spec context without loading the full archive. `references/project-agents.md` defines how onboarding and upgrade manage root `AGENTS.md` guidance so general Codex prompts and SDLC workflows treat `specs/` as the default project contract source.

The design follows the existing shared-reference pattern used by `references/contribution-guide.md`, `references/contribution-gate.md`, and `references/issue-form.md`: put reusable behavior in one contract, have skills point at that contract with auditable `Read ... when ...` lines, and add Jest tests that assert both the contract content and the consuming-skill pointers. Implementation of skill-bundled files must route through `$skill-creator` per `steering/tech.md`; the spec names the files and behavior, while the implementation step should use that authoring path.

The core architectural decision is to avoid a generated `specs/INDEX.md` for the first implementation. The contract performs per-run compact metadata extraction from Markdown, ranks candidates, then fully loads only the active spec and a capped set of related specs. That balances context efficiency with enough surrounding evidence to prevent siloed changes.

---

## Architecture

### Component Diagram

```text
Consumer project
  |
  |-- specs/                         canonical BDD archive
  |     |-- feature-*/requirements.md
  |     |-- feature-*/design.md
  |     |-- feature-*/tasks.md
  |     `-- bug-*/requirements.md
  |
  |-- AGENTS.md                      managed guidance target
  |
  `-- nmg-sdlc skills
        |
        |-- draft-issue              uses spec context for current-state investigation
        |-- write-spec               uses parent links, then spec-context ranking
        |-- write-code               active spec first, neighboring contracts second
        |-- verify-code              active spec plus related blast-radius context
        |-- onboard-project          creates/updates AGENTS.md guidance
        `-- upgrade-project          reconciles AGENTS.md guidance

nmg-sdlc plugin
  |
  |-- references/spec-context.md      shared discovery and loading contract
  |-- references/project-agents.md    managed AGENTS.md contract
  `-- scripts/__tests__/             static and exercise contract coverage
```

### Data Flow

```text
1. A consuming skill identifies the active issue, active spec, changed paths, or natural-language request.
2. The skill reads references/spec-context.md at the declared workflow point.
3. The contract enumerates specs/*/requirements.md and extracts compact metadata.
4. The contract ranks candidates using strong signals first:
   - active issue/frontmatter match
   - parent/body issue references
   - Related Spec links
   - affected paths, symbols, and component names
   - AC/FR names and headings
   - title/slug and strong keyword overlap
5. The contract returns the active spec, related candidates, ranking reasons, and gaps.
6. The consuming skill fully loads the active spec plus the capped related set.
7. Decisions proceed with surrounding context visible and unrelated spec bodies left unloaded.
```

For project guidance:

```text
1. onboard-project or upgrade-project verifies steering exists.
2. The skill reads references/project-agents.md.
3. The contract inspects root AGENTS.md if present.
4. If missing, it creates a root AGENTS.md with a concise managed nmg-sdlc section.
5. If present but incomplete, it appends or refreshes only the managed section.
6. Existing project-authored instructions remain byte-stable outside the managed section.
7. The calling skill reports AGENTS.md status in its summary.
```

---

## API / Interface Changes

### Shared Reference: `references/spec-context.md`

| Interface | Type | Purpose |
|-----------|------|---------|
| Active inputs | Contract section | Defines accepted signals: issue number, branch slug, active spec path, changed files, affected symbols, component names, and prompt text. |
| Metadata fields | Contract section | Defines compact extraction from spec slug/title, frontmatter, related-spec links, headings, AC/FR labels, paths, symbols, and component names. |
| Ranking rules | Contract section | Defines precedence, weights, thresholds, caps, tie-breakers, and ranking-reason output. |
| Load contract | Contract section | Requires full loading of active spec and capped related specs only; all other specs stay metadata-only. |
| Result shape | Stable text | `activeSpec`, `relatedSpecs`, `metadataOnlyCount`, `rankingReasons`, `gaps`. |

Recommended defaults:

| Setting | Value | Rationale |
|---------|-------|-----------|
| Full related-spec cap | 3 | Enough neighboring context for typical changes without bloating prompt state. |
| Candidate presentation cap | 5 | Keeps interactive gates reviewable. |
| Strong match threshold | At least one strong signal or multiple medium signals | Prevents generic terms like `nmg-sdlc` from dominating. |
| Tie-breaker | Active issue/frontmatter, then path/symbol evidence, then title/slug, then lexical path sort | Deterministic and explainable. |

### Shared Reference: `references/project-agents.md`

| Interface | Type | Purpose |
|-----------|------|---------|
| Managed section marker | Markdown/HTML marker | Lets upgrades find and refresh nmg-sdlc-owned guidance without touching project-authored instructions. |
| Coverage detection | Contract section | Detects equivalent guidance when `AGENTS.md` already mentions `specs/`, steering, bounded discovery, and active-plus-neighboring context. |
| Status output | Stable text | `AGENTS.md: created | updated | already present | skipped (<reason>)`. |

Suggested managed section:

```markdown
<!-- nmg-sdlc-managed: spec-context -->
## nmg-sdlc Spec Context

For SDLC work, project-root `specs/` is the canonical BDD archive. Always identify the active spec first, then use bounded relevant-spec discovery to load only the neighboring specs that can affect the change. Do not load the full archive by default, and do not use legacy `.codex/specs/` as context.
<!-- /nmg-sdlc-managed -->
```

---

## Components Modified

| Component | Type | Change |
|-----------|------|--------|
| `references/spec-context.md` | Create | Shared contract for bounded active-plus-neighboring spec discovery. |
| `references/project-agents.md` | Create | Shared contract for root `AGENTS.md` managed guidance. |
| `skills/draft-issue/SKILL.md` | Modify | Step 4 uses `references/spec-context.md` for feature investigation before interviewing and drafting. |
| `skills/write-spec/SKILL.md` | Modify | Declares the shared context contract and points discovery to it. |
| `skills/write-spec/references/discovery.md` | Modify | Keeps parent-link resolution first; replaces simple keyword fallback with spec-context ranking and threshold behavior. |
| `skills/write-code/SKILL.md` | Modify | After active spec loading, loads bounded neighboring specs when planning can be affected by surrounding contracts. |
| `skills/verify-code/SKILL.md` | Modify | Uses related specs during acceptance, blast-radius, architecture, and test-coverage review. |
| `skills/onboard-project/SKILL.md` | Modify | Declares `references/project-agents.md` and includes AGENTS.md status in summary. |
| `skills/onboard-project/references/greenfield.md` | Modify | Applies AGENTS.md guidance after steering exists and before starter issues are generated. |
| `skills/onboard-project/references/brownfield.md` | Modify | Applies AGENTS.md guidance after steering verification succeeds. |
| `skills/upgrade-project/SKILL.md` | Modify | Treats root `AGENTS.md` guidance as a managed non-destructive artifact. |
| `skills/upgrade-project/references/upgrade-procedures.md` | Modify | Applies approved or unattended AGENTS.md findings and reports status. |
| `README.md` | Modify | Documents default bounded spec-context behavior and managed AGENTS.md guidance. |
| `CHANGELOG.md` | Modify | Adds an Unreleased entry for issue #139. |
| `scripts/__tests__/spec-context-contract.test.mjs` | Create | Static contract coverage for shared references and skill pointers. |
| `scripts/__tests__/exercise-spec-context.test.mjs` | Create | Disposable-project exercise coverage for ranking caps and AGENTS.md idempotency. |
| `scripts/skill-inventory.baseline.json` | Modify | Refresh if the inventory audit reports new tracked clauses. |

---

## Storage Changes

No application database changes.

Project-content storage changes in consumer projects:

| File | Change | Ownership |
|------|--------|-----------|
| `AGENTS.md` | Created when missing, or appended/refreshed with the managed nmg-sdlc spec-context section when incomplete | Project-authored content remains user-owned; only the marked section is nmg-sdlc-managed. |

No `specs/INDEX.md` or other persistent spec index is created.

---

## State Management

The feature is stateless across runs. Each workflow invocation derives spec context from current filesystem and GitHub issue state.

In-session state shape:

```text
SpecContext {
  activeSpec: string | null
  relatedSpecs: Array<{ path: string, score: number, reasons: string[] }>
  metadataOnlyCount: number
  scannedSpecCount: number
  loadedSpecCount: number
  gaps: string[]
}
```

`project-agents.md` returns:

```text
Project Agents Guidance:
- AGENTS.md: created | updated | already present | skipped (<reason>)
- Gaps: none | <comma-separated gaps>
```

---

## Alternatives Considered

| Option | Description | Pros | Cons | Decision |
|--------|-------------|------|------|----------|
| Persistent `specs/INDEX.md` | Generate and maintain an index of all spec metadata | Fast lookup after generation | Stale-index risk; adds managed artifact complexity; first implementation does not need it | Rejected |
| Load every spec body | Always read all specs before SDLC work | Maximum context | Bloats context and lowers effectiveness on mature projects | Rejected |
| Per-skill discovery logic | Each skill implements its own ranking rules | Localized edits | Drift between skills; hard to test consistently | Rejected |
| Shared `references/spec-context.md` | One contract consumed by affected skills | Consistent, testable, matches repo architecture | Requires multiple skill pointers and tests | Selected |
| Only update `CONTRIBUTING.md` | Put spec-context guidance in contribution guide only | Reuses existing managed artifact | Does not help prompt-level Codex sessions that read `AGENTS.md` for instructions | Rejected |
| Managed `AGENTS.md` section | Create/append root project instructions | Directly affects prompt-level behavior and preserves project content | Requires careful idempotency rules | Selected |

---

## Security Considerations

- Spec metadata extraction must parse Markdown as text only; never execute code blocks, shell snippets, or issue content.
- Ranking must avoid shell interpolation of spec-derived strings. File paths passed to shell commands must be fixed paths from file discovery output.
- `AGENTS.md` updates must not copy secrets, internal URLs, or long steering excerpts into managed guidance.
- Existing project-authored `AGENTS.md` content must not be deleted or reformatted.

---

## Performance Considerations

- Use file discovery for `specs/*/requirements.md` and parse compact metadata before loading bodies.
- Keep the full related-spec cap small, with a documented default of 3.
- Prefer exact frontmatter/path/symbol matches over broad keyword scans.
- Treat generic project terms as weak signals so mature repositories do not select irrelevant specs.
- Do not create a persistent index until measured scan cost justifies the additional artifact.

---

## Testing Strategy

| Layer | Type | Coverage |
|-------|------|----------|
| Shared contract | Static Jest | `references/spec-context.md` defines canonical specs, metadata-first scan, caps, thresholds, ranking reasons, and no index. |
| Skill wiring | Static Jest | Affected skills contain the expected `Read ../../references/spec-context.md` or `Read ../../references/project-agents.md` pointers. |
| Managed AGENTS.md | Static Jest | `references/project-agents.md` defines markers, additive update rules, status shape, and safety rules. |
| Discovery exercise | Jest with temp project | Ranking scans many specs, loads only active plus capped related specs, and exposes ranking reasons. |
| Guidance exercise | Jest with temp project | Missing, incomplete, and already-complete `AGENTS.md` states produce created, updated, and already-present statuses without duplicate sections. |
| Inventory | Script gate | `node scripts/skill-inventory-audit.mjs --check` passes after baseline refresh if needed. |

---

## Risks & Mitigations

| Risk | Likelihood | Impact | Mitigation |
|------|------------|--------|------------|
| Generic terms rank unrelated specs | Medium | High | Weight strong signals above broad keywords; require thresholds; include ranking reasons; gate ambiguity. |
| Context cap omits a relevant neighboring spec | Medium | Medium | Rank by issue links, related links, paths, symbols, and components before weak text; expose gaps and candidate list for interactive review. |
| AGENTS.md guidance duplicates existing project instructions | Medium | Medium | Use managed markers plus equivalent-coverage detection; tests cover reruns. |
| Skill inventory audit fails after new shared references | Medium | Low | Include explicit baseline refresh task and audit run. |
| Skill-bundled edits bypass skill-creator | Low | High | Tasks require `$skill-creator` for skill-bundled files per `steering/tech.md`; verify-code checks routing. |

---

## Open Questions

None.

---

## Change History

| Issue | Date | Summary |
|-------|------|---------|
| #139 | 2026-04-30 | Initial feature spec |

