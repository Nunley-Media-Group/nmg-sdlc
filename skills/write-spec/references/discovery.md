# Spec Discovery

**Read this when** the issue is **not** bug-labelled and `$nmg-sdlc:write-spec` needs to decide whether to *amend an existing feature spec* or *create a new one*. Bug-labelled issues skip discovery entirely — they always create a new `bug-{slug}/` and never amend.

Discovery has two stages run in strict order: the top-level workflow's confirmed, canonical epic-parent result first, then the bounded metadata ranking contract from `../../references/spec-context.md` as a fallback. The reason for ordering this way is that a confirmed coordination parent is stronger than token overlap, but a genuine execution dependency must not be mistaken for an umbrella.

## Step 0: Parent-Link Resolution

Run before keyword discovery. Only fall through to Step 1 when this stage produces no candidates.

1. **Consume the current gate result.** The top-level Canonical Parent-Spec Gate already normalized `Depends on:`, `Blocks:`, and native GitHub GraphQL signals through `../../references/epic-relationships.md`, hydrated targets, rejected ambiguous parents/cycles, and proved refreshed default-branch readiness. Never replace that result with worktree-only evidence or unsupported parent fields in `gh` JSON output.
2. **Handle parent identity.** No recorded canonical epic parent falls through to Step 1. A recorded parent continues below.
3. **Preserve cycle diagnostics.** If top-level relationship resolution encounters a cycle, it aborts before discovery with:

   ```
   ERROR: cycle detected in parent-link graph — #A and #B depend on each other. Break the cycle by removing one of the Depends on: lines and re-run $nmg-sdlc:write-spec.
   ```

4. **Enter amendment mode.** Use the recorded canonical `specPath`. Require that exact directory in the current worktree; if it is absent, stop and instruct the user to refresh/rebase from the proven default commit. Do not synthesize a child-local replacement. If present, append the current issue number to `**Issues**`, add the Change History row, and follow `references/amendment-mode.md`.

The canonical check proves the baseline path on the refreshed default branch. The current child branch may contain approved child-scoped amendments and does not need to equal the baseline tree.

Step 0 consumes only evidence derived fresh by this invocation's top-level gate.

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
6. **If no candidates meet threshold**: proceed to create a new spec without prompting and record `relatedSpecs: none`.

The result determines whether subsequent phases operate in **amendment mode** (modifying an existing spec) or **creation mode** (writing a new spec from scratch).
