# Spec Discovery

**Read this when** the issue is **not** bug-labelled and `$nmg-sdlc:write-spec` needs to decide whether to *amend an existing feature spec* or *create a new one*. Bug-labelled issues skip discovery entirely — they always create a new `bug-{slug}/` and never amend.

Discovery applies only to ordinary issues. A confirmed epic child is routed by
`epic-link.json` / `epic-scope.json` authority before this reference is loaded;
keyword similarity can never select an aggregate or sibling package.

## Step 0: Epic Routing Boundary

The top-level Epic Role and Authority Gate runs before this reference.

1. A confirmed epic stops; it is not a discovery candidate.
2. A confirmed child uses first-child, later-child, or existing-child mode from
   `umbrella-mode.md`. It never enters keyword ranking and never amends the
   aggregate or a sibling.
3. Preserve cycle diagnostics. If top-level relationship resolution encounters a cycle, it aborts before discovery with:

   ```text
   ERROR: cycle detected in parent-link graph — #A and #B depend on each other. Break the cycle by removing one of the Depends on: lines and re-run $nmg-sdlc:write-spec.
   ```

4. Only `ordinary` reaches Step 1. Its dependency edges do not redirect spec
   ownership; bounded metadata discovery remains advisory and user-reviewed.

## Step 1: Bounded Spec-Context Ranking (fallback)

1. Apply the bounded metadata ranking contract from the repository-root
   `references/spec-context.md`.
2. **Search for existing feature specs**: Run file discovery for `specs/feature-*/requirements.md` to list candidates. If no feature specs exist, skip to the create-new-spec flow in the main workflow.
3. **Extract metadata first**: For each candidate, scan compact metadata only: slug/title, `**Issues**`, `**Related Spec**`, headings, AC/FR names, affected paths, symbols, component names, and strong title/body keywords from the issue.
4. **Rank and filter**: Apply the shared ranking rules. Keep candidates only when they meet the threshold: at least one strong signal or at least two medium signals. Weak generic overlap is not enough.
5. **If one or more candidates found**:
   - Read only the top-ranked candidate summaries needed for the gate, capped at five presented candidates. Include ranking reasons for each candidate.
   - Present a `request_user_input` gate in Plan Mode:
     - Option 1: "Amend existing spec: `feature-{slug}`" for the top threshold-qualified candidate, including ranking reasons.
     - Option 2: "Create new spec" (derives a new `feature-{slug}` from the current issue title).
     - Free-form `Other`: treat as an explicit spec directory to verify before proceeding, or as a corrected slug for create-new-spec if no matching directory exists.
6. **If no candidates meet threshold**: proceed to create a new spec without prompting and record `relatedSpecs: none`.

The result determines whether subsequent phases operate in **amendment mode** (modifying an existing spec) or **creation mode** (writing a new spec from scratch).
