# Feature Naming Convention

**Consumed by**: `draft-issue`, `start-issue`, `write-spec`, `verify-code`, `open-pr`, `execute`.

Spec directories under `specs/` are `specs/{N}-{slug}/`. `N` is the issue number. One issue owns exactly one directory.

## Slug derivation

Derive the slug from the GitHub issue title:

1. Lowercase the title.
2. Replace spaces and any character outside `[a-z0-9-]` with a hyphen.
3. Collapse consecutive hyphens and strip leading/trailing hyphens.

Examples:

| Issue | Title | Directory |
|-------|-------|-----------|
| 71 | `Add dark mode toggle` | `specs/71-add-dark-mode-toggle/` |
| 8 | `Fix login crash on timeout` | `specs/8-fix-login-crash-on-timeout/` |

## No classifier prefixes

New writes never create `feature-`, `bug-`, or `epic-` prefixes. Variant is the issue label plus heading (`# Requirements:` vs `# Defect Report:`).

## Branch names

Branch name remains `{N}-{slug}` via `gh issue develop N --checkout --name N-slug --base <defaultBranch>`.

## Discovery for a given issue

1. Find the first `specs/{N}-*/` directory whose leading number equals `N`.
2. Require every spec file `**Issue**: #{N}` to match.
3. Mismatch → fail closed.

## Legacy directories

`feature-*` / `bug-*` / `epic-*` / leftover `{N}-{slug}` layouts are `upgrade-project` inputs only. New writes never create them.
