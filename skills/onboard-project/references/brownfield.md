# Brownfield — Spec Reconciliation From History

**Read this when** Step 1 detects `brownfield` (existing code and closed issues but no specs). The brownfield branch reverse-engineers one spec directory per reconciled feature from the historical record: closed GitHub issues, merged PR diffs, commit messages, and the current implementation.

Read `../../references/unattended-mode.md` when applying auto-accept defaults — the consolidation gate (Step 3B.4) and any other `request_user_input` gate site reads sentinel semantics from there.

Read `../../references/contribution-guide.md` when Step 2B confirms that all three steering docs exist — the shared contract creates or updates `CONTRIBUTING.md`, preserves existing contribution policy, reflects brownfield code/spec context, handles the README link idempotently, and returns status for the Step 5 summary.

Read `../../references/project-agents.md` when Step 2B confirms that all three steering docs exist — the shared contract creates or updates root `AGENTS.md` spec-context guidance, preserves existing project instructions, and returns status for the Step 5 summary.

## Step 2B Preflight

### Step 2B.0a Version File Initialization (Brownfield)

Seed `VERSION` at the project root before the steering bootstrap delegation and before the no-issues handler. Idempotent — existing VERSION and existing manifest versions are both preserved.

1. **Detect stack** — use the same detection order as Step 2G.2a in `references/greenfield.md`: probe via `git ls-files -- <candidate>` for `package.json`, `pyproject.toml`, `Cargo.toml`, `go.mod`, `mix.exs`, `*.gemspec`, `build.gradle`, `pom.xml` (first match wins). Record the matched path (or `null`) for the Step 5 summary.
2. **If `VERSION` exists at project root** — `Read` it, record the current value, emit `VERSION exists (value: <X>) — preserved`.
3. **Else if a stack manifest was detected AND its version field is non-empty** — read the manifest version per the stack manifest read/write rules in `references/greenfield.md` (Step 2G.2a). Codex editing `VERSION` containing `<manifest_version>\n` — mirror byte-for-byte (no semver coercion beyond trailing-whitespace trim). Emit `VERSION backfilled from <path> @ <version>`.
4. **Else** — Codex editing `VERSION` containing `0.1.0\n`. Emit `VERSION created at 0.1.0 (no manifest version to mirror)`.
5. **Do NOT synthesize a stack manifest** — if no manifest exists in the brownfield tree, the project may intentionally have no declared stack (shell scripts, Lua, etc.). Leave that state alone and let VERSION be the single version record.
6. Contribute outcomes to the Step 5 Versioning section. Brownfield never writes the manifest, so line 2 is always `<path> preserved @ <X>` (manifest detected with an existing version) or `no-manifest` (nothing detected) — never `set @ 0.1.0`.

### Step 2B Preflight (continued)

