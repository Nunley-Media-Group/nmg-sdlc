# AGENTS.md

## Project Overview

The `nmg-sdlc` Codex plugin is a stack-agnostic BDD spec-driven development toolkit. It is packaged with a Codex manifest at `.codex-plugin/plugin.json`.

## Repository Structure

```
.codex-plugin/plugin.json        — Codex plugin manifest
skills/                          — Skill definitions (one directory per skill)
agents/                          — Subagent definitions (architecture-reviewer, spec-implementer)
references/                      — Shared reference files used across skills
scripts/                         — SDLC runner, skill-inventory audit, exercise runners, tests
specs/                           — BDD specs for the plugin's own development cycle
steering/                        — Product/tech/structure steering docs for this plugin
docs/decisions/                  — ADR directory (created on first spike; gap-analysis ADRs committed here by /write-spec Phase 0)
VERSION                          — Plugin version (kept in sync with the Codex manifest)
CHANGELOG.md                     — Keep an [Unreleased] section for pending changes
README.md                        — Public docs: workflow, installation, skills reference
.github/workflows/               — CI: skill-inventory-audit
```

## Version Bumping

When bumping the plugin version, update `.codex-plugin/plugin.json` -> `"version"` (the `/open-pr` skill also keeps `VERSION` and `CHANGELOG.md` in sync).

## README Updates

When making changes that affect how users interact with the plugin (new skills, changed workflows, new steering documents, etc.), update `README.md` accordingly. The README is the primary public documentation and must stay in sync with actual capabilities.

## Commit & CHANGELOG Conventions

- Conventional commits: `feat:`, `fix:`, `docs:`, `chore:`
- `CHANGELOG.md` uses `[Unreleased]` for pending changes; `/open-pr` rolls it to a versioned heading at release
- Skills live in `skills/{skill-name}/SKILL.md`
- All skills include an "Integration with SDLC Workflow" section
- `specs/` files must be committed with their feature branches, not left as untracked local files

<!-- nmg-sdlc-managed: spec-context -->
## nmg-sdlc Spec Context

For SDLC work, project-root `specs/` is the canonical BDD archive. Always identify the active spec first, then use bounded relevant-spec discovery to load only the neighboring specs that can affect the change. Do not load the full archive by default, and do not use legacy `.codex/specs/` as context.
<!-- /nmg-sdlc-managed -->
