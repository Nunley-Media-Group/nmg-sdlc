# nmg-plugins Code Structure Steering

This document defines code organization, naming conventions, and patterns.
All code should follow these guidelines for consistency.

---

## Project Layout

```
nmg-plugins/
├── .claude-plugin/
│   └── marketplace.json          # Plugin registry (name, version, source path)
├── .claude/
│   ├── settings.local.json       # Local permission settings
│   ├── skills/
│   │   └── installing-locally/   # Repo-level utility skill
│   ├── unattended-mode           # Runtime flag (created by SDLC runner when in auto mode)
│   └── sdlc-state.json           # Runtime state (SDLC runner only)
├── steering/                     # Project steering documents (product.md, tech.md, structure.md, retrospective.md)
├── specs/                        # BDD spec output (feature-*/ and bug-*/ directories)
├── plugins/
│   └── nmg-sdlc/                 # The main plugin
│       ├── .claude-plugin/
│       │   └── plugin.json       # Plugin manifest (name, version, description)
│       ├── references/           # Plugin-shared references (loaded on demand)
│       │   ├── legacy-layout-gate.md
│       │   ├── unattended-mode.md
│       │   ├── feature-naming.md
│       │   ├── versioning.md
│       │   ├── steering-schema.md
│       │   └── spec-frontmatter.md
│       ├── skills/               # Skill definitions (one dir per skill)
│       │   ├── draft-issue/
│       │   │   └── references/   # Per-skill on-demand content (multi-issue, design-url, templates, etc.)
│       │   ├── open-pr/
│       │   │   └── references/   # version-bump, pr-body, ci-monitoring
│       │   ├── init-config/
│       │   ├── write-code/
│       │   │   └── references/   # plan-mode, resumption
│       │   ├── run-retro/
│       │   │   ├── references/   # learning-extraction, transferability, edge-cases
│       │   │   └── templates/    # Retrospective output template
│       │   ├── onboard-project/
│       │   │   ├── references/   # greenfield, brownfield, interview
│       │   │   └── templates/    # Steering document templates
│       │   ├── start-issue/
│       │   │   └── references/   # dirty-tree, milestone-selection, project-status
│       │   ├── verify-code/
│       │   │   ├── references/   # exercise-testing, autofix-loop, defect-path, verification-gates, report-format
│       │   │   └── checklists/   # Architecture review checklists
│       │   └── write-spec/
│       │       ├── references/   # discovery, amendment-mode, defect-variant, review-gates
│       │       └── templates/    # Spec document templates
│       └── agents/
│           └── architecture-reviewer.md  # Subagent for verification
├── scripts/                      # SDLC runner and tests
│   ├── sdlc-runner.mjs           # Deterministic SDLC orchestrator
│   ├── sdlc-config.example.json  # Config template
│   └── __tests__/                # Runner unit tests (Jest)
├── CLAUDE.md                     # Project instructions for Claude Code
├── CHANGELOG.md                  # Versioned changelog with [Unreleased] section
├── README.md                     # Public documentation
└── LICENSE                       # MIT License
```

---

## Layer Architecture

### Content Flow

```
Plugin Marketplace (.claude-plugin/marketplace.json)
    ↓ (indexes)
Plugin Package (plugins/nmg-sdlc/)
    ↓ (contains)
┌─────────────────────────────────┐
│  Skills (SKILL.md)              │ ← Trigger + workflow skeleton, prompt-based
└────────┬────────────────────────┘
         ↓ (on-demand pointer)
┌─────────────────────────────────┐
│  Plugin-shared references       │ ← Cross-skill rules (legacy-layout-gate, unattended-mode, etc.)
│  (plugins/nmg-sdlc/references/) │
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
│  Agents (*.md)                  │ ← Specialized subagents (architecture review)
└─────────────────────────────────┘

SDLC Runner (scripts/) — automation layer
    ↓ (drives)
Claude Code sessions via `claude -p`
```

### Layer Responsibilities

| Layer | Does | Doesn't Do |
|-------|------|------------|
| Marketplace index | Registers plugins, tracks versions | Contain plugin logic |
| Plugin manifest | Declares plugin identity and metadata | Define workflows |
| Skills | Define SDLC workflow trigger + skeleton, prompt Claude | Inline full variant branches, exhaustive examples, cross-skill duplication |
| Plugin-shared references | Consolidate rules repeated across ≥ 2 skills (legacy-layout-gate, unattended-mode, feature-naming, versioning, steering-schema, spec-frontmatter); loaded on demand via pointer | Hold skill-specific workflow steps |
| Per-skill references | Hold variant branches, extended examples, rarely-fired paths for a single skill; loaded on demand via pointer | Hold content other skills consume (that lives in plugin-shared references) |
| Templates | Provide output structure for generated documents | Contain logic or conditionals |
| Agents | Perform specialized analysis (architecture review) | Spawn subagents or use Task tool |
| Runner scripts | Orchestrate `claude -p` sessions deterministically | Contain SDLC logic (that lives in skills) |

