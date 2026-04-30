# Project AGENTS Contract

**Consumed by**: `onboard-project` after steering bootstrap or verification succeeds, and `upgrade-project` when analyzing or applying managed project artifact findings.

Use this reference to create or reconcile root `AGENTS.md` guidance that makes nmg-sdlc spec context available to general Codex prompts. This is project content, not plugin metadata. It must be additive, idempotent, and preserve every project-authored instruction outside the managed section.

## Preconditions

Run this contract only after the project has current root steering:

- `steering/product.md`
- `steering/tech.md`
- `steering/structure.md`

If any steering doc is missing, do not create or update `AGENTS.md`. Report `AGENTS.md: skipped (missing steering)` and include the missing files in gaps.

## Managed Section

Use these exact markers for nmg-sdlc-owned content:

```markdown
<!-- nmg-sdlc-managed: spec-context -->
## nmg-sdlc Spec Context

For SDLC work, project-root `specs/` is the canonical BDD archive. Always identify the active spec first, then use bounded relevant-spec discovery to load only the neighboring specs that can affect the change. Do not load the full archive by default, and do not use legacy `.codex/specs/` as context.
<!-- /nmg-sdlc-managed -->
```

Only text between the opening and closing markers is nmg-sdlc-managed. Existing content before, after, or around the section is project-authored and must remain byte-stable except for the newline needed before appending a section.

## Coverage Detection

Classify root `AGENTS.md`:

| State | Detection | Action |
|-------|-----------|--------|
| Missing | `AGENTS.md` does not exist | Create a concise file containing the managed section |
| Managed section current | Both markers exist and the section mentions root `specs/`, active spec first, bounded discovery, neighboring specs, and no legacy `.codex/specs/` | Leave unchanged |
| Managed section stale | Both markers exist but required guidance is missing or obsolete | Replace only the marked section |
| Equivalent project-authored guidance | No markers, but the file already mentions `specs/`, active spec, bounded discovery or capped loading, neighboring or related specs, and avoids legacy `.codex/specs/` | Leave unchanged and report already present |
| Incomplete guidance | File exists without current managed section or equivalent coverage | Append the managed section |
| Malformed markers | One marker exists without the other | Do not pair the orphan with any later marker; repair it in place by inserting the missing counterpart adjacent to the orphan, then refresh only that repaired managed section and record a malformed-marker gap |

Be conservative. If project-authored guidance is close and clearly covers the same behavior, do not duplicate it.

## Apply Rules

1. Preserve project-authored content byte-for-byte outside the managed section.
2. If `AGENTS.md` is missing, create it with:
   ```markdown
   # AGENTS.md

   <!-- nmg-sdlc-managed: spec-context -->
   ...
   <!-- /nmg-sdlc-managed -->
   ```
3. If appending to an existing file, add one blank line before the managed section when needed.
4. If refreshing a managed section, replace only the bytes from the opening marker through the closing marker.
5. If only the opening marker exists, insert the missing closing marker immediately after that orphan opening marker before refreshing that repaired section; do not pair the orphan opening marker with any later appended closing marker.
6. If only the closing marker exists, insert the missing opening marker immediately before that orphan closing marker before refreshing that repaired section; do not pair the orphan closing marker with any later appended opening marker.
7. Re-read the file after writing and verify exactly one complete managed section exists unless equivalent project-authored guidance was already present.

## Mode Behavior

Interactive mode:

- `onboard-project` applies this contract as part of lifecycle setup after steering exists.
- `upgrade-project` presents missing, incomplete, stale, or malformed `AGENTS.md` guidance as a non-destructive managed-artifact finding through its existing approval flow.

Unattended mode:

- Do not call `request_user_input`.
- Auto-apply missing file creation, section append, and section refresh because they are non-destructive managed-artifact changes.
- Record every applied, already-present, or skipped outcome in the final summary.

## Summary Status

Return this stable result shape:

```text
Project AGENTS:
- AGENTS.md: created | updated | already present | skipped (<reason>)
- Gaps: none | <comma-separated gaps>
```

Use these exact status words so summaries and tests can compare results consistently.

## Safety Rules

- Never delete, move, reorder, or reformat project-authored instructions.
- Never create or modify legacy `.codex/AGENTS.md`.
- Never create a missing `README.md`.
- Never copy long steering excerpts, secrets, internal URLs, credentials, or repository-private policy into the managed section.
- Never overwrite equivalent project-authored guidance just to add markers.
