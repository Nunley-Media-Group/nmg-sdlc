# Spec Discovery

**Read this when** the issue is **not** bug-labelled and `/write-spec` needs to decide whether to *amend an existing feature spec* or *create a new one*. Bug-labelled issues skip discovery entirely — they always create a new `bug-{slug}/` and never amend.

Discovery has two stages run in strict order: parent-link resolution first (deterministic, follows the GitHub sub-issue graph and body cross-references), then keyword-based matching as a fallback. The reason for ordering this way is that an explicit parent link is a stronger signal of intent than token overlap — a child issue should never get keyword-matched to the wrong feature when its parent edge already names the right one.

## Step 0: Parent-Link Resolution

Run before keyword discovery. Only fall through to Step 1 when this stage produces no candidates.

1. **Extract body cross-refs.** Run `gh issue view #N --json body` and parse the body for all `Depends on: #NNN` and `Blocks: #NNN` lines using the case-insensitive regex `/(?:Depends on|Blocks):\s*#(\d+)\b/gi`. Collect each match as a candidate parent issue number.
2. **Query the GitHub sub-issue parent field.** Run `gh issue view #N --json parent`. If the `parent` object is non-null and has a numeric `number`, add that number to the candidate set. If `gh` does not support `--json parent` (older CLI), treat the field as null and log a single-line warning: `parent-link resolution: gh version does not expose sub-issue parent field — falling back to body cross-refs only`.
3. **Deduplicate** the candidate set; preserve insertion order for determinism.
4. **Cycle detection.** Maintain a visited-set of issue numbers seeded with the current issue. When resolving transitively (a candidate parent that itself has a parent), abort with a cycle-detected error if the same issue number reappears. If `#A` lists `Depends on: #B` and `#B` lists `Depends on: #A`, writing the spec for either issue aborts with:

   ```
   ERROR: cycle detected in parent-link graph — #A and #B depend on each other. Break the cycle by removing one of the Depends on: lines and re-run /write-spec.
   ```

5. **Match candidates to spec directories.** For each candidate `#P`:
   - `Glob` `specs/*/requirements.md` to enumerate spec directories.
   - For each match, read the file's `**Issues**` frontmatter field (format: `**Issues**: #A, #B, #C`).
   - If `#P` appears in the Issues list, record that spec directory as the resolved parent spec.

6. **Handle the three outcomes:**
   - **Match found** → enter **amendment mode** against the matched spec directory. Append the current issue number to the spec's `**Issues**` frontmatter (comma-separated), add a Change History row with today's date and a one-line summary, and skip directly to Phase 1 using the existing spec as the working document. The amendment-branch steps live in `references/amendment-mode.md`.
   - **Candidate found but no matching spec directory** → abort with the loud failure:

     ```
     ERROR: Parent spec for #P not found — run '/write-spec #P' and seal the spec before starting child work.
     ```

     Do not create any spec files for the child. Exit non-zero in unattended mode (escalate via runner sentinel).
   - **No candidates at all** → fall through to Step 1.

Step 0 is stateless — it derives everything fresh from `gh` state on each invocation. It runs identically in interactive and unattended modes; the only difference is that unattended aborts emit the error to stderr and exit non-zero rather than prompting.

## Step 1: Keyword-Based Discovery (fallback)

1. **Extract keywords** from the issue title: tokenize by spaces, then filter out stop words: `a`, `an`, `the`, `to`, `for`, `in`, `on`, `of`, `and`, `or`, `is`, `it`, `as`, `at`, `by`, `with`, `from`, `this`, `that`, `add`, `fix`, `update`, `implement`, `create`.
2. **Search for existing feature specs**: Run `Glob` for `specs/feature-*/requirements.md` to list candidates.
3. **If no feature specs exist**, skip to the create-new-spec flow in the main workflow.
4. **Score candidates**: For each candidate spec file, run `Grep` using each extracted keyword against the file content. Count total keyword hits per candidate.
5. **Rank and filter**: Sort candidates by total keyword hits. Filter to candidates with at least 2 keyword hits.
6. **If one or more candidates found**:
   - Read the top candidate's first `# ` heading and user story for context.
   - Present to the user via `AskUserQuestion`:
     - Option 1: "Amend existing spec: `feature-{slug}`" (with brief description from heading/user story).
     - Option 2: "Create new spec" (derives a new `feature-{slug}` from the current issue title).
   - **If unattended mode** (`.claude/unattended-mode` exists): skip `AskUserQuestion` entirely and proceed in amendment mode against the top-scored existing spec.
7. **If no candidates found**: proceed to create a new spec without prompting.

The result determines whether subsequent phases operate in **amendment mode** (modifying an existing spec) or **creation mode** (writing a new spec from scratch).