---

## Naming Conventions

### Directories

| Element | Convention | Example |
|---------|------------|---------|
| Skill directories | kebab-case | `write-spec/`, `draft-issue/` |
| Template directories | `templates/` inside skill dir | `write-spec/templates/` |
| Checklist directories | `checklists/` inside skill dir | `verify-code/checklists/` |
| Reference directories | `references/` — plugin-shared at `plugins/nmg-sdlc/references/`, per-skill at `skills/{name}/references/` | `plugins/nmg-sdlc/references/`, `skills/start-issue/references/` |
| Agent files | kebab-case `.md` | `architecture-reviewer.md` |

### Files

| Element | Convention | Example |
|---------|------------|---------|
| Skill definitions | `SKILL.md` (uppercase) | `write-spec/SKILL.md` |
| Templates | kebab-case `.md` or `.gherkin` | `requirements.md`, `feature.gherkin` |
| Plugin manifests | `plugin.json` or `marketplace.json` | `.claude-plugin/plugin.json` |
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
| Marketplace collection version | Semver (independent of plugins) | `1.0.0` |

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
[Instructions for Claude]

### Step N: [Action]
[Instructions for Claude]

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

These are hard contracts that must never be violated. `/verify-code` should flag any change that breaks one.

### Skill Contracts

| Invariant | Rationale | How to Verify |
|-----------|-----------|---------------|
| Skill-bundled files must be authored via `/skill-creator` | Anthropic's official best practices for frontmatter, triggering, and structure are enforced by the skill-creator skill; hand-authored skill-bundled files drift. The bundle includes `SKILL.md`, every file inside the skill directory (`references/`, `scripts/`, `templates/`, `checklists/`, `assets/`), shared `references/*.md` at the plugin/repo root, and per-skill subagent definitions under `agents/*.md` | Any new/modified file in the skill bundle must be produced through `/skill-creator` — flag direct edits in PR review. There is no hand-edit fallback when `/skill-creator` is unavailable; the workflow escalates and exits instead |
| Skills must be stack-agnostic | Skills work across any project; project specifics live in steering docs | Grep skill content for hardcoded language/framework/tool names that aren't Claude Code tools |
| One skill = one SDLC step | Each skill has a single, well-defined purpose in the pipeline | A skill's postconditions must be the preconditions of exactly one downstream skill |
| Skills must reference steering docs for project context | Decouples workflow logic from project specifics | Skills say "reference `tech.md` for..." rather than embedding conventions directly |
| Unattended-mode must be opt-in | Manual mode is the default; automation requires `.claude/unattended-mode` | Every `AskUserQuestion` call must be guarded by unattended-mode check |
| Skill output feeds the next skill | The pipeline is a chain; each skill's output format is a contract | Verify output templates match the input expectations of downstream skills |

### Agent Contracts

| Invariant | Rationale | How to Verify |
|-----------|-----------|---------------|
| Agents must not spawn subagents | `Task` tool is not available to agents | Agent `.md` files must not instruct use of `Task` tool |
| Agents use only declared tools | Least-privilege access | `tools` frontmatter lists only what's needed (Read, Glob, Grep) |
| Agent output is structured | Parent skill must be able to parse agent results | Output section defines a predictable format |

### Version and Release Contracts

| Invariant | Rationale | How to Verify |
|-----------|-----------|---------------|
| Version bumps update both files | Marketplace reads `marketplace.json`, not `plugin.json` | `plugin.json` version == matching entry in `marketplace.json` `plugins` array |
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
| Updating only plugin.json version | Marketplace index becomes stale | Always update BOTH plugin.json and marketplace.json |
| Adding npm dependencies to scripts | Breaks zero-dependency portability | Use only Node.js built-in modules |
| Nesting subagents in architecture-reviewer | Task tool not available to agents | Use Read/Glob/Grep directly |
| Skipping [Unreleased] in CHANGELOG | Version history becomes inconsistent | Always add entries under [Unreleased] first |
| Hardcoding project-specific details in skills | Breaks stack-agnostic principle | Put specifics in steering docs, not skill definitions |
| Using platform-specific paths or commands | Breaks cross-platform compatibility | Use `node:path` for paths, POSIX-compatible shell syntax |
| Relying on symlinks for core functionality | Fails on Windows without elevated privileges | Use file copies or config-based indirection |
| Hardcoding path separators (`/` or `\`) | Breaks on other operating systems | Use `path.join()` or `path.resolve()` in scripts |

---

## References

- CLAUDE.md for project overview
- `steering/product.md` for product direction
- `steering/tech.md` for technical standards
