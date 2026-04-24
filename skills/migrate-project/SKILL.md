---
name: migrate-project
description: "[DEPRECATED — use /upgrade-project instead] This skill was renamed in nmg-sdlc 1.42.0. Invoking /migrate-project prints a deprecation notice pointing to /upgrade-project and exits. Will be removed in the next minor release."
disable-model-invocation: true
allowed-tools: Read
---

# Migrate Project (DEPRECATED)

> **This skill has been renamed to `/upgrade-project` as of nmg-sdlc 1.42.0.**
>
> The rename reflects the skill's primary job — bringing a project forward to match the current plugin contract, not just "migrating" isolated artifacts.
>
> **Run `/upgrade-project` instead.** It performs everything the old `/migrate-project` did, plus the new legacy-layout relocation (`.codex/steering/` → `steering/` and `.codex/specs/` → `specs/`) required by current Codex releases.
>
> This deprecation stub will be removed in the next minor release. Update any automation, documentation, or muscle memory to use `/upgrade-project`.

## What Changed

| Old | New |
|-----|-----|
| `/migrate-project` | `/upgrade-project` |
| `.codex/migration-exclusions.json` | `.codex/upgrade-exclusions.json` (auto-migrated on first `/upgrade-project` run) |
| Analyzed `.codex/steering/` and `.codex/specs/` | Analyzes `steering/` and `specs/` at the project root; relocates legacy `.codex/{steering,specs}` in Step 1.5 |

## Action

Stop here. Print the notice above to the user. Do not attempt to perform any upgrade work from this stub — direct the user to `/upgrade-project` and exit.
