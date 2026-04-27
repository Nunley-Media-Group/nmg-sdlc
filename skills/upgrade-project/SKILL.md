---
name: upgrade-project
description: "Upgrade a project to the latest nmg-sdlc contract — relocate legacy `.codex/steering/` and `.codex/specs/` to the project root, update specs, steering docs, and configs to current template standards. Use when user says 'upgrade project', 'update templates', 'check for outdated docs', 'sync with latest plugin', 'relocate specs', 'how do I update my project', or 'bring my project up to date'. Detects the legacy `.codex/{steering,specs}` directory layout and migrates it in place via `git mv`, then diffs headings against current templates and merges missing sections while preserving all user content. Utility skill — run after plugin updates, outside the main SDLC pipeline."
---

# Upgrade Project

Read `../../references/codex-tooling.md` when the workflow starts — it maps legacy tool wording to Codex-native file inspection, shell, editing, web, interactive-gate, and subagent behavior.

Read `../../references/interactive-gates.md` when the workflow reaches any manual-mode user decision, menu, review gate, or clarification prompt — Codex asks through `request_user_input` in Plan Mode, then finalizes a `<proposed_plan>` before execution.

Bring an existing project forward to the current nmg-sdlc contract. The skill covers two related jobs:

1. **Directory relocation** — move `.codex/steering/` → `steering/` and `.codex/specs/` → `specs/` at the project root (current Codex releases protect `.codex/` from Edit/Write; canonical SDLC artifacts must live at the root).
2. **Template reconciliation** — diff existing steering docs, spec files, and runner configs against current templates and merge missing sections while preserving all user content.

`$nmg-sdlc:upgrade-project` is the **only** pipeline skill that resolves the legacy-layout gate from `../../references/legacy-layout-gate.md` — every other skill aborts on the legacy layout and points users here.

This skill is **self-updating**: it reads templates at runtime, so when templates gain new sections, this skill detects them automatically without any code changes.

## When to Use

- Immediately after upgrading the nmg-sdlc plugin on a project that still uses the legacy `.codex/steering/` and `.codex/specs/` layout (these paths are now refused by Codex).
- When steering docs or specs were created with an older plugin version.
- To check whether project files are up to date with current standards.

## Unattended Mode

Read `../../references/unattended-mode.md` when applying defaults without prompts. This skill applies **non-destructive changes automatically** in unattended mode and **skips destructive operations** (which require interactive approval).

| Class | Examples | Unattended-mode behaviour |
|-------|----------|---------------------------|
| Non-destructive | Legacy directory relocation, exclusions-file rename, steering doc section additions, spec section additions, Related Spec corrections, frontmatter migration (`Issue` → `Issues`, Change History additions), runner config key additions, CHANGELOG fixes, VERSION updates, solo `feature-`/`bug-` renames, managed contribution-guide creation or update, README contribution-link insertion | Auto-applied; recorded in the Step 9 summary |
| Destructive | Spec directory consolidation, legacy spec-directory deletes (Steps 4b–4e) | Skipped; recorded under "Skipped Operations (Unattended-Mode)" |
| Informational only | Config value drift (Step 5) | Reported in summary but NOT applied — value updates may represent intentional customizations and require explicit per-value approval |

When `.codex/unattended-mode` does NOT exist, all interactive behavior is preserved unchanged — present all findings via `request_user_input` gate per Step 8.

## What Gets Analyzed

