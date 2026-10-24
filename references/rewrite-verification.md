# nmg-sdlc 4.0 Rewrite Verification

**Release**: 4.0.0
**Runtime**: Claude Code
**Exception**: `repository-rewrite`

## Decision

Version 4.0.0 moves nmg-sdlc from an Oh My Pi extension to a Claude Code plugin. This is the second repository rewrite, following the 3.1.0 precedent. The host change touches every public surface at once and has no single GitHub issue owner, so the PR uses the narrow repository-rewrite predicate of the contribution gate. That predicate waives only current PR issue/spec identity. The breaking `feat!:` title, required contract paths, rewrite contract, durable verification, steering, changed-path mapping, specific verification, and managed guide remain required.

The cutover keeps every 3.x capability; only host mechanics change:

| 3.x (Oh My Pi) | 4.0 (Claude Code) |
|----------------|-------------------|
| `omp.extensions` manifest and `src/extension.ts` | `.claude-plugin/plugin.json` and the hooks module `hooks/register.ts` |
| TUI `input` rewrite to `/plan` plus the workflow | hooks-module command handler: builtin `/plan`, then the workflow as the person's prompt |
| built-in `ask` | `AskUserQuestion` (2–4 options, ` (Recommended)` first, automatic Other) |
| `xd://propose` and `local://*-plan.md` | the plan-mode plan file headed `# <slug>: <title>`, then `ExitPlanMode` |
| `/plan` toggle after write-spec Finished | the Finished reply ends with `ExitPlanMode`, which the hooks module approves |
| Herdr `omp` worker panes | Herdr Claude workers (`--kind claude --plugin-dir <plugin-root>`) |
| `.omp/sdlc/` runtime state | `.nmg-sdlc/` runtime state; `/sdlc-upgrade-project` migrates legacy state |
| OMP pane screen reading for hands-off drivers | `NMG_SDLC_AUTOPILOT=1` in the hooks module |
| `scripts/exercise-omp.mjs` (print/RPC) | `scripts/exercise-claude.mjs` (`claude -p --plugin-dir`, stream-json) |

## Git provenance

The 3.1 rewrite (commit `3414fe7`, "Rewrote nmg-sdlc as an OMP extension and Herdr workflow") and its 3.1 verification record remain in Git history. The 4.0 cutover lands on branch `feat/v4-claude-code-plugin` on top of `b162f48`. Full predecessor specifications and removed implementation remain recoverable through Git history. The working tree keeps only BDD contracts that have genuine issue owners.

## Current contract coverage

`references/rewrite-contract.json` lists 16 current capabilities. `references/rewrite-contract.md` gives each one's purpose, source paths, verification paths, and acceptance behavior in readable form. `scripts/verify-current-specs.mjs` proves:

- every retained spec directory has a genuine owner, with matching singular `**Issue**: #N` identity and Approved requirements;
- no obsolete or mismatched spec directory remains;
- all 16 rewrite capabilities have source and acceptance coverage;
- all active workflows and all public `/sdlc-*` commands map to the rewrite contract;
- the deprecated `migrate-project` stub keeps its exact redirect;
- the rewrite contract's release matches `VERSION`, `package.json`, and `.claude-plugin/plugin.json`.

## Verification results

- `cd scripts && npm test` — passed: full Jest suite at the 4.0.0 cutover head.
- `node scripts/verify-plugin-surface.mjs --root . --label repository` — passed.
- `node scripts/verify-current-specs.mjs` — passed.
- `node scripts/skill-inventory-audit.mjs --check` — passed.

## Changed-path mapping

- Claude Code plugin surface: `.claude-plugin/`, `hooks/`, `package.json`, `VERSION`, `src/`, `commands/`.
- Workflow and policy: `.github/`, `.gitignore`, `AGENTS.md`, `CONTRIBUTING.md`, `README.md`, `CHANGELOG.md`, `steering/`, `docs/`.
- SDLC behavior: `workflows/`, `agents/`, `scripts/`, `references/`.
- Current BDD contracts: `specs/`.

All mapped paths are covered by the current rewrite contract, retained BDD contracts, or the verification commands above.
