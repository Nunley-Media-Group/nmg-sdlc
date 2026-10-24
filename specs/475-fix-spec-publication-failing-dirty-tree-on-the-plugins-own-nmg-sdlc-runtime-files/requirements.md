# Defect Report: Fix spec publication failing dirty_tree on the plugin's own .nmg-sdlc runtime files

**Issue**: #475
**Date**: 2026-10-24
**Status**: Approved
**Author**: NMG
**Related Spec**: specs/473-fix-smoke-provisioning-prompting-through-a-workspace-trust-dialog-herdr-reports-as-ready/

## Reproduction

1. In a project without `.nmg-sdlc/` in `.gitignore`, run `/sdlc-draft-issue`, then `/sdlc-write-spec N`.
2. Rendering those workflows writes `.nmg-sdlc/prompt-provenance/sdlc-draft-issue.json` and `sdlc-write-spec.json`.
3. At publication, `publish-approved-spec.mjs prepare --issue N --name N-slug` fails with `{"ok":false,"reasonCode":"dirty_tree","porcelain":"?? .nmg-sdlc/\n"}`.

## Expected vs Actual

| | Description |
|---|-------------|
| **Expected** | Plugin runtime files under `.nmg-sdlc/` never make the tree dirty for spec publication; any other change still does. |
| **Actual** | Publication stops with `dirty_tree`, and live smoke provisioning stalls in the spec phase. |

## Acceptance Criteria

### AC1: Runtime state does not block publication

**Given** a clean project on its default branch except for untracked files under `.nmg-sdlc/`
**When** `publish-approved-spec.mjs prepare --issue N --name N-slug` runs
**Then** it checks out `N-slug` and reports `ok: true`

### AC2: Other changes still block publication

**Given** an untracked or modified file outside `.nmg-sdlc/`
**When** `prepare` runs on another branch
**Then** it fails `dirty_tree` and prints only the non-runtime porcelain

## Functional Requirements

| ID | Requirement | Priority |
|----|-------------|----------|
| FR1 | The publisher's dirty check leaves out porcelain lines whose path starts with `.nmg-sdlc/`, as `sdlc-execute.mjs`, `sdlc-deliver.mjs`, and `sdlc-finalize-verification.mjs` already do | Must |

## Out of Scope

- Adding `.nmg-sdlc/` to projects' `.gitignore` (onboarding and upgrade already do that)
