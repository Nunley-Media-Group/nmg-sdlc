# AGENTS.md

## Project Overview

`nmg-sdlc` is an Oh My Pi extension that provides spec-driven delivery for Oh My Pi and Herdr. It is packaged with an OMP manifest in `package.json` (`omp.extensions`) and the extension factory at `src/extension.ts`.

## Repository Structure

```
package.json                  # OMP plugin manifest (version + omp.extensions)
src/extension.ts              # Extension factory (registers /sdlc-* commands)
workflows/                    # Private workflow files (one directory per workflow, WORKFLOW.md entrypoints)
agents/                       # OMP task agents (starter, spec-implementer, architecture-reviewer, deliverer)
references/                   # Shared reference contracts loaded on demand by workflows
scripts/                      # Deterministic validators, status CLI, exercise runners, and tests
specs/                        # BDD specs for the plugin's own development cycle (specs/{N}-{slug}/)
steering/                     # Product, tech, and structure steering documents
docs/decisions/               # ADR directory
VERSION                       # Version source (kept in sync with package.json)
CHANGELOG.md                  # Keep an [Unreleased] section for pending changes
README.md                     # Public docs: workflow, installation, skills reference
.github/workflows/            # CI including contribution gate
```

## Version Bumping

When bumping the version, update `package.json` `"version"`, the root `VERSION` file, and ensure `src/extension.ts` remains consistent. The delivery flow (via execute) keeps `VERSION`, `package.json`, and `CHANGELOG.md` in sync.

## README Updates

When making changes that affect how users interact with the extension (new skills, changed workflows, new steering documents, etc.), update `README.md` accordingly. The README is the primary public documentation and must stay in sync with actual capabilities.

## Commit & CHANGELOG Conventions

- Conventional commits: `feat:`, `fix:`, `docs:`, `chore:`
- `CHANGELOG.md` uses `[Unreleased]` for pending changes; delivery rolls it to a versioned heading at release
- Workflows live in `workflows/{name}/WORKFLOW.md`
- All workflows include an "Integration with SDLC Workflow" section
- `specs/` files must be committed with their feature branches, not left as untracked local files

<!-- nmg-sdlc-managed: spec-context -->
## nmg-sdlc Spec Context

For SDLC work, project-root `specs/` is the canonical working-tree BDD archive and contains only current contracts with genuine GitHub issue owners. Specs use directories of the form `specs/{N}-{slug}/` where `N` is the GitHub issue number. Always identify the active spec first (leading directory number must match the issue and every file must declare singular `**Issue**: #N`), then use bounded relevant-spec discovery to load only the neighboring specs that can affect the change. Do not load the full archive by default. Superseded specs remain in Git history. A breaking repository rewrite may document unowned rewrite-only behavior in `references/rewrite-contract.{json,md}` but must not assign it a synthetic issue number or treat it as an executable issue spec. Legacy `.codex/specs/` directories are inputs to `/sdlc-upgrade-project` only.
<!-- /nmg-sdlc-managed -->
