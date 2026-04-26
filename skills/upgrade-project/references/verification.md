# Config, CHANGELOG, and VERSION Verification

**Read this when** the workflow reaches Steps 5, 6, and 7 — they analyze the SDLC runner config (`sdlc-config.json`), the changelog (`CHANGELOG.md`), and the `VERSION` file in that order. None of these steps can abort the run — they record findings for the Step 8 presentation gate.

## Step 5: Analyze SDLC Runner Config

If `sdlc-config.json` exists in the project root:

1. **Read both files** — the project's `sdlc-config.json` and the template `sdlc-config.example.json`. If either file cannot be parsed as valid JSON, skip config analysis entirely and note the parse error in the summary (e.g., `Config analysis skipped — sdlc-config.json is not valid JSON`).
2. **Compare root-level keys** — identify keys present in the template but absent from the project config.
3. **Compare `steps.*` keys** — identify missing step entries (e.g., a new step added to the template).
4. **Compare step sub-keys** — for each step that exists in both, identify missing sub-keys (e.g., `skill`, `timeoutMin`).
5. **Record missing keys at all levels** with their template default values.
6. **Compare scalar values for drift** — after identifying missing keys, perform a second pass over keys that exist in **both** the project config and the template:
   - **Root-level scalars** (e.g., `model`, `effort`, `maxRetriesPerStep`, `maxBounceRetries`, `maxLogDiskUsageMB`): compare values directly.
   - **Step sub-key scalars** (e.g., `steps.createPR.timeoutMin`, `steps.verify.timeoutMin`, `steps.implement.model`): for each step present in both configs, compare each sub-key value.
   - **Skip non-scalars**: if both values are objects, recurse into sub-keys (for `steps.*` nesting — max two levels deep: `steps.{stepName}.{subKey}`); if one is an object and the other a scalar, record as drift (type mismatch); arrays and complex nested objects not present in the template are excluded.
   - **Skip user additions**: keys present in the project config but absent from the template are not drift candidates.
7. **Record each drifted value** with:
   - Dotted key path (e.g., `steps.createPR.timeoutMin`).
   - Current project value.
   - Template default value.

**Important:** Never overwrite existing values. Only add keys that are entirely absent. Config value drift is reported separately and requires explicit per-value user approval before any values are updated (see Step 8 Part C in SKILL.md).

## Step 6: Analyze CHANGELOG.md

Check whether the project has a `CHANGELOG.md` and ensure it follows the [Keep a Changelog](https://keepachangelog.com/) format.

### If no CHANGELOG.md exists

Generate one from git history:

1. **Parse git tags**: Run `git tag --sort=-v:refname` to list version tags (e.g., `v1.0.0`, `v1.1.0`).
2. **Parse commits between tags**: For each pair of consecutive tags, run `git log {older_tag}..{newer_tag} --pretty=format:"%s"` to get commit messages.
3. **Classify by conventional commit type**:
   - `feat:` → `### Added`
   - `fix:` → `### Fixed`
   - `refactor:`, `chore:`, `docs:`, `style:`, `perf:`, `test:` → `### Changed`
   - Commits without a conventional prefix → `### Changed`
4. **Build the CHANGELOG**: Use Keep a Changelog format with version headings from git tags and an `[Unreleased]` section for commits after the latest tag.
5. **If no git tags exist**: Group all commits under a `## [0.1.0]` version heading (with today's date) and leave the `[Unreleased]` section empty.

### If CHANGELOG.md exists

Reconcile it with the Keep a Changelog format:

1. **Check for `[Unreleased]` section**: If missing, add one after the preamble.
2. **Check version headings**: Compare git tags against CHANGELOG version headings. Identify any tagged versions missing from the CHANGELOG.
3. **Check categories**: Ensure entries are grouped under standard categories (`### Added`, `### Changed`, `### Fixed`, `### Removed`, etc.). Flag any non-standard categories.
4. **Check preamble**: Ensure the file starts with a title (`# Changelog`) and a brief description.
5. **Preserve manual entries**: Any entries that do not correspond to conventional commits must be preserved exactly as-is.

Record findings (missing sections, malformed headings, reconciliation needed) for the Step 9 summary.

## Step 7: Analyze VERSION File

Ensure the project has a `VERSION` file that reflects the current version.

1. **Determine expected version**:
   - If CHANGELOG.md has versioned headings (from Step 6 or pre-existing), use the latest version heading as the expected version.
   - If no CHANGELOG.md versions exist but git tags are present, use the latest semver git tag.
   - If neither exists, default to `0.1.0`.
2. **Check for VERSION file**:
   - If `VERSION` does not exist: record a finding to create it with the expected version.
   - If `VERSION` exists: read it and compare to the expected version. If they differ, record a finding to update it.
   - If they match: no action needed.

Record findings for the Step 9 summary.

## Why these three live together

Steps 5–7 share the same shape: read a project file (or note its absence), compare against an authoritative source (template, git tags, CHANGELOG), record findings, and never apply changes without going through Step 8's approval gate. Grouping them in one reference keeps the SKILL.md skeleton focused on the higher-level orchestration (which steps run, in what order) while the file-by-file logic lives here for whoever is auditing or extending one of these analyses.
