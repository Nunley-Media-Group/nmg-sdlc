# nmg-plugins Code Structure Steering

This document defines code organization, naming conventions, and patterns.
All code should follow these guidelines for consistency.

---

## Project Layout

```
nmg-sdlc/
├── .codex-plugin/
│   └── plugin.json               # Codex plugin manifest
├── .codex/
│   ├── settings.local.json       # Local permission settings
│   ├── unattended-mode           # Runtime flag (created by SDLC runner when in auto mode)
│   └── sdlc-state.json           # Runtime state (SDLC runner only)
├── steering/                     # Project steering documents (product.md, tech.md, structure.md, retrospective.md)
├── specs/                        # BDD spec output (feature-*/ and bug-*/ directories)
├── references/                   # Plugin-shared references (loaded on demand)
│   ├── legacy-layout-gate.md
│   ├── unattended-mode.md
│   ├── interactive-gates.md
│   ├── feature-naming.md
│   ├── versioning.md
│   ├── steering-schema.md
│   └── spec-frontmatter.md
├── skills/                       # Skill definitions (one dir per skill)
│   ├── draft-issue/
│   │   └── references/           # Per-skill on-demand content
│   ├── open-pr/
│   │   └── references/           # version-bump, pr-body, ci-monitoring
│   ├── init-config/
│   ├── write-code/
│   │   └── references/           # plan-mode, resumption
│   ├── run-retro/
│   │   ├── references/           # learning-extraction, transferability, edge-cases
│   │   └── templates/            # Retrospective output template
│   ├── onboard-project/
│   │   ├── references/           # greenfield, brownfield, interview
│   │   └── templates/            # Steering document templates
│   ├── start-issue/
│   │   └── references/           # dirty-tree, milestone-selection, project-status
│   ├── verify-code/
│   │   ├── references/           # exercise-testing, autofix-loop, defect-path, verification-gates, report-format
│   │   └── checklists/           # Architecture review checklists
│   └── write-spec/
│       ├── references/           # discovery, amendment-mode, defect-variant, review-gates
│       └── templates/            # Spec document templates
├── agents/
│   └── architecture-reviewer.md  # Prompt contract for optional verification delegation
├── scripts/                      # SDLC runner and tests
│   ├── sdlc-runner.mjs           # Deterministic SDLC orchestrator
│   ├── sdlc-config.example.json  # Config template
│   └── __tests__/                # Runner unit tests (Jest)
├── AGENTS.md                     # Project instructions for Codex
├── CHANGELOG.md                  # Versioned changelog with [Unreleased] section
├── README.md                     # Public documentation
└── LICENSE                       # MIT License
```

---

## Layer Architecture

### Content Flow

```
Codex Plugin Manifest (.codex-plugin/plugin.json)
    ↓ (declares)
Plugin Package (repo root)
    ↓ (contains)
┌─────────────────────────────────┐
│  Skills (SKILL.md)              │ ← Trigger + workflow skeleton, prompt-based
└────────┬────────────────────────┘
         ↓ (on-demand pointer)
┌─────────────────────────────────┐
│  Plugin-shared references       │ ← Cross-skill rules (legacy-layout-gate, unattended-mode, etc.)
│  (references/)                  │
└────────┬────────────────────────┘
         ↓ (on-demand pointer)
┌─────────────────────────────────┐
│  Per-skill references           │ ← Variant branches, extended examples, rarely-fired paths
│  (skills/*/references/)         │
└────────┬────────────────────────┘
         ↓ (reference)
┌─────────────────────────────────┐
│  Templates (*.md)               │ ← Output structure for specs and steering docs
└────────┬────────────────────────┘
         ↓ (used by)
┌─────────────────────────────────┐
│  Agents (*.md)                  │ ← Prompt contracts for optional Codex delegation
└─────────────────────────────────┘

SDLC Runner (scripts/) — automation layer
    ↓ (drives)
Codex sessions via `codex exec`
```

### Layer Responsibilities

| Layer | Does | Doesn't Do |
|-------|------|------------|
| Plugin manifest | Declares plugin identity, metadata, and component paths | Define workflows |
| Skills | Define SDLC workflow trigger + skeleton, prompt Codex | Inline full variant branches, exhaustive examples, cross-skill duplication |
| Plugin-shared references | Consolidate rules repeated across ≥ 2 skills (legacy-layout-gate, unattended-mode, interactive-gates, feature-naming, versioning, steering-schema, spec-frontmatter); loaded on demand via pointer | Hold skill-specific workflow steps |
| Per-skill references | Hold variant branches, extended examples, rarely-fired paths for a single skill; loaded on demand via pointer | Hold content other skills consume (that lives in plugin-shared references) |
| Templates | Provide output structure for generated documents | Contain logic or conditionals |
| Agents | Provide reusable prompt contracts for optional built-in Codex subagent delegation | Act as installable plugin components or require delegation for normal skill execution |
| Runner scripts | Orchestrate `codex exec` sessions deterministically | Contain SDLC logic (that lives in skills) |

