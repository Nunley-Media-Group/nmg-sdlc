# nmg-sdlc Code Structure Steering

This document defines repository organization, naming conventions, and architectural boundaries.

---

## Project Layout

```text
nmg-sdlc/
├── .codex-plugin/
│   └── plugin.json               # Codex plugin manifest
├── .github/
│   ├── ISSUE_TEMPLATE/           # Canonical managed issue form
│   └── workflows/                # Repository CI
├── agents/                       # Reusable prompt contracts for optional delegation
├── references/                   # Cross-skill contracts loaded on demand
│   ├── codex-tooling.md
│   ├── interactive-gates.md
│   ├── legacy-layout-gate.md
│   ├── spec-context.md
│   ├── epic-relationships.md
│   ├── epic-spec-authority.md
│   ├── versioning.md
│   ├── contribution-gate.md
│   └── issue-form.md
├── skills/                       # One directory per public or compatibility skill
│   ├── onboard-project/
│   ├── draft-issue/
│   ├── start-issue/
│   ├── write-spec/
│   ├── write-code/
│   ├── simplify/
│   ├── verify-code/
│   ├── open-pr/
│   ├── address-pr-comments/
│   ├── status/
│   ├── upgrade-project/
│   └── run-retro/
├── scripts/                      # Contract validators, exercises, status CLI, and Jest tests
│   ├── __fixtures__/
│   ├── __tests__/
│   ├── sdlc-status.mjs
│   ├── epic-spec-authority.mjs
│   ├── epic-lifecycle-repair.mjs
│   ├── pr-delivery-state.mjs
│   ├── skill-exercise-runner.mjs
│   ├── skill-inventory-audit.mjs
│   └── verify-plugin-surface.mjs
├── specs/                        # Canonical BDD archive
├── steering/                     # Product, technical, structure, and retrospective guidance
├── AGENTS.md                     # Repository instructions for Codex
├── CHANGELOG.md                  # Versioned changelog with [Unreleased]
├── README.md                     # Public documentation
├── VERSION                       # Plugin version source
└── LICENSE
```

---

## Layer Architecture

```text
.codex-plugin/plugin.json
        │ declares plugin identity
        ▼
skills/*/SKILL.md
        │ points on demand
        ├──────────────► references/*.md
        ├──────────────► skills/*/references/*.md
        ├──────────────► skills/*/templates/*
        └──────────────► agents/*.md (only with user-authorized delegation)

scripts/
        ├── validates active plugin contracts
        ├── runs deterministic exercise fixtures
        └── reports read-only lifecycle status
```

### Layer Responsibilities

| Layer | Does | Does Not Do |
|-------|------|-------------|
| Plugin manifest | Declares identity, repository, version, and component paths | Define workflow logic |
| Skill entrypoints | Define triggers and concise workflow skeletons | Inline all variants or duplicate shared contracts |
| Shared references | Hold rules consumed by two or more skills | Hold one-skill-only details |
| Per-skill references | Hold variants, algorithms, and extended examples for one skill | Become public command entrypoints |
| Templates | Define generated artifact structure | Contain mutable project state |
| Agent prompts | Define structured optional delegation output | Act as installable custom agents or bypass user authorization |
| Scripts | Validate, exercise, or inspect contracts deterministically | Own lifecycle decisions that belong in skills |
| Specs | Record approved requirements/design/tasks and historical behavior | Serve as active plugin loader content |
| Steering | Define stable product and engineering decisions | Replace feature-specific specs |

---

## Naming Conventions

### Directories

| Element | Convention | Example |
|---------|------------|---------|
| Skill directories | kebab-case | `write-spec/` |
| Skill support | `references/`, `templates/`, `checklists/`, `scripts/`, `assets/` | `verify-code/checklists/` |
| Feature specs | `feature-{kebab-case-slug}` | `feature-dark-mode/` |
| Defect specs | `bug-{kebab-case-slug}` | `bug-login-timeout/` |
| Epic aggregates | `epic-{kebab-case-slug}` | `epic-offline-navigation/` |

### Files

| Element | Convention | Example |
|---------|------------|---------|
| Skill entrypoint | Uppercase `SKILL.md` | `skills/write-code/SKILL.md` |
| Markdown/reference files | kebab-case | `interactive-gates.md` |
| Scripts | kebab-case `.mjs` or `.sh` | `verify-plugin-surface.mjs` |
| JSON metadata | kebab-case where file naming is ours | `skill-inventory.baseline.json` |
| Executable spec artifacts | Fixed names | `requirements.md`, `design.md`, `tasks.md`, `feature.gherkin`, `issue-scope.json` |
| Epic aggregate artifacts | Fixed names | `requirements.md`, `design.md`, `epic-scope.json` |
| Epic child link | Fixed name in child package | `epic-link.json` |

