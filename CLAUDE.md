# CLAUDE.md

## Project Overview

The `nmg-sdlc` Claude Code plugin — a stack-agnostic BDD spec-driven development toolkit. Distributed through the [nmg-plugins marketplace](https://github.com/Nunley-Media-Group/nmg-plugins), installed by Claude Code users via `/plugin install nmg-sdlc@nmg-plugins`.

## Repository Structure

```
.claude-plugin/plugin.json       — Plugin manifest (name, version, description, author, repository)
skills/                          — Skill definitions (one directory per skill)
agents/                          — Subagent definitions (architecture-reviewer, spec-implementer)
references/                      — Shared reference files used across skills
scripts/                         — SDLC runner, skill-inventory audit, exercise runners, tests
specs/                           — BDD specs for the plugin's own development cycle
steering/                        — Product/tech/structure steering docs for this plugin
VERSION                          — Plugin version (kept in sync with plugin.json)
CHANGELOG.md                     — Keep an [Unreleased] section for pending changes
README.md                        — Public docs: workflow, installation, skills reference
.github/workflows/               — CI: claude-review, skill-inventory-audit
```

## Version Bumping

When bumping the plugin version, update BOTH:
1. `.claude-plugin/plugin.json` → `"version"`
2. The plugin entry in the marketplace repo's `.claude-plugin/marketplace.json` → plugin `"version"` (in `Nunley-Media-Group/nmg-plugins`)

The two versions must stay in sync for Claude Code's plugin system to behave correctly.

## README Updates

When making changes that affect how users interact with the plugin (new skills, changed workflows, new steering documents, etc.), update `README.md` accordingly. The README is the primary public documentation — it must stay in sync with actual capabilities.

## Commit & CHANGELOG Conventions

- Conventional commits: `feat:`, `fix:`, `docs:`, `chore:`
- `CHANGELOG.md` uses `[Unreleased]` for pending changes; `/open-pr` rolls it to a versioned heading at release
- Skills live in `skills/{skill-name}/SKILL.md`
- All skills include an "Integration with SDLC Workflow" section
- `specs/` files must be committed with their feature branches (not left as untracked local files)
