# Project Vision & Personas

Generate during onboard (steering bootstrap). Pre-fill from codebase discovery, leave rest for customize.

---

```markdown
# [Project Name] Product Steering

This document defines the product vision, target users, and success metrics.
All feature development should align with these guidelines.

---

## Mission

**[Project Name] [does what] for [whom] by [how].**

<!-- TODO: Replace with your product's mission statement -->

---

## Target Users

### Primary: [Persona Name]

| Characteristic | Implication |
|----------------|-------------|
| [trait] | [how it affects design/features] |
| [trait] | [how it affects design/features] |

### Secondary: [Persona Name]

| Characteristic | Implication |
|----------------|-------------|
| [trait] | [how it affects design/features] |
| [trait] | [how it affects design/features] |

<!-- TODO: Define your user personas. Good personas drive better acceptance criteria. -->

---

## Core Value Proposition

1. **[Primary value]** — [What makes this uniquely useful]
2. **[Secondary value]** — [Additional benefit]
3. **[Tertiary value]** — [Nice-to-have differentiator]

---

## Product Principles

| Principle | Description |
|-----------|-------------|
| [principle] | [What this means for product decisions] |
| [principle] | [What this means for product decisions] |
| [principle] | [What this means for product decisions] |

<!-- TODO: Principles guide decision-making when requirements conflict -->
- Epics removed in v3. All work uses normal dependency graph with Depends on: / Blocks: body lines. Children are ordinary executable issues.

Use /plan /skill:draft-issue for new, /plan /skill:write-spec #N , /skill:execute .

---

<!-- TODO: MoSCOW ... helps write-spec scope -->

---
```

### Journey 2: [Secondary User Flow]

```
1. [Step]
2. [Step]
3. [Step]
```

<!-- TODO: User journeys become the basis for BDD acceptance criteria -->

---

## Brand Voice

| Attribute | Do | Don't |
|-----------|-----|-------|
| [attribute] | [example] | [counter-example] |
| [attribute] | [example] | [counter-example] |

---

## Privacy Commitment

| Data | Usage | Shared |
|------|-------|--------|
| [data type] | [how used] | [with whom] |

---

## References

- Technical spec: `steering/tech.md`
- Code structure: `steering/structure.md`
```
