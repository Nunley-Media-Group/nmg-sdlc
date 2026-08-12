# Defect Report: Fix nmg-sdlc steering and skill-contract documentation drift

**Issue**: #142
**Date**: 2026-07-31
**Status**: Investigating
**Author**: Rich Nunley
**Severity**: Medium
**Related Spec**: `specs/feature-setup-steering-skill/`

---

## Reproduction

### Steps to Reproduce

1. Open the standalone `nmg-sdlc` repository and confirm that `.codex-plugin/plugin.json`, `README.md`, and `AGENTS.md` identify the plugin as `nmg-sdlc`.
2. Inspect `steering/product.md`, `steering/tech.md`, and `steering/structure.md`.
3. Search those steering documents for `nmg-plugins`, unresolved placeholder values, irrelevant database or UI standards, and skill metadata claims such as `allowedTools`.
4. Compare the steering claims with active `skills/*/SKILL.md`, `agents/*.md`, shared `references/`, and `.codex-plugin/plugin.json`.
5. Observe that the repo-specific steering still describes the former monorepo identity and inactive Codex resource conventions.

### Environment

| Factor | Value |
|--------|-------|
| **OS / Platform** | Repository documentation on any supported platform |
| **Version / Commit** | nmg-sdlc 1.70.0 at `6c4167d` |
| **Browser / Runtime** | Codex plugin Markdown and Node.js contract tests |
| **Configuration** | Standalone `Nunley-Media-Group/nmg-sdlc` checkout |

### Frequency

Always - the stale text is committed in the live steering documents.

---

## Expected vs Actual

| | Description |
|---|-------------|
| **Expected** | Repo-specific steering and public contract guidance identify the standalone plugin as `nmg-sdlc`, contain only applicable standards, and describe the active Codex skill, agent, and plugin resource shape. Intentional references to the external `nmg-plugins` marketplace and legacy layouts remain intact. |
| **Actual** | The steering documents retain the former `nmg-plugins` project identity, unresolved database and UI placeholders, and inactive `allowedTools` and agent metadata claims that contradict the active plugin files. |

### Error Output

Not applicable. This is an authoritative-documentation defect that can misdirect later SDLC runs without producing a runtime exception.

---

## Acceptance Criteria

### AC1: Project Naming Drift Is Removed

**Given** a maintainer audits `README.md`, `AGENTS.md`, `steering/*.md`, active `skills/*/SKILL.md`, shared `references/`, and `.codex-plugin/plugin.json`
**When** project identity references are evaluated in context
**Then** current repo-specific guidance identifies the plugin as `nmg-sdlc`
**And** `nmg-plugins` remains only where it intentionally names the external marketplace, installed-cache path, or supported legacy layout.

### AC2: Placeholder Steering Sections Are Resolved

**Given** the repo-specific steering documents are authoritative input to future SDLC runs
**When** `steering/tech.md` and `steering/structure.md` are inspected
**Then** they contain no unresolved `[convention]`, `[example]`, `[token]`, or equivalent placeholder standards
**And** inapplicable database and UI/design-token sections are removed rather than presented as project conventions.

### AC3: Skill Contract Documentation Matches Live Files

**Given** the steering documents describe the active Codex skill, agent, and plugin contracts
**When** those claims are compared with `skills/*/SKILL.md`, `agents/*.md`, shared `references/`, and `.codex-plugin/plugin.json`
**Then** the documented metadata and resource shapes match the live files
**And** no active guidance claims that SKILL.md files contain `allowedTools` sections or that reusable agent prompt contracts declare unsupported execution-control fields
**And** an executable regression check fails if the stale identity, placeholder, or inactive-contract claims are reintroduced.

---

## Functional Requirements

| ID | Requirement | Priority |
|----|-------------|----------|
| FR1 | Audit live docs and steering for stale `nmg-plugins` identity references, correcting only references that incorrectly name this plugin rather than the marketplace, installed cache, or legacy layout. | Must |
| FR2 | Remove or replace unresolved and inapplicable technical placeholders from the repo-specific steering documents. | Must |
| FR3 | Align skill, agent, and plugin contract wording with the active Codex resource shape represented by the checked-in files. | Must |
| FR4 | Add a focused executable regression check for stale project identity, unresolved repo-specific placeholders, and inactive skill/agent metadata claims. | Should |

---

## Out of Scope

- Rewriting historical specs or changelog entries solely because they mention older repository paths.
- Changing distribution through the external `nmg-plugins` marketplace.
- Removing supported installed-cache or legacy-layout compatibility references from runtime code or configuration.
- Reworking generic onboarding templates whose placeholders are intentionally filled from a consumer project's discovered stack.
- Introducing new skill metadata fields or changing Codex behavior outside this plugin.
- Refactoring unrelated documentation, skills, agents, or runner behavior.

---

## Validation Checklist

- [x] Reproduction steps are repeatable and specific
- [x] Expected vs actual behavior is clearly stated
- [x] Severity is assessed
- [x] Acceptance criteria use Given/When/Then format
- [x] Regression behavior and intentional `nmg-plugins` exceptions are included
- [x] Fix scope is minimal and excludes unrelated feature work
- [x] Out of scope is defined

---

## Change History

| Issue | Date | Summary |
|-------|------|---------|
| #142 | 2026-07-31 | Initial defect report |
