# Legacy Spec-Directory Migration and Frontmatter Updates

**Read this when** Step 4 has finished analyzing existing spec files and the workflow needs to migrate any spec directories that still use the legacy `{issue#}-{slug}` naming convention or the legacy singular `**Issue**` frontmatter. The five sub-steps below run in order; Step 4f also runs independently for feature specs that have already been renamed but retain legacy frontmatter.

Read `../../references/unattended-mode.md` when applying solo renames automatically — Step 4d below is the only sub-step whose interactive-vs-unattended branch flips on the sentinel.

## Step 4b: Detect Legacy Spec Directories

Identify spec directories that use the legacy `{issue#}-{slug}` naming convention and need migration to `feature-{slug}` or `bug-{slug}`.

1. Run `Glob` for `specs/*/requirements.md` to list all spec directories.
2. For each spec directory, classify by naming pattern:
   - **Legacy**: directory name matches `{digits}-{slug}` pattern (e.g., `42-add-dark-mode`, `71-dark-mode-toggle`).
   - **New**: directory name starts with `feature-` or `bug-` prefix.
3. Collect all legacy directories into a candidate list.
4. If no legacy directories found, skip Steps 4c–4e and proceed to Step 4f.

## Step 4c: Cluster Legacy Specs by Feature

Group related legacy specs that should be consolidated into a single feature spec.

1. For each legacy spec, extract keywords from:
   - Directory name (strip the issue number prefix).
   - First `# ` heading of `requirements.md` (feature name).
   - User story content.
2. **Exclude bug specs from consolidation grouping** — read the first heading of each `requirements.md`:
   - `# Defect Report:` → this is a bug spec. Do not group it with other specs. It becomes a solo `bug-{slug}` rename candidate.
   - `# Requirements:` → this is a feature spec. Include in keyword comparison.
3. Compare keyword sets between all pairs of feature legacy specs. Group specs with significant keyword overlap (>50% shared keywords after stop-word filtering).
4. For each group, determine the proposed feature name:
   - Use the most descriptive slug from the group (longest directory slug after stripping the issue number prefix).
   - Prefix with `feature-`.
5. Solo feature specs (no group match) are also migration candidates: simple rename from `{issue#}-{slug}` to `feature-{slug}`.
6. Solo bug specs: rename from `{issue#}-{slug}` to `bug-{slug}`.

## Step 4d: Present Consolidation Candidates

For each group (and solo migration candidates):

1. Show the source directories and proposed target name.
2. Show a brief summary of each source spec's content (first heading, issue number, status).

**If `.claude/unattended-mode` exists:**

- **Solo renames** (type `"rename"` or `"rename-bug"` — single directory → `feature-{slug}/` or `bug-{slug}/`): non-destructive. Execute the rename automatically — proceed to Step 4e to apply `git mv`, frontmatter updates, and cross-reference updates without `AskUserQuestion`. Do NOT record solo renames as skipped operations.
- **Consolidation groups** (type `"consolidation"` — multiple directories merged into one): destructive. Skip `AskUserQuestion` and record each group as a skipped operation (affected paths: source directories, reason: `"Destructive operation requires interactive approval"`).

After processing all groups, proceed to Step 4f.

**If `.claude/unattended-mode` does NOT exist:** Use `AskUserQuestion` for each group:

- Option 1: `"Consolidate into feature-{slug}/"` (or `"Rename to feature-{slug}/"` / `"Rename to bug-{slug}/"` for solo specs).
- Option 2: `"Skip — leave as-is"`.

## Step 4e: Apply Consolidation

For each approved group or solo rename:

### Multi-spec consolidation (groups of related feature specs)

1. **Create new directory**: `specs/feature-{slug}/`.
2. **Merge `requirements.md`**: Start with the oldest spec's content as the base. Change `**Issue**` to `**Issues**` and collect all issue numbers (e.g., `**Issues**: #42, #71`). Append ACs and FRs from other specs with sequential numbering (find highest existing AC/FR number, continue from there). Create a Change History section from all contributing specs.
3. **Merge `design.md`**: Start with the oldest spec's design as base. Append unique sections from other specs. Update `**Issues**` frontmatter.
4. **Merge `tasks.md`**: Start with the oldest spec's tasks as base. Append tasks from other specs with renumbered IDs. Mark tasks from already-implemented specs as completed. Update Summary table.
5. **Merge `feature.gherkin`**: Concatenate all scenarios. Tag appended scenarios with `# From issue #N` comments.
6. **Update defect spec cross-references**: Run `Grep` across all spec directories (both already-renamed `bug-*/` and not-yet-renamed `{issue#}-*/`) for `**Related Spec**` fields pointing to any consolidated or renamed legacy directory. Filter to defect specs by checking for `# Defect Report:` heading. Update those fields to point to the new `feature-{slug}/` directory. Follow chain resolution through intermediate defect specs (maintaining a visited set for cycle detection).
7. **Remove legacy directories** after successful merge.

### Solo feature rename (single legacy spec → `feature-{slug}`)

1. Rename the directory using `git mv`: `git mv specs/{issue#}-{slug}/ specs/feature-{slug}/`.
2. Update frontmatter in `requirements.md`, `design.md`, and `tasks.md`: replace `**Issue**: #N` with `**Issues**: #N`.
3. Update defect spec cross-references: Run `Grep` across all `specs/*/requirements.md` files for `**Related Spec**` fields containing the old path. For each match, verify it is a defect spec (check for `# Defect Report:` first heading) and `Edit` the field to point to `specs/feature-{slug}/`. Then follow chain resolution: for each updated defect spec, check whether other defect specs have `**Related Spec**` fields pointing to IT, and update those as well. Maintain a visited set to prevent circular traversal.

### Solo bug rename (single legacy bug spec → `bug-{slug}`)

1. Rename the directory using `git mv`: `git mv specs/{issue#}-{slug}/ specs/bug-{slug}/`.
2. Keep the singular `**Issue**: #N` field (bugs are per-issue).
3. Update defect spec cross-references the same way as the feature rename above (with `bug-{slug}/` as the new target).

## Step 4f: Migrate Legacy Frontmatter in Feature Specs

After consolidation (or independently, for feature specs that already use `feature-` naming but retain old frontmatter):

1. Run `Glob` for `specs/feature-*/requirements.md`, `specs/feature-*/design.md`, `specs/feature-*/tasks.md`.
2. For each file, read the first 15 lines and check:
   - Is the first `# ` heading a **feature variant** (`# Requirements:`, `# Design:`, `# Tasks:`)? If `# Defect Report:` or `# Root Cause Analysis:`, skip — defect specs keep singular `**Issue**`.
   - Does the file contain `**Issue**: #` (singular) instead of `**Issues**: #` (plural)?
   - Is the `## Change History` section missing?
3. For files with singular `**Issue**`: propose replacing `**Issue**: #N` with `**Issues**: #N`.
4. For files missing `## Change History`: propose adding the section before `## Validation Checklist` with a single entry: `| #N | [original date from **Date** field] | Initial feature spec |`.
5. Present findings alongside other migration proposals in Step 8.
6. Apply on user confirmation using `Edit`.

This step runs on ALL feature-variant specs in `feature-*/` directories, catching specs that were created by newer `/write-spec` but somehow have stale frontmatter, renamed from legacy directories but not yet updated, or already in the new naming convention from a prior partial migration.

Read `../../references/spec-frontmatter.md` when applying any frontmatter rewrite during migration — the canonical conventions every spec file follows live there.
