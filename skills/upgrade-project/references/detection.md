# Legacy-Layout Detection and Relocation

**Read this when** the workflow reaches Step 1.5. Current Claude Code releases protect the project-level `.claude/` directory from Edit/Write — canonical SDLC artifacts must live at the project root (`steering/`, `specs/`), not under `.claude/`. Runtime artifacts (`.claude/unattended-mode`, `.claude/sdlc-state.json`, `.claude/upgrade-exclusions.json`) stay under `.claude/` because the SDLC runner and the upgrade-exclusions write-back access them directly, not through Edit/Write.

`/upgrade-project` is the **only** skill that resolves the legacy layout — every other pipeline skill aborts on it via `../../references/legacy-layout-gate.md`. This file is the relocation playbook the gate sends users back to run.

## Detection signals

1. Check whether `.claude/steering/` exists and contains at least one file. Call this `STEERING_LEGACY`.
2. Check whether `.claude/specs/` exists and contains at least one subdirectory. Call this `SPECS_LEGACY`.
3. Check whether `.claude/migration-exclusions.json` exists. Call this `EXCLUSIONS_LEGACY`.
4. If none of `STEERING_LEGACY`, `SPECS_LEGACY`, `EXCLUSIONS_LEGACY` is true, skip the rest of Step 1.5 and proceed to Step 2.

## Preflight

Before any move, verify the working tree is clean enough to relocate safely:

- Run `git status --porcelain`. If it lists tracked-file modifications under `.claude/steering/`, `.claude/specs/`, or `.claude/migration-exclusions.json`, warn the user. In interactive mode, ask whether to proceed; in unattended mode, proceed (the `git mv` preserves staged/unstaged state on the renamed paths).
- Verify that `steering/` and `specs/` at the project root do NOT already exist with content. If they do, abort Step 1.5 with an instructive message — a half-upgraded project should be resolved manually before re-running.

## Proposal (interactive mode only)

If NOT unattended, present the proposed actions via `AskUserQuestion`:

```
question: "The project uses the legacy `.claude/steering/` and `.claude/specs/` layout. Relocate to `steering/` and `specs/` at the project root?"
options:
  - "Yes, relocate (recommended)"
  - "Skip for now — I'll run this later"
```

If the user skips, record the relocation as deferred and stop Step 1.5. Downstream steps in this skill will still run against whatever lives at `steering/` and `specs/` (which in this case is nothing) and will produce a mostly-empty upgrade report.

## Apply (both modes, once approved)

1. **`STEERING_LEGACY`**: run `git mv .claude/steering steering`. After the move, `Grep` across every file under `steering/` for the literal strings `.claude/steering/` and `.claude/specs/`. For each match, use `Edit` to rewrite the reference to the new path (`steering/` and `specs/` respectively). Remove any now-empty `.claude/steering/` directory.
2. **`SPECS_LEGACY`**: run `git mv .claude/specs specs`. After the move, `Grep` across every file under `specs/` for the literal strings `.claude/steering/` and `.claude/specs/`. For each match, use `Edit` to rewrite the reference. This especially applies to `**Related Spec**` fields in defect-spec `requirements.md` files, which commonly embed the legacy path. Remove any now-empty `.claude/specs/` directory.
3. **`EXCLUSIONS_LEGACY`**: run `git mv .claude/migration-exclusions.json .claude/upgrade-exclusions.json`. The content schema is unchanged.
4. Do NOT touch `.claude/unattended-mode` or `.claude/sdlc-state.json`. These runtime artifacts remain under `.claude/` unchanged.
5. Record every action applied for inclusion in the Step 9 summary.

## Post-conditions

- `.claude/steering/` and `.claude/specs/` no longer exist (or are empty and removed).
- `steering/` and `specs/` contain the relocated content with git history preserved (the `git mv` registers as a rename in git, visible via `git log --follow`).
- No `.claude/specs/` or `.claude/steering/` string appears inside any relocated file.
- `.claude/migration-exclusions.json` has been renamed to `.claude/upgrade-exclusions.json` (if it existed).
- Runtime artifacts under `.claude/` are unchanged.

## Why git mv (and not cp + rm)

`git mv` registers the change as a rename in git, preserving `git log --follow` history on every relocated file. A `cp` followed by `rm` produces a delete + add diff that loses that history. Reviewers and `/run-retro` both depend on `git log --follow` to trace a spec back to its original commit, so the rename form is non-negotiable.