---

## Naming Conventions

### Directories

| Element | Convention | Example |
|---------|------------|---------|
| Skill directories | kebab-case | `write-spec/`, `draft-issue/` |
| Template directories | `templates/` inside skill dir | `write-spec/templates/` |
| Checklist directories | `checklists/` inside skill dir | `verify-code/checklists/` |
| Reference directories | `references/` — plugin-shared at repo root, per-skill at `skills/{name}/references/` | `references/`, `skills/start-issue/references/` |
| Agent files | kebab-case `.md` | `architecture-reviewer.md` |

### Files

| Element | Convention | Example |
|---------|------------|---------|
| Skill definitions | `SKILL.md` (uppercase) | `write-spec/SKILL.md` |
| Templates | kebab-case `.md` or `.gherkin` | `requirements.md`, `feature.gherkin` |
| Plugin manifest | `.codex-plugin/plugin.json` | `.codex-plugin/plugin.json` |
| Scripts | kebab-case `.mjs` or `.sh` | `sdlc-runner.mjs` |
| Config files | kebab-case `.json` | `sdlc-config.example.json` |

### Spec Output

| Element | Convention | Example |
|---------|------------|---------|
| Feature spec directories | `feature-{kebab-case-slug}` | `feature-dark-mode/` |
| Bug spec directories | `bug-{kebab-case-slug}` | `bug-login-crash-on-timeout/` |
| Legacy spec directories | `{issue#}-{kebab-case-title}` (still supported) | `42-add-precipitation-overlay/` |
| Spec files | Fixed names | `requirements.md`, `design.md`, `tasks.md`, `feature.gherkin` |
| Location | `specs/{feature-name}/` | `specs/feature-dark-mode/` |

### Version Strings

| Element | Convention | Example |
|---------|------------|---------|
| Plugin version | Semver (major.minor.patch) | `1.18.0` |

### Commit Messages

| Element | Convention | Example |
|---------|------------|---------|
| Format | Conventional commits | `feat:`, `fix:`, `docs:`, `chore:` |
| Scope | Optional, kebab-case | `feat(write-spec): add defect template` |

---

## File Templates

### Skill Definition (SKILL.md)

```markdown
# [Skill Name]

[One-line description]

Read `../../references/{shared-name}.md` when {triggering-condition}.
Read `references/{per-skill-name}.md` when {triggering-condition}.

## Workflow
### Step 1: [Action]
[Instructions for Codex]

### Step N: [Action]
[Instructions for Codex]

## Integration with SDLC Workflow
[Where this skill fits in the pipeline]
```

**Reference pointer grammar** (mandatory for every SKILL.md → references pointer):

- Shape: `` Read `references/{name}.md` when {triggering-condition}. ``
- Shared references resolve via `` `../../references/{name}.md` `` (relative to the SKILL.md).
- Per-skill references resolve via `` `references/{name}.md` `` (also relative).
- The triggering condition always travels in the same sentence as the pointer — never delegated to surrounding prose — so the reader and the inventory audit can both see it.
- `when` is the only conjunction used (not "if", "on", "where") so pointers stay greppable.

### Plugin Manifest (plugin.json)

```json
{
  "name": "nmg-sdlc",
  "version": "X.Y.Z",
  "description": "...",
  "author": { "name": "Nunley Media Group" },
  "repository": "https://github.com/nunley-media-group/nmg-plugins"
}
```

---

## Import Order

### JavaScript (ESM — Runner scripts)

```javascript
// 1. Node.js built-in modules (with node: prefix)
import { spawn, execSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { parseArgs } from 'node:util';

// 2. No external dependencies (zero-dependency scripts)
```

---

## Design Tokens / UI Standards (if applicable)

<!-- Pre-fill if design token files are found -->

| Token | Value | Usage |
|-------|-------|-------|
| [token] | [value] | [when to use] |

---

## Architectural Invariants

These are hard contracts that must never be violated. `$nmg-sdlc:verify-code` should flag any change that breaks one.

### Skill Contracts

