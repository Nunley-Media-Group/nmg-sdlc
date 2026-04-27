# Upgrade Procedures Reference

Detailed reference material for the upgrade-project skill.

---

## Relevance Heuristic Table

Use this table to determine whether a missing template section is relevant to the project. For each missing heading, check if it matches a keyword (case-insensitive substring match against the heading text). If it matches, run file discovery with the associated patterns **one at a time, stopping at the first match** — if any pattern returns results, the section is relevant (include it) and skip remaining patterns. If **none** return results, the section is irrelevant — exclude it.

| Heading Keyword | Codebase Evidence (File discovery patterns) |
|----------------|----------------------------------|
| `Database` | `**/migrations/**`, `**/schema.*`, `**/*database*`, `**/*prisma*`, `**/*knexfile*`, `**/sequelize*`, `**/typeorm*`, `**/drizzle*`, `**/*.sql`, `**/models/**` |
| `API / Interface Standards` | `**/routes/**`, `**/controllers/**`, `**/api/**`, `**/endpoints/**`, `**/*router*`, `**/swagger*`, `**/openapi*` |
| `Design Tokens` or `UI Standards` | `**/components/**`, `**/*.css`, `**/*.scss`, `**/*.styled.*`, `**/theme*`, `**/tokens*`, `**/*.tsx`, `**/*.vue`, `**/*.svelte` |

**Conservative default:** If a missing heading does not match any keyword in this table, include it in the proposal. The table is a filter for known-irrelevant sections, not a whitelist.

---

## Exclusion File Schema

The `.codex/upgrade-exclusions.json` file stores section headings the user has previously declined:

```json
{
  "excludedSections": {
    "tech.md": ["Database Standards", "API / Interface Standards"],
    "structure.md": ["Design Tokens / UI Standards (if applicable)"]
  }
}
```

- Keys are steering doc filenames (not full paths)
- Values are arrays of exact heading text (without the `## ` prefix)
- Only sections explicitly declined by the user are stored
- Stale entries (for headings removed from templates) are harmless

---

## Step 9: Apply Changes

If the user approves:

### Markdown files (steering docs and specs)

For each file with missing sections:

1. Read the file
2. For each missing section (in template order):
   - Find the predecessor section's heading in the file
   - Locate the end of the predecessor section (the line before the next `## ` heading, or end of file)
   - Use Codex editing to insert the missing section content (including `---` separator and `## ` heading) after the predecessor section
3. After all insertions, re-read the file to verify the new headings are present

**Insertion format:** Insert a blank line, then `---`, then a blank line, then the full section content from the template (heading + body). Match the separator style used in the rest of the file.

### Related Spec corrections

For each defect spec with an approved Related Spec correction (from Step 4a findings):

1. Read the defect spec's `requirements.md`
2. Use Codex editing to replace the `**Related Spec**:` line with the corrected value (the resolved feature spec path, or `N/A`)

### JSON config

For the `sdlc-config.json`:

1. Read the current file
2. For each missing root-level key, add it with the template default value
3. For each missing step entry, add it with the template default values
4. For each existing step with missing sub-keys, add the missing sub-keys
5. Write the updated JSON (preserve existing values, only add missing keys)
6. Use Codex editing to add the missing keys — do not overwrite the entire file

### Runner Config Path Refresh

Apply approved or unattended-managed Runner Config Path Refresh findings from `verification.md` separately from generic value drift:

1. Read `sdlc-config.json` as JSON.
2. For each approved path-refresh finding, verify the replacement root still contains `.codex-plugin/plugin.json`, `skills/`, and `scripts/sdlc-runner.mjs`.
3. If the selected stale field was `pluginRoot`, replace only `pluginRoot` with the verified replacement root.
4. If the selected stale field was `pluginsPath`, add or replace `pluginRoot` with the verified replacement root and leave `pluginsPath` unchanged. The runner's existing precedence makes `pluginRoot` the selected path without destroying legacy config.
5. Preserve every unrelated key and value, including project path, model, effort, timeouts, retries, cleanup, log settings, and user-added fields.
6. Write the updated JSON with 2-space indentation.
7. Re-read `sdlc-config.json` and verify the selected runner root now passes the plugin-root shape check.
8. If the replacement root no longer validates, skip the edit and record the no-replacement gap instead of writing a partial config.

### Contribution guide

Apply approved or unattended-managed findings from `../../references/contribution-guide.md`:

