# Version-Bump Computation and Artifact Updates

**Consumed by**: `open-pr` Steps 2 (classify bump) and 3 (apply bump to versioned files).

Steps 2 and 3 take the current version from `VERSION`, decide the bump type from the issue's labels (adjusted for epic-child sibling state and the explicit `--major` override), and write the new version into every file listed in `steering/tech.md`'s versioning table. Both steps are skipped entirely when no `VERSION` file exists at the project root.

See `../../references/versioning.md` for the invariants this reference operationalises (single-source-of-truth, major-bumps-are-manual, dual-file update, CHANGELOG convention, epic-child downgrade rule).

## Spike handling (no bump)

Before Step 2 begins, check the issue's labels:

```bash
gh issue view #N --json labels --jq '.labels[].name'
```

If any label is `spike`, skip Steps 2 and 3 entirely — do NOT read `VERSION`, write `CHANGELOG.md`, write `.codex-plugin/plugin.json`, or create a `chore: bump version to ...` commit.

Record `spike = true` so Step 4 (Generate PR Content) omits the `Version` line and adds `Type: Spike research (no version bump)` in its place.

> Rationale: spike PRs ship research (the ADR at `docs/decisions/YYYY-MM-DD-<slug>-gap-analysis.md`), not a release. The `spike → skip` row in `steering/tech.md` § Version Bump Classification is the canonical declaration.

## Step 2: Determine version bump

1. **Read the current version.** Read `VERSION` and verify it is valid semver (`X.Y.Z`). If not, warn and skip Steps 2 and 3.
2. **Read issue labels.** `gh issue view #N --json labels --jq '.labels[].name'`.
3. **Read the classification matrix from `steering/tech.md`.** Find `## Versioning` → `### Version Bump Classification`. Parse the table rows (Label → Bump Type) and match the issue's labels case-insensitively, stripping backticks. Use the Bump Type from the first matching row. Fallback: subsection missing or no label matches → default to **minor**.
4. **Calculate the new version string.** If `major_requested` (Step 0) is true, bump **major** (`X.Y.Z → (X+1).0.0`) regardless of the classified type — this is the manual opt-in path. Otherwise use the classified bump type (patch increments Z; minor increments Y and resets Z).

### 4a. Sibling-aware downgrade for epic children

Before presenting to the user, determine whether the current issue is an epic child and whether the bump should be downgraded to a patch:

1. Parse the current issue body for `Depends on: #E` lines (regex `/Depends on:\s*#(\d+)\b/gi`). If none found, also run `gh issue view #N --json parent` and use the parent field's `number` when non-null.
2. If no parent candidate is found OR the parent is not labelled `epic` (`gh issue view #E --json labels --jq '.labels[].name'`), this is not an epic child — skip to Step 5 with the classification from step 4 and `siblingClass = 'non-epic'`.
3. Otherwise enumerate siblings: read the parent's Child Issues checklist (regex `^\s*-\s*\[[x ]\]\s*#(\d+)`) and collect all referenced issue numbers. Exclude the current issue number from the sibling list.
4. For each sibling, query `gh issue view #C --json state,closedByPullRequestsReferences`. Classify each sibling as **complete** when `state === 'CLOSED'` AND at least one entry in `closedByPullRequestsReferences` has `state === 'MERGED'` (or `mergedAt != null`); otherwise **incomplete**.
5. **Downgrade rule:**
   - Every sibling complete → this is the final child. Keep the classified bump (`siblingClass = 'final'`).
   - At least one sibling incomplete → this is an intermediate child. Force `bump_type = 'patch'`, recompute the proposed version, and set `siblingClass = 'intermediate'`.
6. **Epic-closure warning.** Also query `gh issue view #E --json state`. If the epic itself is `CLOSED` while the current child is `OPEN`, warn:
   - **Interactive mode:** use interactive user prompt to confirm before proceeding (`[1] Proceed anyway` / `[2] Abort — investigate epic closure`). Abort exits the skill without creating the PR.
   - **Unattended mode** (`.codex/unattended-mode` exists): do NOT call interactive user prompt. Escalate via the runner sentinel and exit non-zero with message `Epic #E is closed but child #N is still open — confirm the epic was not closed prematurely`.

Record `siblingClass` (one of `non-epic`, `intermediate`, `final`) and `epicParentNumber` (the resolved epic issue number, or null) for Step 3 and Step 4 use.

### 5. Present to the user

```
question: "Version bump: {current} → {proposed} ({bump_type}). Accept or override?"
options:
  - "Accept {proposed}"
  - "Patch ({current} → {patch_version})"
  - "Minor ({current} → {minor_version})"
  - "Major ({current} → {major_version})"
```

When `major_requested` is true, the displayed `{bump_type}` is `major`, `{proposed}` is the major-bumped version, and "Accept {proposed}" is pre-selected as the recommended answer — the developer can still choose Patch or Minor. When `major_requested` is false, the classified type (patch or minor) is the recommended answer. Major remains available as an override for developers who decide a major bump is warranted after seeing the prompt.

**Unattended mode**: apply the classified bump without confirmation — do not call interactive user prompt. Without `--major`, this path produces only patch or minor bumps; the `major_requested` + unattended combination is rejected in Step 0 so it cannot reach this step.

## Step 3: Update version artifacts

If Step 2 determined a version bump, update all version-related files before generating the PR content. If Step 2 was skipped (no `VERSION` file), skip Step 3 as well.

1. **Update the `VERSION` file.** Write the new version string to `VERSION`.
2. **Update `CHANGELOG.md`** if it exists:
   - Find the `## [Unreleased]` heading.
   - Insert a new version heading `## [{new_version}] - {YYYY-MM-DD}` immediately after it.
   - Move all entries that were under `[Unreleased]` to under the new version heading.
   - Leave the `[Unreleased]` section empty (just the heading with a blank line after it).
   - **Partial-delivery note.** If `siblingClass === 'intermediate'`, append ` (partial delivery — see epic #{epicParentNumber})` to the primary bullet under the new version heading. The primary bullet is the first entry line; if there are multiple bullets, only the first receives the suffix. The note must NOT be added for `siblingClass === 'final'` or `non-epic`.
3. **Update stack-specific files.** Read `steering/tech.md`'s `## Versioning` table and update each listed file:
   - **JSON files** (e.g., `package.json`, `.codex-plugin/plugin.json`): use the dot-notation path to locate and update the version field.
   - **TOML files** (e.g., `Cargo.toml`): use the dot-notation path to locate and update the version field.
   - **Plain-text files**: replace the version string on the specified line (or the entire file content if no line is specified).
   - Versioning section missing or table empty → only update `VERSION` and `CHANGELOG.md`.
4. **Commit the version bump.** Stage and commit the version-related file changes:
   ```
   git add VERSION CHANGELOG.md [stack-specific files...]
   git commit -m "chore: bump version to {new_version}"
   ```