### Commits and Versions

| Element | Convention | Example |
|---------|------------|---------|
| Commit subjects | Conventional commits | `feat:`, `fix:`, `docs:`, `chore:` |
| Version | Semver | `2.0.0` |
| Pending changelog | `## [Unreleased]` | One active section |

---

## File Templates

### Skill Definition

```markdown
---
name: skill-name
description: "What it does and when it triggers."
---

# Skill Name

Read `references/detail.md` when the detailed branch is reached.

## Workflow

1. Inspect preconditions.
2. Present any required user decision.
3. Apply the approved scope.
4. Verify postconditions.

## Integration with SDLC Workflow

Describe upstream and downstream contracts.
```

Skill frontmatter contains only `name` and `description`. Detailed content belongs in on-demand references so entrypoints remain under 500 lines and context-efficient.

### Agent Prompt Contract

Agent files use the same two-key frontmatter rule, define one bounded delegated responsibility, and return structured evidence. They are included in built-in Codex subagent prompts only after explicit user authorization.

### Plugin Manifest

```json
{
  "name": "nmg-sdlc",
  "version": "2.0.0",
  "description": "BDD spec-driven development toolkit",
  "repository": "https://github.com/Nunley-Media-Group/nmg-sdlc"
}
```

The example version is illustrative. `VERSION` and the live manifest version must remain synchronized by the delivery workflow.

---

## Architectural Boundaries

### Skill-Authoring Boundary

Every file under `skills/{skill}/`, every shared `references/*.md`, and every `agents/*.md` prompt contract is skill-bundled. Creation or modification must be driven through `$skill-creator`; there is no direct-edit fallback.

### Interactive-Gate Boundary

Decision points use `request_user_input` and wait indefinitely for explicit user input. No repository file changes this behavior, and no default is selected because the user has not answered.

### Spec Context Boundary

Project-root `specs/` is canonical. Load the active spec first, inspect bounded metadata across neighbors, then load only relevant specs. Historical specs remain intact and are excluded from active plugin-surface claims.

Epics are coordination-only and never receive a branch or executable spec. A `specs/epic-*` aggregate contains exactly cross-child outcomes, design/topology, and `epic-scope.json`; it has no `tasks.md`, `feature.gherkin`, or executable ownership. Every child uses a separate normal package whose `epic-link.json` agrees with the aggregate manifest. Lifecycle consumers execute and verify only the active child's `issue-scope.json` slice.

### Managed-Artifact Boundary

- Marked contribution workflows may be created or refreshed only per `references/contribution-gate.md`.
- The exact managed issue-form path may be reconciled per `references/issue-form.md`.
- Root `AGENTS.md` and contribution guidance preserve project-authored content outside their managed sections.
- Upgrade cleanup uses exact owned paths and recognized ignore blocks; ambiguous content is preserved.

### Git and GitHub Boundary

Only the skill that owns a stage performs that mutation. Implementation does not imply delivery, and local test success does not imply GitHub mergeability. Invoking `$nmg-sdlc:open-pr` enters the terminal delivery stage: PR creation is intermediate, and success requires exact-head merge plus executable-issue closure. That stage may explicitly close only eligible, fully revalidated epic ancestors after the child closes. Backlog repair remains a separate, per-epic, explicitly approved `$nmg-sdlc:upgrade-project` mutation.

---

## Cross-Platform Requirements

| Concern | Rule |
|---------|------|
| Paths in scripts | Use `node:path`; never assume `/` or `\` |
| User/repository values | Pass as argument-array elements, not shell source |
| Temporary directories | Use platform temporary-directory APIs |
| Text artifacts | UTF-8 with LF unless preserving an existing target's format |
| Destructive operations | Resolve exact targets first; never use unresolved broad roots |

---

## Extension Points

| Extension | Location | Contract |
|-----------|----------|----------|
| New public workflow | `skills/{name}/SKILL.md` | Add manifest/inventory/docs/tests and Integration section |
| Shared rule | `references/{name}.md` | Must have at least two consumers |
| One-skill detail | `skills/{name}/references/` | Load only at the triggering branch |
| Generated structure | `skills/{name}/templates/` | Keep placeholders explicit and stack-agnostic |
| Deterministic validation | `scripts/*.mjs` plus Jest coverage | Stable exit codes and diagnostics |
| Optional delegation | `agents/*.md` | User-authorized, bounded, structured output |

---

## References

- Product direction: `steering/product.md`
- Technical standards: `steering/tech.md`
- Public workflow: `README.md`