1. Verify `steering/product.md`, `steering/tech.md`, and `steering/structure.md` exist before writing guide content.
2. If `CONTRIBUTING.md` is missing, create the root guide using the shared reference's default structure and steering-derived, stack-agnostic expectations.
3. If `CONTRIBUTING.md` exists but lacks nmg-sdlc issue/spec/steering coverage, append only `## nmg-sdlc Contribution Workflow` and preserve all existing content.
4. If equivalent guide coverage is already present, leave the file unchanged and report `CONTRIBUTING.md: already present`.
5. If `README.md` exists without a `CONTRIBUTING.md` link, insert a concise link in an existing setup/contribution section or append a small `## Contributing` section.
6. If `README.md` is missing, do not create it; report `README.md link: skipped (README missing)`.
7. Re-read changed files and emit the stable status block:

   ```text
   Contribution Guide:
   - CONTRIBUTING.md: created | updated | already present | skipped (<reason>)
   - README.md link: added | already present | skipped (README missing)
   - Gaps: none | <comma-separated gaps>
   ```

### Contribution gate

Apply approved or unattended-managed findings from `../../references/contribution-gate.md`:

1. Inspect `.github/workflows/nmg-sdlc-contribution-gate.yml`.
2. If the workflow is missing, create `.github/workflows/` and write the shared contract's workflow template.
3. If the workflow contains the nmg-sdlc managed marker and has an older numeric managed version, replace only that workflow with the current template.
4. If the workflow contains the current managed marker/version, leave it unchanged and report `Workflow: already present`.
5. If the workflow contains a future managed version, leave it unchanged and report `Workflow: skipped (newer managed version)`.
6. If the approved path exists without the managed marker, leave it unchanged and report `Workflow: skipped (unmanaged file at path)`.
7. Preserve unrelated workflows under `.github/workflows/` byte-for-byte.
8. Re-read the workflow when present and emit the stable status block:

   ```text
   Contribution Gate:
   - Workflow: created | updated | already present | skipped (<reason>)
   - Path: .github/workflows/nmg-sdlc-contribution-gate.yml
   - Gaps: none | <comma-separated gaps>
   ```

### Config value drift updates

For each user-selected drifted value from Step 9 Part C (interactive mode only; this section is skipped entirely in unattended mode):

1. Read the current `sdlc-config.json`
2. For each selected drifted value, locate the key in the JSON and use Codex editing to replace the old value with the template default value
3. Preserve JSON formatting — use 2-space indentation per project JSON standards
4. After each individual value update, re-read the file to verify the update was applied correctly
5. If a value cannot be found in the file (e.g., the key path changed), skip it and note the failure in the output summary

**Example edit for a step sub-key drift:**
```
Old: "timeoutMin": 15
New: "timeoutMin": 30
```

**Example edit for a root-level drift:**
```
Old: "maxRetriesPerStep": 2
New: "maxRetriesPerStep": 3
```

### Persist declined sections

After applying approved changes, persist any newly declined steering doc sections:

1. Read `.codex/upgrade-exclusions.json` from the project root (or start with `{ "excludedSections": {} }` if it doesn't exist)
2. For each steering doc section that was **proposed but not selected** by the user in Step 9 Part A, add the heading text to the `excludedSections` array for that file
3. Write the updated JSON to `.codex/upgrade-exclusions.json` using Codex editing

**Important:** Only add newly declined sections. Do not remove existing entries — they represent prior user decisions.

### Output summary

After applying changes, output a summary:

```
## Upgrade Complete

### Changes Applied
- **product.md** — Added sections: "Product Principles"
- **sdlc-config.json** — Added keys: "cleanup", "steps.merge"
- **Contribution Guide** — CONTRIBUTING.md: created; README.md link: added
- **Contribution Gate** — Workflow: created at `.github/workflows/nmg-sdlc-contribution-gate.yml`

### Declined (will be skipped in future runs)
- **product.md** — "Brand Voice" (saved to .codex/upgrade-exclusions.json)

### Skipped (already up to date)
- tech.md, structure.md, 42-add-auth/design.md
- Contribution Guide: CONTRIBUTING.md already present; README.md link already present
- Contribution Gate: Workflow already present

### Filtered by relevance (no codebase evidence)
- **tech.md** — "Database Standards", "API / Interface Standards"

### Recommendations
- Review added sections and customize placeholder content
- To re-propose a declined section, remove it from .codex/upgrade-exclusions.json
```
