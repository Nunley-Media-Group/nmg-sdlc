# Amendment Mode

**Read this when** Spec Discovery (`references/discovery.md`) resolved an existing feature spec and the workflow is amending it rather than creating a new one. The amendment branch fires across all three phases — this file consolidates the per-phase steps so the main workflow stays focused on the create path. Defect specs are never amended; if the issue is bug-labelled, the workflow uses `references/defect-variant.md` and writes a fresh `bug-{slug}/` directory.

The amendment contract is **append-only**: existing ACs, FRs, design sections, tasks, scenarios, and ownership assignments are preserved verbatim. New content is appended with sequential numbering so the change history stays auditable and prior reviewers' approvals remain valid.

Read `../../references/spec-frontmatter.md` when applying any frontmatter edit during amendment — the plural `**Issues**`, Change History table format, and defect-vs-feature schema conventions live there. Read `../../../references/issue-spec-scope.md` before changing a cumulative feature spec's `issue-scope.json`; the manifest is the element-level authority and its existing ownership must remain intact.

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
3. Assign each new scenario the next unique stable `@SCN...` identifier and retain the contributing-issue comment: `# Added by issue #N`.
4. Preserve every existing stable scenario identifier verbatim.
5. Write the amended `feature.gherkin`.

## Phase 3 — `issue-scope.json` amendment

1. Read and validate the existing manifest before proposing an amendment. A missing or incomplete cumulative manifest is an explicit repair task; do not guess ownership from Change History prose.
2. Preserve all existing issue entries and `owned` assignments verbatim unless the review is explicitly repairing a named validation gap.
3. Add the new issue entry and assign every newly appended AC, FR, task, and scenario ID to its `owned` group.
4. Put an existing element in `adopted` only when it is a current delivery obligation and its canonical owner remains a different issue.
5. Put an earlier AC, FR, or scenario in `regression` only when the current issue must prove preservation; regression never contains tasks and never changes ownership.
6. Present the exact owned, adopted, and regression lists in the Tasks Review Gate. Apply only the approved mapping.
7. Run the shared resolver for the active issue and require `scoped` before handoff. Return `repair_required` to the review gate and fail closed on `unverifiable`.

## Why append-only

Rewriting existing content silently invalidates prior review approvals and breaks the Change History audit trail used by `$nmg-sdlc:run-retro`. The append-only rule keeps every prior issue's contribution intact and traceable: an AC introduced for `#42` stays owned by `#42` even after `#71` adopts it or `#84` adds its own. When in doubt about whether a change is an *addition* or a *rewrite*, treat it as a rewrite and stop — discuss with the user before proceeding.
