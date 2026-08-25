# nmg-sdlc Code Structure Steering

This document defines repository organization, naming conventions, and architectural boundaries.

---

## Project Layout

```text
nmg-sdlc/
├── package.json                  # OMP plugin manifest (version + omp.extensions)
├── src/extension.ts              # Extension factory
├── .github/
│   ├── ISSUE_TEMPLATE/           # Canonical managed issue form
│   └── workflows/                # Repository CI
├── agents/                       # OMP task agents
├── references/                   # Cross-workflow contracts loaded on demand
├── workflows/                    # Private workflow files including execute/
├── scripts/                      # Contract validators, exercises, status CLI, and Jest tests
├── specs/                        # specs/{N}-{slug}/
├── steering/
├── AGENTS.md
├── CHANGELOG.md
├── README.md
├── VERSION
└── LICENSE
```

---

## Layer Architecture

```text
package.json + src/extension.ts
        │ declares OMP identity and /sdlc-* commands
        ▼
workflows/*/WORKFLOW.md
        │ points on demand
        ├──────────────► references/*.md
        ├──────────────► workflows/*/references/*.md
        ├──────────────► workflows/*/templates/*
        └──────────────► agents/*.md (installable OMP agents)

scripts/
        ├── validates active plugin contracts
        ├── classifies execute / upgrade / status
        ├── runs deterministic exercise fixtures
        └── reports read-only lifecycle status
```

### Layer Responsibilities

| Layer | Does | Does Not Do |
|-------|------|-------------|
| Plugin manifest | Declares identity, version, and `omp.extensions` | Define workflow logic |
| Extension factory | Registers `/sdlc-*` commands, dispatches to plan/skill workers, appends run entries | Interview users or spawn Herdr workers |
| Workflow entrypoints | Define triggers and concise workflow skeletons | Inline all variants or duplicate shared contracts |
| Shared references | Hold rules consumed by two or more workflows | Hold one-workflow-only details |
| Per-workflow references | Hold variants, algorithms, and extended examples for one workflow | Become public command entrypoints |
| Templates | Define generated artifact structure | Contain mutable project state |
| Agents | Define installable OMP worker contracts | Bypass the Herdr isolation boundary for pipeline steps |
| Scripts | Validate, classify, or inspect contracts deterministically | Own lifecycle decisions that belong in workflows |
| Specs | Record approved requirements/design/tasks and historical behavior | Serve as active plugin loader content |
| Steering | Define stable product and engineering decisions | Replace feature-specific specs |

---

## Naming Conventions

### Directories

| Element | Convention | Example |
|---------|------------|---------|
| Skill directories | kebab-case | `write-spec/` |
| Skill support | `references/`, `templates/`, `checklists/`, `scripts/`, `assets/` | `verify-code/checklists/` |
| Specs | `specs/{N}-{slug}/` | `specs/71-add-dark-mode-toggle/` |

New writes never create `feature-`, `bug-`, or `epic-` prefixes. Variant is the issue label plus heading (`# Requirements:` vs `# Defect Report:`). Legacy prefixed directories are `upgrade-project` inputs only.

### Files

| Element | Convention | Example |
|---------|------------|---------|
| Workflow entrypoint | Uppercase `WORKFLOW.md` | `workflows/write-code/WORKFLOW.md` |
| Markdown/reference files | kebab-case | `interactive-gates.md` |
| Scripts | kebab-case `.mjs` or `.sh` | `verify-plugin-surface.mjs` |
| JSON metadata | kebab-case where file naming is ours | `skill-inventory.baseline.json` |
| Executable spec artifacts | Fixed names | `requirements.md`, `design.md`, `tasks.md`, `feature.gherkin` |

`issue-scope.json`, `epic-scope.json`, and `epic-link.json` are not current types. Upgrade may read leftover files as legacy detectors.

### Commits and Versions

| Element | Convention | Example |
|---------|------------|---------|
| Commit subjects | Conventional commits | `feat:`, `fix:`, `docs:`, `chore:` |
| Version | Semver | `3.0.0` |
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
2. Interview inside /plan or write a worker handoff.
3. Apply the approved scope.
4. Verify postconditions.

```

Skill frontmatter contains only `name` and `description`. Detailed content belongs in on-demand references so entrypoints remain under 500 lines and context-efficient.

### Agent File

Agent files are installable OMP task agents. Required frontmatter: `name` and `description`. Optional: `model`, `tools`. Bodies follow the inlined workflow for `#N`, forbid `ask`, write the handoff file, print `NMG_SDLC_HANDOFF: .omp/sdlc/handoffs/<N>-<step>.json`, and stop.

### Plugin Manifest

```json
{
  "name": "nmg-sdlc",
  "version": "3.0.0",
  "omp": {
    "extensions": ["./src/extension.ts"]
  }
}
```

The example version is illustrative. `VERSION` and the live `package.json` version must remain synchronized by the delivery workflow.

---

## Architectural Boundaries

### Workflow-Authoring Boundary

Every file under `workflows/{name}/`, every shared `references/*.md`, and every `agents/*.md` is workflow-bundled. Worker creation or modification must first resolve and read `skill://skill-creator`, then follow its editing procedure. A repository-local `skills/` directory is not required. The v3 landing of this repository edits files directly.

### Interactive-Gate Boundary

Interactive `/sdlc-*` commands enter `/plan` in src/extension.ts (workflow files never tell the user to type `/plan` or a legacy skill trigger). They use built-in `ask` inside native `/plan` and finish at `xd://propose`. Automated skills never call `ask`.

### Spec Context Boundary

Project-root `specs/` is canonical. The active spec is `specs/{N}-{slug}/`. Load that directory first, then neighbors named by `**Related Spec**` and bounded metadata only. There are no ownership manifests. Historical specs remain intact and are excluded from active plugin-surface claims.

### Managed-Artifact Boundary

- Marked contribution workflows may be created or refreshed only per `references/contribution-gate.md`.
- The exact managed issue-form path may be reconciled per `references/issue-form.md`.
- Root `AGENTS.md` and contribution guidance preserve project-authored content outside their managed sections.
- Upgrade cleanup uses exact owned paths and recognized ignore blocks; ambiguous content is preserved.

### Git and GitHub Boundary

Only the skill that owns a stage performs that mutation. Implementation does not imply delivery, and local test success does not imply GitHub mergeability. Invoking `/sdlc-execute` enters automated delivery: PR creation is intermediate, and success requires exact-head merge plus issue closure. Backlog repair remains a separate, explicitly approved `/sdlc-upgrade-project` mutation.

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
| New public workflow | `workflows/{name}/WORKFLOW.md` | Add inventory, documentation, and tests |
| Shared rule | `references/{name}.md` | Must have at least two consumers |
| One-workflow detail | `workflows/{name}/references/` | Load only at the triggering branch |
| Generated structure | `workflows/{name}/templates/` | Keep placeholders explicit and stack-agnostic |
| Deterministic validation | `scripts/*.mjs` plus Jest coverage | Stable exit codes and diagnostics |
| Installable worker | `agents/*.md` | OMP task agent with handoff contract |

---

## References

- Product direction: `steering/snippets/project-product.md`
- Technical standards: `steering/snippets/project-tech.md`
- Public workflow: `README.md`
