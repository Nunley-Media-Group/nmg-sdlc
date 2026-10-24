# Project Instructions Contract

**Consumed by**: `onboard-project` after steering bootstrap or verification succeeds, and `upgrade-project` when analyzing or applying managed project artifact findings.

Use this reference to create or reconcile root `CLAUDE.md` guidance that makes nmg-sdlc spec context available to general Claude Code prompts. This is project content, not plugin metadata. It must be additive, idempotent, and preserve every project-authored instruction outside the managed section.

## Preconditions

Run this contract only after the project has a valid managed steering runtime:

- `steering/manifest.json`
- `steering/modules/product.mjs`
- `steering/modules/tech.mjs`
- `steering/modules/structure.mjs`
- `steering/modules/verification.mjs`

If the runtime is missing or invalid, do not create or update `CLAUDE.md`. Report `CLAUDE.md: skipped (invalid steering runtime)` with the stable reason code.

## Managed Section

Use these exact markers for nmg-sdlc-owned content:

```markdown
<!-- nmg-sdlc-managed: spec-context -->
## nmg-sdlc Spec Context

For SDLC work, project-root `specs/` is the canonical BDD archive. Specs use directories of the form `specs/{N}-{slug}/` where `N` is the GitHub issue number. Always identify the active spec first (leading directory number must match the issue and every file must declare singular `**Issue**: #N`), then use bounded relevant-spec discovery to load only the neighboring specs that can affect the change. Do not load the full archive by default. Legacy `.codex/specs/` directories are inputs to `/sdlc-upgrade-project` only.
<!-- /nmg-sdlc-managed -->
```

Only text between the opening and closing markers is nmg-sdlc-managed. Existing content before, after, or around the section is project-authored and must remain byte-stable except for the newline needed before appending a section.

## Coverage Detection

Classify root `CLAUDE.md`:

| State | Detection | Action |
|-------|-----------|--------|
| Missing | `CLAUDE.md` does not exist | Create a concise file containing the managed section |
| Managed section current | Both markers exist and the section mentions root `specs/`, `specs/{N}-{slug}/`, active spec first, singular `**Issue**: #N`, bounded discovery, neighboring specs, and legacy `.codex/specs/` only as upgrade input | Leave unchanged |
| Managed section stale | Both markers exist but required guidance is missing or obsolete | Replace only the marked section |
| Equivalent project-authored guidance | No markers, but the file already mentions `specs/{N}-{slug}/` or equivalent, active spec, bounded discovery or capped loading, neighboring or related specs, and avoids treating legacy `.codex/specs/` as primary context | Leave unchanged and report already present |
| Incomplete guidance | File exists without current managed section or equivalent coverage | Append the managed section |
| Malformed markers | One marker exists without the other | Do not pair the orphan with any later marker; repair it in place by inserting the missing counterpart adjacent to the orphan, then refresh only that repaired managed section and record a malformed-marker gap |

Be conservative. If project-authored guidance is close and clearly covers the same behavior, do not duplicate it.

## Apply Rules

1. Preserve project-authored content byte-for-byte outside the managed section.
2. If `CLAUDE.md` is missing, create it with:
   ```markdown
   # CLAUDE.md

   <!-- nmg-sdlc-managed: spec-context -->
   ...
   <!-- /nmg-sdlc-managed -->
   ```
3. If appending to an existing file, add one blank line before the managed section when needed.
4. If refreshing a managed section, replace only the bytes from the opening marker through the closing marker.
5. If only the opening marker exists, insert the missing closing marker immediately after that orphan opening marker before refreshing that repaired section; do not pair the orphan opening marker with any later appended closing marker.
6. If only the closing marker exists, insert the missing opening marker immediately before that orphan closing marker before refreshing that repaired section; do not pair the orphan closing marker with any later appended opening marker.
7. Re-read the file after writing and verify exactly one complete managed section exists unless equivalent project-authored guidance was already present.

## Existing AGENTS.md

When root `AGENTS.md` exists, do not append the managed section to it. `upgrade-project` proposes `agents-to-claude-md` (rename when `CLAUDE.md` is absent, otherwise append after one blank line); this contract then runs against the resulting `CLAUDE.md`.

## Lifecycle Behavior

- `onboard-project` applies this contract as part of lifecycle setup after steering exists.
- `upgrade-project` presents missing, incomplete, stale, or malformed `CLAUDE.md` guidance as a non-destructive managed-artifact finding through its existing approval flow.

- Record every applied, already-present, or skipped outcome in the final summary.

## Summary Status

Return this stable result shape:

```text
Project Instructions:
- CLAUDE.md: created | updated | already present | skipped (<reason>)
- Gaps: none | <comma-separated gaps>
```

Use these exact status words so summaries and tests can compare results consistently.

## Safety Rules

- Never delete, move, reorder, or reformat project-authored instructions.
- Never create or modify legacy `.codex/AGENTS.md`.
- Never create the managed section in `AGENTS.md`. When root `AGENTS.md` exists, `upgrade-project` proposes `agents-to-claude-md`, which moves it to `CLAUDE.md`, instead of writing to it.
- Never create a missing `README.md`.
- Never copy long steering excerpts, secrets, internal URLs, credentials, or repository-private policy into the managed section.
- Never overwrite equivalent project-authored guidance just to add markers.
