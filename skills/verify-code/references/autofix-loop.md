# Auto-Fix Loop

**Consumed by**: `verify-code` Step 6 (after Steps 3–5 have produced findings).

Step 6 works through every finding discovered in Steps 3–5 and tries to fix it before generating the final report. The loop's job is to keep the PR mergeable without silently papering over problems the reviewer needs to see — so the loop fixes what it can, defers what it cannot, and records every routing decision so the invariant that skill-bundled files only change through `$skill-creator` is auditable.

## 6a. Prioritize and Fix

Process findings in severity order: **Critical → High → Medium → Low**.

For each finding:

1. Locate the relevant code via file discovery / text search.
2. **Classify the finding** using the SKILL-BUNDLED FILE DETECTOR below — does this finding touch a skill-bundled file?
3. If skill-bundled, route the fix through `$skill-creator` per the Skill-Creator Probe Contract below. Otherwise, apply the fix using normal Codex editing.
4. Verify the fix addresses the finding.
5. Record: original issue, location, fix applied, and routing path (`skill-creator` vs. `direct`) in the Fixes Applied table.

### SKILL-BUNDLED FILE DETECTOR

A finding is classified as **skill-bundled** when ANY of the following signals is present:

- **Path signals** — the affected file path matches any of:
  - `**/skills/*/SKILL.md`
  - `**/skills/*/references/**`, `**/skills/*/scripts/**`, `**/skills/*/templates/**`, `**/skills/*/checklists/**`, `**/skills/*/assets/**`
  - `references/**` at the plugin or repo root (cross-skill shared references)
  - `**/agents/*.md` (plugin prompt contracts consumed by skills)
- **Description signals** — the finding summary, issue title, or issue body contains `skill`, `SKILL.md`, `skill definition`, `skill reference`, or `skill bundle` (case-insensitive, word-boundary match — `skills` matches, `skillet` does not).

Detection is deliberately conservative — any single signal triggers routing (false-positive preferred over false-negative). Non-skill-bundled findings skip the probe entirely and are fixed with direct Codex editing.

### Skill-Creator Probe Contract

1. **Probe for availability** — treat the `skill-creator` skill as available if ANY of the following is true:
   - file discovery finds `~/.codex/skills/skill-creator/SKILL.md`
   - file discovery finds `~/.codex/plugins/**/skills/skill-creator/SKILL.md`
   - The available-skills list in your system reminder advertises a skill named `skill-creator` (or `*:skill-creator`)
2. **If available**: invoke `$skill-creator` to apply the fix, passing the finding summary, the target file path, the existing file content, and a pointer to `steering/` for project conventions. Let `$skill-creator` update the file — never edit a skill-bundled file directly.
3. **If unavailable**: there is no hand-edit fallback — skill-bundled files must route through `$skill-creator`.
   - **Interactive mode**: surface the missing dependency to the user — `$skill-creator is required to fix skill-bundled findings but is not installed. Install it and re-run $nmg-sdlc:verify-code.` Stop the workflow.
   - **Unattended mode**: emit `ESCALATION: $skill-creator is required for skill-bundled file fixes — install it before re-running` and exit non-zero so the SDLC runner reports the escalation.

Cache the probe result for the duration of the verify-code run so the escalation is emitted at most once per run. The probe is a filesystem / system-reminder check, not a `request_user_input` gate — unattended-mode behaviour is preserved.

If `$skill-creator` is available but errors or reports failures, record those as additional findings to fix in the current 6a cycle — do not silently swallow them.

The Fixes Applied table in the verification report records the routing path taken for each fix so reviewers can confirm the skill-authoring invariant was honoured.

## 6a-bis. Simplify After Fix

If at least one fix was applied in 6a, run bundled `$nmg-sdlc:simplify` over the files just modified to ensure the fix itself is clean before re-testing. If no fixes were applied in 6a, skip this sub-step entirely (no Codex turn consumed).

### Bundled Simplify Invocation

Invoke `$nmg-sdlc:simplify` on the files touched by fixes in 6a. Apply any returned behavior-preserving changes before proceeding to 6b.

If `$nmg-sdlc:simplify` errors or reports failures, record those as additional findings to fix in the current 6a cycle — do not silently swallow them.

Unattended-mode behaviour is preserved — this sub-step is not a `request_user_input` gate.

## 6b. Run Tests After Fixes

Reference `steering/tech.md` for the project's test command. Run the full test suite and fix any regressions introduced by the fixes.

## 6c. Re-verify Changed Areas

Re-check modified files against acceptance criteria and architecture checklists. Update scores if fixes improved them.

## 6d. Handle Unfixable Findings

Fix findings that can be resolved in roughly 20 lines of change or fewer. Defer findings that would require architectural changes, new dependencies, or modifications outside the feature's scope.

If a finding cannot be safely fixed (e.g., requires spec clarification, would change scope, or risks breaking unrelated functionality):

1. Document why it cannot be fixed now.
2. Categorise as **Deferred** in the report.

## Fix Rules

| Rule | Detail |
|------|--------|
| Follow the spec | Fixes must not contradict requirements.md or design.md |
| Follow steering docs | Reference tech.md and structure.md for conventions |
| Match code style | Mirror the patterns already used in the codebase |
| One finding at a time | Fix, verify, then move to the next |
| Test after each batch | Run the test suite after each group of related fixes |
| No scope changes | Do not add features or refactor beyond the finding |
