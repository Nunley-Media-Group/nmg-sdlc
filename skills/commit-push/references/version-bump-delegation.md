# Version-Bump Delegation

**Consumed by**: `commit-push` Step 2 (apply version bump).

The version-bump logic — classification matrix, epic-child sibling-aware downgrade, artifact updates, CHANGELOG roll — lives in one place and is read from both `/open-pr` (historically) and `/commit-push` (after FR1). This reference exists so `commit-push`'s SKILL.md can point at the canonical procedure without duplicating it.

## Canonical procedure

Read `../../open-pr/references/version-bump.md` — the reference covers:

- Spike handling (skip bump entirely for `spike`-labelled issues; emit `Type: Spike research (no version bump)` in the PR body).
- `VERSION` read and semver validation.
- Label-matrix lookup in `steering/tech.md` → `## Versioning` → `### Version Bump Classification`.
- `major_requested` override (set by `/open-pr` Step 0; in commit-push context the `--major` flag is not available and this override is always false).
- Epic-child sibling enumeration, `closedByPullRequestsReferences` inspection, and the `intermediate` / `final` downgrade rule.
- Epic-closure warning (interactive confirmation in manual mode; escalation in unattended mode).
- Stack-specific versioned-files table from `steering/tech.md` → `## Versioning`.
- CHANGELOG `[Unreleased]` roll under the new version heading, with partial-delivery annotation for intermediate epic children.
- Commit message shape: `chore: bump version to {new_version}`.

## Differences between `/open-pr` and `/commit-push` invocations

| Aspect | `/open-pr` historical behaviour | `/commit-push` behaviour |
|--------|----------------------------------|--------------------------|
| `--major` flag | Honours `/open-pr #N --major` | Not applicable — `/commit-push` has no argument surface |
| Call site | Runs inside the skill immediately before `gh pr create` | Runs after staging, before the commit, so the bump is part of the implementation commit (or its own `chore: bump` commit when implementation is clean) |
| Unattended escalation | Escalates on the epic-closure warning | Same — escalation semantics are identical |

## What this reference deliberately omits

- No re-statement of the bump matrix — `steering/tech.md` is the single source of truth and `../../open-pr/references/version-bump.md` is the single reader.
- No independent artifact-update procedure — identical logic must not diverge between call sites. The one procedure lives in `version-bump.md`.
- No duplicated spike handling — the `spike = true` check at the top of `version-bump.md` applies to both call sites.

## Out of scope for this reference

- The push mechanics, including the force-with-lease envelope — see `rebase-and-push.md`.
- CI monitoring and PR creation — owned by `/open-pr` and the runner's `monitorCI` step.