| Invariant | Rationale | How to Verify |
|-----------|-----------|---------------|
| Skill-bundled files must be authored via `$skill-creator` | Codex plugin best practices for frontmatter, triggering, and structure are enforced by the skill-creator skill; hand-authored skill-bundled files drift. The bundle includes `SKILL.md`, every file inside the skill directory (`references/`, `scripts/`, `templates/`, `checklists/`, `assets/`), shared `references/*.md` at the plugin/repo root, and prompt contracts under `agents/*.md` | Any new/modified file in the skill bundle must be produced through `$skill-creator` — flag direct edits in PR review. There is no hand-edit fallback when `$skill-creator` is unavailable; the workflow escalates and exits instead |
| Skills must be stack-agnostic | Skills work across any project; project specifics live in steering docs | text search skill content for hardcoded language/framework/tool names that aren't Codex tools |
| One skill = one SDLC step | Each skill has a single, well-defined purpose in the pipeline | A skill's postconditions must be the preconditions of exactly one downstream skill |
| Skills must reference steering docs for project context | Decouples workflow logic from project specifics | Skills say "reference `tech.md` for..." rather than embedding conventions directly |
| Unattended-mode must be opt-in | Manual mode is the default; automation requires `.codex/unattended-mode` | Every Codex interactive gate must be guarded by an unattended-mode branch |
| Skill output feeds the next skill | The pipeline is a chain; each skill's output format is a contract | Verify output templates match the input expectations of downstream skills |

### Agent Contracts

| Invariant | Rationale | How to Verify |
|-----------|-----------|---------------|
| Agents must not spawn subagents | Codex subagents should not recursively delegate unless explicitly designed for it | Agent `.md` files must not instruct nested subagent spawning |
| Agents are prompt contracts | Codex plugins do not currently declare custom agents as plugin components; these Markdown files are reusable prompts consumed by skills when they spawn built-in Codex subagents | Agent `.md` files must not contain Codex-only frontmatter such as `tools` |
| Agent output is structured | Parent skill must be able to parse agent results | Output section defines a predictable format |

### Version and Release Contracts

| Invariant | Rationale | How to Verify |
|-----------|-----------|---------------|
| Version bumps update the Codex manifest | Codex reads `.codex-plugin/plugin.json` for plugin metadata | `.codex-plugin/plugin.json` version matches `VERSION` |
| CHANGELOG has `[Unreleased]` section | Pending changes accumulate before release | `CHANGELOG.md` contains `## [Unreleased]` heading |
| Templates are declarative | Templates define structure, not logic | No conditionals, loops, or executable code in template `.md` files |

### Cross-Platform Contracts

| Invariant | Rationale | How to Verify |
|-----------|-----------|---------------|
| No hardcoded path separators in scripts | macOS/Linux use `/`, Windows uses `\` | Scripts use `node:path` or `path.join()`; shell scripts use POSIX syntax |
| No symlink dependencies | Windows requires elevated privileges for symlinks | Core functionality works without symlinks |
| POSIX-compatible shell commands in skills | Skills run on any OS | No Bash-specific syntax (`[[ ]]`, `<<<`, associative arrays) |

---

## Test Project Scaffolding

When verifying skill changes, a disposable test project is used as the exercise target. The test project is NOT committed to the repo — it is created on-the-fly during verification.

### Minimal Test Project Layout

```
/tmp/nmg-sdlc-test-{timestamp}/
├── steering/
│   ├── product.md         — Minimal: project name, one user persona
│   ├── tech.md            — Minimal: one language, one test framework
│   └── structure.md       — Minimal: flat src/ + tests/ layout
├── src/
│   └── index.js           — Trivial source file (or equivalent for target language)
├── README.md              — One-line description
├── .gitignore
└── package.json           — (or equivalent project manifest)
```

The test project should be:
- **Minimal** — just enough to exercise the skill under test
- **Disposable** — created in `/tmp/` or OS-equivalent temp dir, deleted after verification
- **Language-appropriate** — match whatever the skill's test scenario requires
- **Git-initialized** — `git init` + initial commit so branch operations work

For skills that need GitHub resources (issues, PRs), either use a dedicated test repo or use dry-run evaluation (see `tech.md` → Dry-Run Evaluation).

---

## Anti-Patterns to Avoid

| Anti-Pattern | Problem | Solution |
|--------------|---------|----------|
| Updating only stack-specific versions | Codex manifest becomes stale | Always update `VERSION`, `CHANGELOG.md`, `.codex-plugin/plugin.json`, and any declared stack-specific files |
| Adding npm dependencies to scripts | Breaks zero-dependency portability | Use only Node.js built-in modules |
| Nesting subagents in architecture-reviewer | Recursive delegation increases cost and unpredictability | Use local file inspection and search directly |
| Skipping [Unreleased] in CHANGELOG | Version history becomes inconsistent | Always add entries under [Unreleased] first |
| Hardcoding project-specific details in skills | Breaks stack-agnostic principle | Put specifics in steering docs, not skill definitions |
| Using platform-specific paths or commands | Breaks cross-platform compatibility | Use `node:path` for paths, POSIX-compatible shell syntax |
| Relying on symlinks for core functionality | Fails on Windows without elevated privileges | Use file copies or config-based indirection |
| Hardcoding path separators (`/` or `\`) | Breaks on other operating systems | Use `path.join()` or `path.resolve()` in scripts |

---

## References

- AGENTS.md for project overview
- `steering/product.md` for product direction
- `steering/tech.md` for technical standards
