# ADR Aging Scan

**Consumed by**: `run-retro` Step 1.6 (only when `docs/decisions/` exists).

## Scan Procedure

### 1. Discover ADR files

```bash
Glob: docs/decisions/*.md
```

Collect all `.md` files found. If the directory exists but is empty, emit nothing — the "Re-Spike Candidates" section is omitted when no candidates exist (see Output section below).

### 2. Determine each ADR's commit date

For each ADR file, run:

```bash
git log --follow --format=%aI -- {file}
```

Take the **last line** of the output — this is the authorship date of the commit that first added the file (oldest entry in the log). The `%aI` format produces an ISO 8601 timestamp (e.g., `2025-10-12T14:23:45-07:00`).

If `git log` returns no output for a file (e.g., the file exists but has never been committed), treat its age as 0 days — it is not a re-spike candidate.

### 3. Compute age in days

```
age_days = (today - commit_date).days
```

Use the date component of the ISO 8601 timestamp. Today's date is read from the system clock at the time of the retro run. Cross-platform: parse `commit_date` as ISO 8601 with timezone, normalize to UTC, compare to today's UTC date.

### 4. Flag re-spike candidates

ADRs where `age_days > 180` are re-spike candidates.

For each candidate, extract a **decision summary** from the ADR body:
- Prefer the content of a `## Recommendation` section (the spike-researcher output contract places the decision there).
- Fall back to the first non-blank paragraph of the ADR body if no `## Recommendation` section exists.
- Truncate to 120 characters for the retrospective table; append `…` if truncated.

---

## Output Section

Append the following section to `steering/retrospective.md` **after** the existing retrospective content (do not replace existing sections):

```markdown
## Re-Spike Candidates

ADRs older than 180 days that may benefit from re-evaluation.

| ADR | Age (days) | Original Decision Summary |
|-----|------------|---------------------------|
| docs/decisions/2025-10-12-auth-gap-analysis.md | 194 | Chose session cookies over JWT for the API gateway |
| docs/decisions/2025-09-01-db-gap-analysis.md | 235 | Selected PostgreSQL over DynamoDB for relational data |
```

**Omit the section entirely** when no ADRs are older than 180 days. Do not emit an empty table or a "no candidates" placeholder — silence is the correct output when all ADRs are fresh.

---

## Graceful Degradation

| Condition | Behavior |
|-----------|-----------|
| `docs/decisions/` does not exist | Step 1.6 does not load this reference; scan is skipped |
| `docs/decisions/` exists but is empty | Scan runs; no candidates found; section omitted |
| `git log` returns no output for a file | Treat age as 0 days; file is not a candidate |
| ADR body has no `## Recommendation` section | Fall back to first non-blank paragraph; truncate to 120 chars |
| `git log` command fails (not a git repo) | Warn `ADR aging scan skipped — git log unavailable`; omit section |