1. Run `gh auth status`. If it fails, abort with a clear message pointing the user at `gh auth login` — do not proceed to reconciliation.
2. If `steering/` is missing or incomplete (fewer than all three of `product.md`, `tech.md`, `structure.md`), run the absorbed steering bootstrap (Step 2G.1 → 2G.2 from `references/greenfield.md`) first to establish the steering docs, then return to Step 2B. Skip Step 2G.2a (VERSION init is already satisfied by 2B.0a above) and 2G.3–2G.6 (milestone and starter-issue seeding are greenfield-only and not appropriate for brownfield). After steering bootstrap returns, re-verify all three files exist before continuing. If still incomplete, record a gap and abort.
3. Apply `../../references/contribution-guide.md` after steering verification succeeds. The guide must mention that existing code and reconciled or source-backfilled specs are part of contribution context, preserve existing guides through targeted insertion only, add an idempotent README link when possible, and record contribution-guide outcomes for Step 5. Missing README is a gap, not an abort.
4. Apply `../../references/project-agents.md` after steering verification succeeds. The guidance must make project-root `specs/` the canonical BDD archive for prompt-level spec requests, preserve existing `AGENTS.md` content outside the managed section, and record AGENTS.md outcomes for Step 5.
5. **Brownfield-no-issues → source-backfill** — if mode detection found zero closed issues, emit `brownfield-no-issues: backfilling from source tree` and proceed to Step 3B in source-backfill mode. No `request_user_input` gate — routing is deterministic. In source-backfill mode, the reconciliation loop synthesizes specs using evidence from `current_source_tree` only (PR-based evidence rows are marked `N/A — source-backfill` in each `design.md`'s Evidence Sources table).
6. Read the four `$nmg-sdlc:write-spec` template files from `../write-spec/templates/`:
   - `requirements.md` — contains both the full feature variant and the lightweight "Defect Requirements Variant" (search for the `# Defect Requirements Variant` heading to locate the defect section)
   - `design.md`
   - `tasks.md` — contains both the phased feature task layout and the flat "Defect Tasks Variant"
   - `feature.gherkin`

   Store their contents in memory for synthesis. Reading templates at runtime — rather than embedding their structure here — keeps this skill aligned with future `$nmg-sdlc:write-spec` template changes automatically. When synthesizing a defect spec, use the Defect variant sections from `requirements.md` and `tasks.md`; for feature specs, use the full variants.

6. Proceed to Step 3B.

## Step 3B Reconciliation Loop

### 3B.1 Fetch Closed Issues

```
gh issue list --state closed --json number,title,body,labels,closedAt --limit 500
```

Pre-filter at the source query (`--state closed`) — do not fetch all issues and filter client-side. Skip any issue closed with reason `duplicate`, `not planned`, or having a `wontfix` label — these yield no useful design evidence; record them in the summary as `skipped (no actionable evidence)`.

**Pagination note**: `--limit 500` is a hard ceiling. If the repository has more than 500 closed issues, the output is silently truncated. Note this in the summary (`Fetched N closed issues; repository may have additional issues beyond the 500-issue limit — re-run with --search or --since filtering to target a subset.`).

Emit progress every ~5 issues so long runs are observable.

### 3B.2 Per-Issue Evidence Gathering

Compute **`current_source_tree`** once at the start of Step 3B (not per-issue) — enumerate tracked source files via `git ls-files`, filtered through the scaffold allowlist (`README.md`, `.gitignore`, `package.json`, `pyproject.toml`, `Cargo.toml`, `go.mod`, `LICENSE`, `LICENSE.md`, `LICENSE.txt`) and excluding hidden directories (`.git/`, `.github/`, `.codex/`) and `node_modules/`. The resulting path list is reused across every issue in the loop; do not re-enumerate per iteration.

For each remaining issue, in this order:

1. **Issue body + comments** — `gh issue view N --json body,comments`
2. **Merged PR** — `gh issue view N --json closedByPullRequestsReferences` to find the PR number; then `gh pr view <prnum> --json body,files,commits,merged` (only if `merged` is true)
3. **PR diff** — `gh pr diff <prnum>`
4. **Commit messages** — from the `commits[].messageHeadline` field in the PR JSON
5. **Current implementation files** — for each path in `pr.files[].path`, use file discovery/`Read` to confirm presence in the working tree
6. **Current source tree** — attach the `current_source_tree` list computed above. This field is **always populated**, even when PR-based evidence is rich, so every reconciled `design.md` is anchored to the present state of the codebase rather than PR-era history alone.

Build the per-issue evidence set in memory as:

```
evidence_set = {
  issue_body,
  pr_body              | null,
  pr_diff              | null,
  commit_msgs          | [],
  touched_files        | [],
  current_source_tree  (always populated, shared across the loop),
}
```

**Discard** the prior issue's per-iteration state before beginning the next — no inter-iteration leakage of `issue_body`/PR data. `current_source_tree` is the single shared exception (it is identical across issues in a run).

If no merged PR is found (`NO_PR`), degrade: keep only evidence sources #1, #5, and #6, mark this spec for a `## Known Gaps` section noting missing PR context, and continue processing. A single reconciliation gap must NOT abort the run.

In **source-backfill mode** (entered from Step 2B bullet 3 when no closed issues exist), the loop iterates once over the synthetic evidence set `{current_source_tree}` — there is no `issue_body` or PR evidence. Reconciled specs in this mode group source files by top-level directory (or by the structure declared in `steering/structure.md` when present) and emit one spec per coherent component. PR-based rows in the `design.md` Evidence Sources table are explicitly marked `N/A — source-backfill` rather than omitted.

### 3B.3 Template Variant Selection

Per issue:

1. If the issue carries a `bug` label → defect template.
2. Else, inspect the title + body for any of these keywords (case-insensitive): `fix`, `bug`, `broken`, `regression`, `crash`, `error`. If any match → defect template.
3. Otherwise → feature template.

Feature specs emit to `specs/feature-{slug}/`; defect specs emit to `specs/bug-{slug}/`.

### 3B.4 Consolidation Grouping

After all issues are classified:

1. Group issues that share a non-trivial label (excluding pipeline-mechanical labels: `enhancement`, `bug`, `automatable`, `good-first-issue`).
2. Additionally group by Jaccard overlap ≥ 0.3 on title tokens, after stop-word filtering (`the`, `a`, `an`, `add`, `fix`, `update`, `remove`, `for`, `to`, `of`, `and`, `or`).
3. Merge overlapping groups transitively (if A groups with B and B groups with C, A/B/C form one group).
4. For each group with ≥ 2 issues, present a consolidation proposal via `request_user_input` gate:

   ```
   Issues #10, #14, #27 share the label "dark-mode" and overlapping keywords ("toggle", "theme").
   Consolidate into one spec?
   [1] Yes — produce one consolidated feature-{slug}/ with all three issue numbers
   [2] No — produce one spec per issue
   ```

5. In unattended mode, auto-accept consolidation (option 1) and log each auto-decision for the summary.
6. Single-issue "groups" (no consolidation candidates) proceed directly to synthesis with no prompt.

### 3B.5 Per-Spec Synthesis

For each approved group (or single issue):

1. **Slugify** the title using strict allowlist `[a-z0-9-]`, collapsing runs of non-allowlisted characters to a single hyphen, trimming leading/trailing hyphens, capping at 60 characters. This is a security boundary — issue content is untrusted.
2. **Check for collision** — if `specs/feature-{slug}/` or `specs/bug-{slug}/` already exists, skip synthesis and record `skipped — spec dir already exists`.
3. **Synthesize all four files in memory** using the templates loaded in 2B.4:
   - **`requirements.md`** — fill user story, background, acceptance criteria, FRs from issue body + PR body. Frontmatter `**Issues**: #N, #M, ...` listing every contributing issue number.
   - **`design.md`** — fill overview, architecture, API/interface changes from PR diff + PR body + commit messages + current code + current source tree. Include an explicit `## Evidence Sources` section listing which of {issue body, PR body, PR diff, commit messages, current code, **current source tree**} contributed to each major section. The `current source tree` row is present for every reconciled spec. In source-backfill mode (no PR evidence available), the PR body, PR diff, and commit-messages rows are marked `N/A — source-backfill`; the current-source-tree row carries the real evidence. If the issue degraded per 3B.2, include a `## Known Gaps` section noting the missing PR.
   - **`tasks.md`** — reverse-engineer phased tasks from PR commits; mark each as complete (`[x]`) since the code has landed. Map each task to the actual files in `pr.files[].path`.
   - **`feature.gherkin`** — derive scenarios from the reconstructed ACs in `requirements.md`. For defect specs, tag each scenario with `@regression`.

4. Embed any diff snippets, PR body excerpts, issue body text, or issue comments inside fenced code blocks — never interpolate untrusted content into Markdown headings or into shell commands. Issue body and comments are user-controlled input and must be treated as untrusted throughout.
5. **If `--dry-run` was passed**, do NOT write files — record `would produce specs/...` for the summary and continue.
6. Otherwise, Codex editing all four files in sequence. If any Codex editing fails mid-sequence, record the partial directory as a gap (no rollback). In the summary, include the instruction: `To re-reconcile this issue, manually delete specs/{slug}/ before re-running $nmg-sdlc:onboard-project.`

## Step 4 Post-Reconciliation Verification

For each spec directory produced in this run (greenfield skips this step — nothing to verify):

1. Verify all four files exist: `requirements.md`, `design.md`, `tasks.md`, `feature.gherkin`. Any missing file is a gap recorded for the summary.
2. Extract referenced file paths from each `design.md`: scan all inline code spans (`` `path/to/file.ext` ``) and fenced code block content within the `## Architecture`, `## API / Interface Changes`, and `## Tasks` sections for tokens matching the pattern `[\w./\-]+\.\w+` (i.e., strings with at least one dot that look like file paths). For each extracted path, use file discovery or `Read` to confirm the file exists in the current working tree. Missing files are gaps — the spec is still kept on disk, not deleted.
3. Verification MUST NOT abort the run on gaps — it records them for Step 5.
