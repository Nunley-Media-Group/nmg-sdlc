# Upgrade Procedures Reference

Detailed apply rules for findings already accepted through `upgrade-project`'s interactive plan. Never apply an unapproved category or path.

## Relevance Heuristic Table

For each missing steering heading, match heading keywords case-insensitively and check the associated patterns one at a time, stopping on the first match.

| Heading Keyword | Codebase Evidence |
|----------------|-------------------|
| `Database` | `**/migrations/**`, `**/schema.*`, `**/*database*`, `**/*.sql`, `**/models/**` |
| `API / Interface Standards` | `**/routes/**`, `**/controllers/**`, `**/api/**`, `**/endpoints/**`, `**/*router*`, `**/openapi*` |
| `Design Tokens` or `UI Standards` | `**/components/**`, `**/*.css`, `**/*.scss`, `**/theme*`, `**/tokens*`, `**/*.tsx`, `**/*.vue`, `**/*.svelte` |

If a known heading has no matching evidence, filter it from the proposal. Include unknown headings conservatively so the user decides.

## Exclusion File Schema

`.codex/upgrade-exclusions.json` stores steering sections the user explicitly declined:

```json
{
  "excludedSections": {
    "tech.md": ["Database Standards"],
    "structure.md": ["Design Tokens / UI Standards (if applicable)"]
  }
}
```

Preserve existing entries. Add only newly declined exact heading text; never infer a decline from silence or timeout.

## Apply Markdown Findings

For each approved steering or spec section:

1. Re-read the target.
2. Insert the template section after its predecessor in template order.
3. Match the target's separator style.
4. Re-read and confirm the exact heading exists once.

For each approved Related Spec correction, replace only the `**Related Spec**:` line. For approved frontmatter changes, follow `../../references/spec-frontmatter.md`. Directory consolidation and rename behavior remains in `migration-steps.md` and must use only its separately approved source/target set.

## Apply Managed Repository Assets

### Contribution guide

Follow `../../references/contribution-guide.md`:

1. Require all three steering docs.
2. Create a missing `CONTRIBUTING.md` or append only the missing managed workflow section.
3. Preserve existing project policy.
4. Add an idempotent README link when a README exists; never create a README just for the link.
5. Re-read changed files and emit the shared stable status block.

### Project AGENTS

Follow `../../references/project-agents.md`:

1. Create a missing root `AGENTS.md` with the managed spec-context section.
2. Insert or refresh only the marked managed section.
3. Preserve all project-authored bytes outside the managed section.
4. Repair malformed markers only as the shared contract permits.
5. Re-read and emit the shared stable status block.

### Contribution gate

Follow `../../references/contribution-gate.md`:

1. Create a missing marked workflow at `.github/workflows/nmg-sdlc-contribution-gate.yml`.
2. Replace an older marked managed version with the current template.
3. Preserve a current or future managed version according to the shared contract.
4. Preserve an unmarked path collision and report it.
5. Preserve every unrelated workflow byte-for-byte.

### Issue form

Follow `../../references/issue-form.md`:

1. Read the canonical plugin issue form.
2. Create a missing target or replace only `.github/ISSUE_TEMPLATE/nmg-sdlc-ready-issue.yml` when it differs.
3. Preserve every unrelated issue template and workflow byte-for-byte.
4. Re-read and emit the shared stable status block.

## Apply V2 Runner Artifact Cleanup

Apply only the exact deletion batch accepted in the final plan.

### Exact file deletion

For each approved path among `sdlc-config.json`, `.codex/unattended-mode`, and `.codex/sdlc-state.json`:

1. Re-check path metadata with `lstat` semantics; do not follow symlinks.
2. If absent, record `already clean`.
3. If it is no longer a regular file, preserve it as unmanaged and report the object type.
4. Delete only that exact regular file.
5. Re-check absence. On failure, record `failed (<reason>)` for that path and do not retry with recursive or broader deletion.

Never read any of the three file contents. In particular, never inspect, print, execute, kill, or signal anything referenced by `.codex/sdlc-state.json`.

### `.gitignore` edit

1. Re-read `.gitignore`; if the read fails, do not edit it.
2. Reconfirm each approved line still has the exact text, line location, and recognized block header from the accepted proposal.
3. Remove only exact approved owned entries within that block.
4. Preserve matching entries outside recognized blocks and preserve all unknown block lines.
5. Remove the recognized header only if its block becomes empty after the approved removals.
6. Collapse at most the single blank line made redundant by removing an empty managed block; do not reformat other whitespace.
7. Re-read and verify all unrelated lines are byte-for-byte unchanged.

If concurrent edits invalidate an approved line's location or ownership context, stop editing `.gitignore` and report a stale-finding gap. Never rediscover a wider deletion set during apply.

### Idempotence check

Re-run the cleanup analysis after apply. All removed exact paths and owned managed entries must report `already clean`; preserved unmanaged matches must remain unchanged. A second application must produce no diff.

## Persist Declined Steering Sections

After applying approved changes:

1. Read `.codex/upgrade-exclusions.json`, or start with `{ "excludedSections": {} }`.
2. Add each explicitly declined steering heading to its file's array.
3. Preserve all existing entries and unrelated keys.
4. Write formatted JSON with 2-space indentation and verify it parses.

## Output Summary

Report:

```text
## Upgrade Complete

### Changes Applied
- <exact file and change>

### Declined
- <exact finding preserved by user choice>

### Skipped (already current)
- <exact artifact>

### Preserved (unmanaged)
- <exact path or .gitignore line>

### Filtered by relevance
- <file and heading>

### Failures
- <exact path and reason>
```

Append the shared managed-asset status blocks and the exact Runner Artifact Cleanup block from `SKILL.md`. Recommend reviewing inserted template placeholders and explain that declined steering sections can be re-proposed by removing their exact entry from `.codex/upgrade-exclusions.json`.
