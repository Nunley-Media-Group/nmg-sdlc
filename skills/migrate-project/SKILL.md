---
name: migrate-project
description: "[DEPRECATED — use $nmg-sdlc:upgrade-project instead] This skill was renamed in nmg-sdlc 1.42.0. Invoking $nmg-sdlc:migrate-project prints a deprecation notice pointing to $nmg-sdlc:upgrade-project and exits. Will be removed in the next minor release."
---

# Migrate Project (DEPRECATED)

Read `../../references/codex-tooling.md` when the workflow starts — it maps legacy tool wording to Codex-native file inspection, shell, editing, web, interactive-gate, and subagent behavior.

Read `../../references/interactive-gates.md` when the workflow reaches any manual-mode user decision, menu, review gate, or clarification prompt — Codex renders these as conversational numbered prompts and waits for the next user reply.

> **This skill has been renamed to `$nmg-sdlc:upgrade-project` as of nmg-sdlc 1.42.0.**
>
> The rename reflects the skill's primary job — bringing a project forward to match the current plugin contract, not just "migrating" isolated artifacts.
>
> **Run `$nmg-sdlc:upgrade-project` instead.** It performs everything the old `$nmg-sdlc:migrate-project` did, plus the new legacy-layout relocation (`.codex/steering/` → `steering/` and `.codex/specs/` → `specs/`) required by current Codex releases.
>
> This deprecation stub will be removed in the next minor release. Update any automation, documentation, or muscle memory to use `$nmg-sdlc:upgrade-project`.

## What Changed

| Old | New |
|-----|-----|
| `$nmg-sdlc:migrate-project` | `$nmg-sdlc:upgrade-project` |
| `.codex/migration-exclusions.json` | `.codex/upgrade-exclusions.json` (auto-migrated on first `$nmg-sdlc:upgrade-project` run) |
| Analyzed `.codex/steering/` and `.codex/specs/` | Analyzes `steering/` and `specs/` at the project root; relocates legacy `.codex/{steering,specs}` in Step 1.5 |

## Action

Stop here. Print the notice above to the user. Do not attempt to perform any upgrade work from this stub — direct the user to `$nmg-sdlc:upgrade-project` and exit.
