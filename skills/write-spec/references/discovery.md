# Spec Discovery

**Read this when** the issue is **not** bug-labelled and `$nmg-sdlc:write-spec` needs to decide whether to *amend an existing feature spec* or *create a new one*. Bug-labelled issues skip discovery entirely — they always create a new `bug-{slug}/` and never amend.

Discovery has two stages run in strict order: parent-link resolution first (deterministic, follows the GitHub sub-issue graph and body cross-references), then the bounded metadata ranking contract from `../../references/spec-context.md` as a fallback. The reason for ordering this way is that an explicit parent link is a stronger signal of intent than token overlap — a child issue should never get matched to the wrong feature when its parent edge already names the right one.

## Step 0: Parent-Link Resolution

Run before keyword discovery. Only fall through to Step 1 when this stage produces no candidates.

1. **Extract body cross-refs.** Run `gh issue view #N --json body` and parse the body for all `Depends on: #NNN` and `Blocks: #NNN` lines using the case-insensitive regex `/(?:Depends on|Blocks):\s*#(\d+)\b/gi`. Collect each match as a candidate parent issue number.
2. **Query the GitHub sub-issue parent field.** Run `gh issue view #N --json parent`. If the `parent` object is non-null and has a numeric `number`, add that number to the candidate set. If `gh` does not support `--json parent` (older `gh` versions), treat the field as null and log a single-line warning: `parent-link resolution: gh version does not expose sub-issue parent field — falling back to body cross-refs only`.
3. **Deduplicate** the candidate set; preserve insertion order for determinism.
4. **Cycle detection.** Maintain a visited-set of issue numbers seeded with the current issue. When resolving transitively (a candidate parent that itself has a parent), abort with a cycle-detected error if the same issue number reappears. If `#A` lists `Depends on: #B` and `#B` lists `Depends on: #A`, writing the spec for either issue aborts with:

   ```
   ERROR: cycle detected in parent-link graph — #A and #B depend on each other. Break the cycle by removing one of the Depends on: lines and re-run $nmg-sdlc:write-spec.
   ```

5. **Match candidates to spec directories.** For each candidate `#P`:
   - file discovery `specs/*/requirements.md` to enumerate spec directories.
   - For each match, read the file's `**Issues**` frontmatter field (format: `**Issues**: #A, #B, #C`).
   - If `#P` appears in the Issues list, record that spec directory as the resolved parent spec.

6. **Handle the three outcomes:**
   - **Match found** → enter **amendment mode** against the matched spec directory. Append the current issue number to the spec's `**Issues**` frontmatter (comma-separated), add a Change History row with today's date and a one-line summary, and skip directly to Phase 1 using the existing spec as the working document. The amendment-branch steps live in `references/amendment-mode.md`.
   - **Candidate found but no matching spec directory** → abort with the loud failure:

     ```
     ERROR: Parent spec for #P not found — run '$nmg-sdlc:write-spec #P' and seal the spec before starting child work.
     ```

     Do not create any spec files for the child. Exit non-zero in unattended mode (escalate via runner sentinel).
   - **No candidates at all** → fall through to Step 1.

Step 0 is stateless — it derives everything fresh from `gh` state on each invocation. It runs identically in interactive and unattended modes; the only difference is that unattended aborts emit the error to stderr and exit non-zero rather than prompting.

## Step 1: Bounded Spec-Context Ranking (fallback)

1. Read `../../references/spec-context.md`.
2. **Search for existing feature specs**: Run file discovery for `specs/feature-*/requirements.md` to list candidates. If no feature specs exist, skip to the create-new-spec flow in the main workflow.
3. **Extract metadata first**: For each candidate, scan compact metadata only: slug/title, `**Issues**`, `**Related Spec**`, headings, AC/FR names, affected paths, symbols, component names, and strong title/body keywords from the issue.
4. **Rank and filter**: Apply the shared ranking rules. Keep candidates only when they meet the threshold: at least one strong signal or at least two medium signals. Weak generic overlap is not enough.
5. **If one or more candidates found**:
   - Read only the top-ranked candidate summaries needed for the gate, capped at five presented candidates. Include ranking reasons for each candidate.
   - Present a `request_user_input` gate in Plan Mode:
     - Option 1: "Amend existing spec: `feature-{slug}`" for the top threshold-qualified candidate, including ranking reasons.
     - Option 2: "Create new spec" (derives a new `feature-{slug}` from the current issue title).
     - Free-form `Other`: treat as an explicit spec directory to verify before proceeding, or as a corrected slug for create-new-spec if no matching directory exists.
   - **If unattended mode** (`.codex/unattended-mode` exists): skip `request_user_input`. Proceed in amendment mode only when the deterministic top-ranked candidate meets the shared threshold; otherwise proceed to create-new-spec and record the ambiguity or no-threshold gap.
6. **If no candidates meet threshold**: proceed to create a new spec without prompting and record `relatedSpecs: none`.

The result determines whether subsequent phases operate in **amendment mode** (modifying an existing spec) or **creation mode** (writing a new spec from scratch).