```
.codex/steering/                   — Legacy steering directory (relocated in Step 1.5)
.codex/specs/                      — Legacy spec directory (relocated in Step 1.5)
.codex/migration-exclusions.json   — Legacy exclusions file (renamed in Step 1.5 to upgrade-exclusions.json)
steering/*.md                       — Steering docs (product, tech, structure, retrospective)
specs/*/{requirements,design,tasks}.md — Spec files (feature + defect variants)
specs/*/                            — Spec directory naming (legacy `{issue#}-{slug}` vs feature-/bug-)
specs/feature-*/*.md                — Spec frontmatter format (`**Issue**` → `**Issues**`, Change History)
.codex/upgrade-exclusions.json     — Declined sections (read to skip, written after user declines)
sdlc-config.json                    — SDLC runner config (key merge + value drift)
CHANGELOG.md                        — Changelog format and completeness (Keep a Changelog)
VERSION                             — Single source of truth for project version
CONTRIBUTING.md                     — Managed non-destructive contribution guide
README.md                           — Existing README gets an idempotent contribution-guide link when present
```

`feature.gherkin` files are NOT analyzed — they are generated, not templated.

Read `../../references/spec-frontmatter.md` when validating or migrating any spec file's frontmatter — Step 4 and Step 4f both depend on the canonical conventions documented there.

Read `../../references/contribution-guide.md` when analyzing or applying contribution-guide findings — the shared contract defines managed `CONTRIBUTING.md` creation/update, existing guide preservation, README-link insertion, steering-derived content, unattended behavior, and summary statuses.

---

## Workflow

**Before Step 1:** Check whether `.codex/unattended-mode` exists in the project root. Set an unattended-mode flag for the entire session — re-reading the file at each branch point would invite drift.

### Step 1: Resolve Template Paths

Locate the template directories from the installed plugin. Use this skill's own file path to resolve paths relative to the plugin root:

- **Steering templates**: `../onboard-project/templates/*.md` — `product.md`, `tech.md`, `structure.md`.
- **Retrospective template**: `../run-retro/templates/retrospective.md` → `steering/retrospective.md`.
- **Spec templates**: `../write-spec/templates/*.md` — `requirements.md`, `design.md`, `tasks.md`.
- **Config template**: `scripts/sdlc-config.example.json` (resolved from the plugin root).

Use file discovery to find the skill's own `SKILL.md` path, then resolve `../..` to get the plugin root. Read all template files. If a template file cannot be found, skip that category and note it in the summary.

### Step 1.5: Detect And Relocate Legacy Layout

Read `references/detection.md` when this step runs — the detection signals, preflight checks, interactive proposal, and post-conditions live there. Skip the rest of this section and proceed to Step 2 once `detection.md` returns.

### Step 2: Scan Project Files

file discovery for existing project files using the new canonical paths:

```
steering/*.md
specs/*/requirements.md
specs/*/design.md
specs/*/tasks.md
sdlc-config.json
CONTRIBUTING.md
README.md
```

Analyze existing files by default. Missing files may be created only when the current upgrade contract names them as managed, non-destructive project artifacts. `CONTRIBUTING.md` is managed; create or update it only through `../../references/contribution-guide.md` after steering docs exist. Do not synthesize unrelated project files, and never create a missing `README.md`.

### Step 3: Analyze Steering Docs

For each existing steering doc (e.g., `steering/product.md`):

1. **Read the template file** (e.g., `../onboard-project/templates/product.md`).
2. **Extract template content** — steering templates from `onboard-project/templates/` wrap their content in a ` ```markdown ... ``` ` code block; parse only the content between the opening ` ```markdown ` and the closing ` ```. The retrospective template (`run-retro/templates/retrospective.md`) is direct markdown — use the file content as-is.
3. **Parse headings** — extract all `## ` headings from both the template content and the existing project file.
4. **Diff headings** — identify headings present in the template but absent from the project file.
5. **Filter by relevance** — for each missing heading, check whether it matches a keyword in the **Relevance Heuristic Table** in `references/upgrade-procedures.md`. If it matches, use file discovery to check the project codebase for the associated evidence patterns. If **no evidence is found**, exclude the section from the proposal. If the heading does **not match any keyword** (unknown section), **conservatively include it** — let the user decide.
6. **Filter by exclusions** — read `.codex/upgrade-exclusions.json` from the project root (if it exists). If the file exists but contains invalid JSON, treat it as empty (log a warning and proceed). If the current file's name (e.g., `tech.md`) appears in `excludedSections` and the missing heading text appears in that array, skip the section — it was previously declined by the user.
7. **Extract missing sections** — for each remaining missing heading, extract the full section content from the template (from the `## ` heading to the next `## ` heading or end of content).
8. **Determine insertion point** — insert after the predecessor heading in template order. If the template order is `## A`, `## B`, `## C` and `## B` is missing, insert it after the `## A` section's content.

Read `references/upgrade-procedures.md` when you need the **Relevance Heuristic Table** (keyword-to-glob mapping) or the **Exclusion File Schema** (`.codex/upgrade-exclusions.json` format).

### Step 4: Analyze Spec Files

For each spec file (`requirements.md`, `design.md`, `tasks.md`) in each spec directory:

1. **Detect the variant** — read the first `# ` heading:
   - **Feature variant**: `# Requirements:`, `# Design:`, `# Tasks:`.
   - **Defect variant**: `# Defect Report:`, `# Root Cause Analysis:`, `# Tasks:` with a flat summary table (Task/Description/Status columns).

2. **Extract the correct template variant** — each spec template file contains two code blocks:
   - **First ` ```markdown ``` ` block** = feature variant.
   - **Second ` ```markdown ``` ` block** (after `# Defect` heading) = defect variant.

   Select the block matching the detected variant.

3. **Same heading-diff logic as Step 3** — parse `## ` headings, identify missing, extract section content, determine insertion point.

**Variant detection rules for `tasks.md`** (both variants start with `# Tasks:`):
- Summary table columns `Phase | Tasks | Status` → feature variant.
- Summary table columns `Task | Description | Status` → defect variant.

Skip `feature.gherkin` files entirely — they are generated, not templated.

### Step 4a: Validate Related Spec Links

For each **defect spec** found in Step 2 (identified by a `# Defect Report:` first heading), read the `**Related Spec**:` field and validate it:

1. **Check target exists** — verify the target directory exists and contains a `requirements.md`.
2. **Check target is a feature spec** — read the target's first heading:
   - `# Requirements:` → valid feature spec link. No action needed.
   - `# Defect Report:` → target is another defect spec. Follow its `Related Spec` link recursively (maintaining a visited set to detect cycles) until reaching a `# Requirements:` heading or a dead end.
3. **Record findings** for each invalid link:
   - **Current link**: the path in the defect spec's `Related Spec` field.
   - **Suggested correction**: the resolved root feature spec path, or `N/A — no feature spec found` if the chain is circular or broken.
4. **Skip** defect specs that have no `Related Spec` field or whose `Related Spec` is already `N/A`.

### Steps 4b–4f: Legacy Spec-Directory Migration

Read `references/migration-steps.md` when any legacy `{issue#}-{slug}` directories were detected in Step 2 or any feature specs still carry singular `**Issue**` frontmatter — the five sub-steps (detect, cluster, present, apply, frontmatter migration) live there.

### Steps 5–7: Config, CHANGELOG, and VERSION Analysis

Read `references/verification.md` when reaching Steps 5, 6, or 7 — the analysis logic for `sdlc-config.json` (key merge + value drift), `CHANGELOG.md` (Keep a Changelog reconciliation), and `VERSION` (semver consistency) lives there.

### Step 7a: Analyze Contribution Guide

Apply `../../references/contribution-guide.md` as a managed-artifact analysis after steering docs have been scanned. Record findings for:

1. Missing `CONTRIBUTING.md` when steering exists.
2. Existing `CONTRIBUTING.md` missing nmg-sdlc issue/spec/steering coverage.
3. Existing `README.md` missing a link to `CONTRIBUTING.md`.
4. Missing `README.md`, recorded as `README.md link: skipped (README missing)` without creating the file.

Treat missing-guide creation, targeted guide-section insertion, and README-link insertion as non-destructive managed-artifact changes. If steering is incomplete, skip guide changes and record the missing steering docs as gaps.

### Step 8: Present Findings

Display a per-file summary of all proposed changes grouped by category — Legacy Layout Relocation (Step 1.5), Steering Docs (Step 3), Spec Files (Step 4), Spec Directory Consolidation (Step 4b–4e), Spec Frontmatter Migration (Step 4f), Runner Config (Step 5 keys), Config Value Drift (Step 5 scalars), Related Spec Links (Step 4a), CHANGELOG (Step 6), VERSION (Step 7), and Contribution Guide (Step 7a). If everything is up to date, report `Everything is up to date — no upgrade needed.` and stop.

The approval flow has four parts:

**If `.codex/unattended-mode` exists:** Skip Parts A/B/C/D approval prompts. Auto-select all proposed steering doc sections (equivalent to selecting all). Auto-approve all non-destructive changes (legacy layout relocation already applied in Step 1.5, solo renames already applied in Step 4d). Record any remaining destructive operations as skipped operations. Config value drift is reported but NOT applied — skip Part C entirely. Proceed directly to Step 9.

**If `.codex/unattended-mode` does NOT exist:** Follow the interactive approval flow below.

#### Part A: Steering doc sections (per-section approval)

If there are proposed steering doc sections, present a `request_user_input` gate with options to apply all proposed sections, decline all proposed sections, or choose a subset through the free-form `Other` answer. List each section in the Plan Mode context before the gate using labels like `tech.md: Testing Standards` plus a brief intent. Sections the user does **not** select are treated as declined and persisted in Step 9. Skip Part A if all sections were filtered.

#### Part B: Spec directory consolidations and other batched changes

Per-group `request_user_input` gate for each spec directory consolidation or rename from Steps 4b–4e (`Yes, consolidate` / `Skip — leave as-is`); a free-form `Other` answer is treated as "Skip" with the text persisted as the reason. For spec frontmatter migrations, spec file sections, Related Spec corrections, runner config keys, CHANGELOG fixes, VERSION changes, or contribution-guide/README-link changes, ask as a single batch (`Yes, apply all` / `No, cancel`); a free-form `Other` answer is treated as a request to narrow the batch, then the batch is re-presented. Skip Part B if there are no non-steering changes.

#### Part C: Config value drift (per-value approval)

If Step 5 found drifted scalars, present a `request_user_input` gate with options to apply all drifted scalar values, decline all, or choose a subset through the free-form `Other` answer. List each scalar in the Plan Mode context before the gate using labels like `dotted.key.path: current → template` plus brief context about the key's purpose. Unselected values are left unchanged — drift is re-evaluated every run (no exclusions persistence for drift). Skip Part C if no drift was found.

#### Part D: Recommended runner defaults diff (batch approve)

This flow is additive — Parts A/B/C are unchanged. Part D specifically surfaces changes to the per-step `model` / `effort` / `timeoutMin` defaults so users upgrading across plugin versions can adopt the shipped recommendations without clicking through each field individually.

1. **Build the diff** for each step in `steps.*` against `scripts/sdlc-config.example.json`. Include only fields where the user's value differs from (or inherits a value different than) the shipped example. Present unset/inherited values as `(unset — inherited "<global>")` so the source of each value is visible.
2. **Present the diff** in a single `request_user_input` gate with three options:
   - `Apply all recommended defaults`.
   - `Review each field individually (falls back to Part C behavior)`.
   - `Decline — keep my current values`.
3. **Apply on approval** updates each listed field via Codex editing, preserving JSON formatting. "Review individually" falls through to Part C. "Decline" leaves values unchanged. A free-form `Other` answer is treated as "Review each field individually" with the text used to preselect or exclude named fields when possible.
4. **Unattended mode**: Part D is **not** applied — the diff is recorded in the upgrade summary under "Recommended defaults (not applied)". Automatic runs never overwrite user-configured values.

### Step 9: Apply Changes

Read `references/upgrade-procedures.md` when applying Step 9 changes — the detailed apply procedures live there. In summary:

1. **Legacy layout relocation** — already applied in Step 1.5 (directory moves via `git mv`, cross-reference rewrites, exclusions-file rename). Note in summary for visibility.
2. **Spec directory consolidation** — apply merges from Step 4e (create directories, merge files, update cross-references, remove legacy directories).
3. **Spec frontmatter migration** — apply updates from Step 4f (replace `**Issue**:` → `**Issues**:`, insert Change History sections).
4. **Markdown files** — insert missing sections after their predecessor heading using Codex editing. Add `---` separator matching file style. Re-read to verify.
5. **Related Spec corrections** — replace `**Related Spec**:` lines with resolved feature spec paths.
6. **JSON config** — add missing keys only; never overwrite existing values.
7. **Config value drift updates** — for each user-selected drifted value from Part C (interactive only; skipped in unattended): read, Codex editing to replace the old value with the template default, re-read to verify. Preserve all unselected values.
8. **Contribution guide** — apply approved or unattended-managed `CONTRIBUTING.md` creation/update and README-link insertion through `../../references/contribution-guide.md`; re-read both files when present and record `created`, `updated`, `already present`, `added`, or `skipped` statuses.
9. **Persist declined sections** — if interactive, save unselected steering doc sections to `.codex/upgrade-exclusions.json`. Skip in unattended mode.
10. **Output summary** — report changes applied (including contribution-guide outcomes, drift updates, and the legacy layout relocation), declined, skipped, and filtered sections with recommendations.
11. **Skipped Operations (Unattended-Mode)** — if running unattended and any destructive operations were skipped, emit a machine-readable block:

    ```
    ## Skipped Operations (Unattended-Mode)

    The following destructive operations were skipped because `.codex/unattended-mode` is active.
    Run `$nmg-sdlc:upgrade-project` interactively to apply them.

    | Operation Type | Affected Paths | Reason |
    |---------------|----------------|--------|
    | consolidation | `42-add-dark-mode/` + `71-dark-mode-toggle/` → `feature-dark-mode/` | Destructive operation requires interactive approval |
    ```

    Omit this section if no destructive operations were skipped.

---

## Key Rules

1. **Never modify existing content** — only insert new sections or add new keys.
2. **Create only managed non-destructive files** — `CHANGELOG.md`, `VERSION`, `.codex/upgrade-exclusions.json`, and `CONTRIBUTING.md` may be created when missing under their documented contracts. Do not synthesize unrelated project files, and never create a missing `README.md`.
3. **Never overwrite values** — for JSON, only add absent keys. Exception: config value drift updates are applied only with explicit per-value user approval (Step 8 Part C); in unattended mode, value updates are never applied.
4. **Skip `feature.gherkin`** — generated, not templated.
5. **Interactive by default** — when `.codex/unattended-mode` is absent, present findings with per-section approval for steering docs and wait for user selection before applying.
6. **Unattended-mode aware** — auto-apply all non-destructive changes; skip destructive operations and report them.
7. **Self-updating** — read templates at runtime; never hardcode template content.
8. **Filter irrelevant sections** — use codebase analysis to exclude sections with no evidence of relevance; persist user declines in `.codex/upgrade-exclusions.json` (interactive only).
9. **Conservative defaults** — when a missing section's heading doesn't match any keyword in the heuristic table, include it and let the user decide.
10. **Preserve runtime artifacts** — never relocate `.codex/unattended-mode` or `.codex/sdlc-state.json`; only the exclusions file is renamed.

---

## Integration with SDLC Workflow

Run this skill periodically after plugin updates to keep project files current:

```
$nmg-sdlc:onboard-project (one-time)
         ↓
$nmg-sdlc:upgrade-project (after plugin updates)
         ↓
$nmg-sdlc:draft-issue  →  $nmg-sdlc:start-issue  →  $nmg-sdlc:write-spec  →  $nmg-sdlc:write-code  →  $nmg-sdlc:simplify  →  $nmg-sdlc:verify-code  →  $nmg-sdlc:open-pr  →  $nmg-sdlc:address-pr-comments
```

Next step: Once the upgrade completes, resume your normal SDLC workflow — run `$nmg-sdlc:draft-issue` for new work or `$nmg-sdlc:start-issue` to pick up an existing issue.
