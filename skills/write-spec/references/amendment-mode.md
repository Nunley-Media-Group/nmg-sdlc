# Amendment Mode

**Read this when** Spec Discovery (`references/discovery.md`) resolved an existing feature spec and the workflow is amending it rather than creating a new one. The amendment branch fires across all three phases — this file consolidates the per-phase steps so the main workflow stays focused on the create path. Defect specs are never amended; if the issue is bug-labelled, the workflow uses `references/defect-variant.md` and writes a fresh `bug-{slug}/` directory.

The amendment contract is **append-only**: existing ACs, FRs, design sections, and tasks are preserved verbatim. New content is appended with sequential numbering so the change history stays auditable and prior reviewers' approvals remain valid.

Read `../../references/spec-frontmatter.md` when applying any frontmatter edit during amendment — the plural `**Issues**`, Change History table format, and defect-vs-feature schema conventions live there.

## Phase 1 — `requirements.md` amendment

1. Read the existing `requirements.md`.
2. Parse the `**Issues**` field to get the current issue list.
3. Parse all `### ACN:` headings to find the highest AC number.
4. Parse the FR table to find the highest FR ID.
5. Read the new issue content (from `gh issue view`).
6. Construct the amendment:
   - Append the new issue number to `**Issues**` (e.g., `**Issues**: #42, #71`).
   - Update `**Date**` to today.
   - Append new ACs starting from the next sequential number, under the existing ACs.
   - Append new FRs starting from the next sequential ID, into the existing FR table.
   - Append new items to Out of Scope when applicable.
   - Add a Change History entry: `| #N | [today] | [brief summary of what this issue adds] |`.
7. Write the amended `requirements.md`.

## Phase 2 — `design.md` amendment

1. Read the existing `design.md`.
2. Identify sections that need additions (new components, new API changes, new considerations).
3. Append new content to relevant sections rather than replacing existing content — the surrounding rationale was already approved and must not be rewritten.
4. Add the new issue number to the `**Issues**` field.
5. If new alternatives exist, add to Alternatives Considered.
6. Add a Change History entry.
7. Write the amended `design.md`.

## Phase 3 — `tasks.md` amendment

1. Read the existing `tasks.md`.
2. Parse all `### TNNN:` headings to find the highest task number.
3. Append new tasks starting from the next sequential number.
4. New tasks may form a new phase (e.g., "Phase 6: Enhancement — Issue #71") or be added to existing phases as appropriate.
5. Update the Summary table with new phase/counts.
6. Update the Dependency Graph to include new tasks.
7. Add the new issue number to the `**Issues**` field.
8. Add a Change History entry.
9. Write the amended `tasks.md`.

## Phase 3 — `feature.gherkin` amendment

1. Read the existing `feature.gherkin`.
2. Append new scenarios at the end.
3. Tag new scenarios with a comment indicating the contributing issue: `# Added by issue #N`.
4. Write the amended `feature.gherkin`.

## Why append-only

Rewriting existing content silently invalidates prior review approvals and breaks the Change History audit trail used by `$nmg-sdlc:run-retro`. The append-only rule keeps every prior issue's contribution intact and traceable: an AC introduced for `#42` stays attributed to `#42` even after `#71` and `#84` add their own. When in doubt about whether a change is an *addition* or a *rewrite*, treat it as a rewrite and stop — discuss with the user before proceeding.
