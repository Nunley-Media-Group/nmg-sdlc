# nmg-sdlc Code Structure Steering

This document defines repository organization, naming conventions, and architectural boundaries.

---

## Project Layout

```text
nmg-sdlc/
├── .claude-plugin/
│   └── plugin.json               # Claude Code plugin manifest (name + version)
├── hooks/
│   ├── hooks.json                # Declares the hooks module
│   └── register.ts               # Hooks module: interactive commands, plan mode, plugin root
├── commands/                     # Automated /sdlc-* command files (generated)
├── package.json                  # Node package metadata (version mirror)
├── tsconfig.json                 # Type checking for hooks/register.ts
├── src/
│   ├── host-events.mjs           # Node-free helpers shared by the hooks module and Node
│   ├── sdlc-commands.mjs
│   ├── sdlc-prompt-snippets.mjs
│   ├── sdlc-steering-runtime.mjs
│   ├── sdlc-verification-runtime.mjs
│   └── sdlc-workflows.mjs
├── .github/
│   ├── ISSUE_TEMPLATE/           # Canonical managed issue form
│   └── workflows/                # Repository CI
├── agents/                       # Claude Code plugin subagents
├── references/                   # Cross-workflow contracts loaded on demand
├── workflows/                    # Private workflow files including execute/
├── scripts/                      # Contract validators, exercises, status CLI, and Jest tests
├── specs/                        # specs/{N}-{slug}/
├── steering/
│   ├── manifest.json             # Registration authority
│   ├── modules/                  # Plugin-managed descriptors
│   ├── snippets/                 # Project-owned prompt fragments
│   └── extensions/               # Project-owned validation providers
├── AGENTS.md
├── CHANGELOG.md
├── CONTRIBUTING.md
├── README.md
├── VERSION
└── LICENSE
```

`steering/retrospective.md` and `steering/retrospective-state.json` are project-owned `/sdlc-run-retro` artifacts. They are not manifest-registered runtime files.

---

## Layer Architecture

```text
.claude-plugin/plugin.json + hooks/register.ts + commands/*.md
        │ declares plugin identity and /sdlc-* commands
        ▼
src/host-events.mjs + src/sdlc-*.mjs
        │ shared runtime libraries used by scripts and the hooks module
        ▼
workflows/*/WORKFLOW.md
        │ points on demand
        ├──────────────► references/*.md
        ├──────────────► workflows/*/references/*.md
        ├──────────────► workflows/*/templates/*
        └──────────────► agents/*.md (plugin subagents)

scripts/
        ├── validates active plugin contracts
        ├── classifies execute / upgrade / status
        ├── runs deterministic exercise fixtures
        └── reports read-only lifecycle status
```

### Layer Responsibilities

| Layer | Does | Does Not Do |
|-------|------|-------------|
| Plugin manifest | Declares identity and version | Define workflow logic |
| Hooks module | Registers interactive `/sdlc-*` commands, enters native plan mode, materializes `<plugin-root>`, drives write-spec Continue/Finished and autopilot | Interview users, import Node built-ins, or spawn Herdr workers |
| Command files | Expand the four automated `/sdlc-*` commands into their workflows | Hold hand-edited logic; they are generated |
| Runtime libraries | Load steering, render prompts, run deterministic validations | Own lifecycle decisions that belong in workflows |
| Workflow entrypoints | Define triggers and concise workflow skeletons | Inline all variants or duplicate shared contracts |
| Shared references | Hold rules consumed by two or more workflows | Hold one-workflow-only details |
| Per-workflow references | Hold variants, algorithms, and extended examples for one workflow | Become public command entrypoints |
| Templates | Define generated artifact structure | Contain mutable project state |
| Agents | Define Claude Code plugin subagent contracts | Bypass the Herdr isolation boundary for pipeline steps |
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
| Version | Semver | `4.0.0` |
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
2. Interview inside plan mode or write a worker handoff.
3. Apply the approved scope.
4. Verify postconditions.

```

Skill frontmatter contains only `name` and `description`. Detailed content belongs in on-demand references so entrypoints remain under 500 lines and context-efficient.

### Agent File

Agent files are Claude Code plugin subagents (`nmg-sdlc:<name>`). Required frontmatter: `name` and `description`. Optional: `model` (`haiku`, `sonnet`, `opus`, or `inherit`), `tools`. Bodies follow the inlined workflow for `#N`, forbid `AskUserQuestion` and `ExitPlanMode`, write the handoff file, print `NMG_SDLC_HANDOFF: .nmg-sdlc/handoffs/<N>-<step>.json`, and stop.

### Plugin Manifest

```json
{
  "name": "nmg-sdlc",
  "version": "4.0.0",
  "description": "Spec-driven delivery for Claude Code and Herdr"
}
```

This is `.claude-plugin/plugin.json`; `hooks/hooks.json` is `{ "modules": ["./register.ts"] }`. The example version is illustrative. `VERSION`, the live `package.json` version, and the `.claude-plugin/plugin.json` version must remain synchronized by the delivery workflow.

---

## Architectural Boundaries

### Workflow-Authoring Boundary

Every file under `workflows/{name}/`, every shared `references/*.md`, and every `agents/*.md` is workflow-bundled. Worker creation or modification must first invoke the `skill-creator` skill with the `Skill` tool, then follow its editing procedure. A repository-local `skills/` directory is not required.

### Interactive-Gate Boundary

Interactive `/sdlc-*` commands enter native plan mode through the hooks module `hooks/register.ts` (workflow files never tell the user to type `/plan` or a legacy skill trigger). They interview with `AskUserQuestion` inside plan mode, write the plan to the plan-mode plan file, and finish with `ExitPlanMode`. Automated skills never call `AskUserQuestion` or `ExitPlanMode`.

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
| Project steering provider | `steering/extensions/*.mjs` | Frozen `extension` export; cannot change orchestration or safety contracts |
| Installable worker | `agents/*.md` | Claude Code plugin subagent with handoff contract |

---

## References

- Product direction: `steering/snippets/project-product.md`
- Technical standards: `steering/snippets/project-tech.md`
- Public workflow: `README.md`
