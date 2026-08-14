---
name: start-issue
description: "Select a GitHub issue, create a linked feature branch, and set the issue to In Progress. Use when user says 'start issue', 'pick up issue', 'begin working on #N', 'start #N', 'what should I work on', 'how do I start an issue', 'how to begin work on an issue', or 'kick off issue #N'. Do NOT use for creating issues, writing specs, or implementing code. Fetches milestones, presents issue selection, creates branch via gh issue develop, and updates project board status. Second step in the SDLC pipeline — follows $nmg-sdlc:draft-issue and precedes $nmg-sdlc:write-spec."
---

# Start Issue

Read `../../references/codex-tooling.md` when the workflow starts — it maps legacy tool wording to Codex-native file inspection, shell, editing, web, interactive-gate, and subagent behavior.

Read `../../references/interactive-gates.md` when the workflow reaches any manual-mode user decision, menu, review gate, or clarification prompt — Codex asks through `request_user_input` in Plan Mode, then finalizes a `<proposed_plan>` before execution.

Select a GitHub issue to work on, create a linked feature branch, and set the issue to "In Progress" in any associated GitHub Project.

Read `../../references/legacy-layout-gate.md` when the workflow starts — the gate aborts before Step 1 if the project still keeps SDLC artifacts under `.codex/steering/` or `.codex/specs/` (the current Codex release refuses to Edit/Write there).

Read `../../references/epic-relationships.md` when Step 1a begins — it defines the durable label/native/body tuple, shared result fields, target hydration, fail-safe classification, sibling reconciliation, and completion rules used by every manual epic consumer.

Read `../../references/canonical-umbrella-spec.md` after a selected issue is confirmed and relationship classification identifies a coordination epic. Resolve the helper from the installed plugin root, not the consumer project.

## Workflow Overview

```
$nmg-sdlc:start-issue [#N]
    │
    ├─ 1.  Fetch milestones & issues
    ├─ 1a. Dependency resolution (filter blocked, topological sort)
    ├─ 2.  Present issue selection (`request_user_input` gate)
    ├─ 3.  Confirm selected issue and load its details
    ├─ 3.25 Prove a child parent spec canonical (when applicable)
    ├─ 3.5 Reconcile stale remote branch (if any)
    └─ 4.  Create linked feature branch & set issue to In Progress
         ├─ Precondition: working tree must be clean
         └─ Create branch, update status
```

---

## Step 1: Identify Issue

If an argument was provided (e.g., `$nmg-sdlc:start-issue #42`), use that issue number and skip to Step 3.

Otherwise, discover available issues.

Read `references/milestone-selection.md` when no argument was supplied — the reference covers viable-milestone enumeration, the `request_user_input` milestone gate, and empty-result handling.

After the raw candidate set is produced, proceed to Step 1a before presentation.

## Step 1a: Dependency Resolution

Filter out blocked issues and topologically order the remainder so genuine prerequisites appear before their descendants. Apply `../../references/epic-relationships.md` before blocked filtering: preserve confirmed coordination-epic identity, but exclude those pairs from blockers, blocked counts, and topological in-degree. Emit a session note reporting the filtered count before presentation, even when the count is zero.

### Fetch and Hydrate Relationship Metadata

Issue a single `gh api graphql` call that requests `parent`, `subIssues`, `state`, `labels`, and `body` for every candidate issue in one round-trip. Use one aliased field per issue number inside a single query (e.g. `issue127: issue(number: 127) { ... }`), passed as a `-f query='...'` argument to `gh api graphql`. Request `labels(first: 100) { nodes { name } }` for each candidate and native parent. The core query shape per issue is:

```graphql
issue(number: N) {
  number
  state
    labels(first: 100) {
      nodes { name }
      pageInfo { hasNextPage endCursor }
    }
    parent {
      number
      state
      labels(first: 100) {
        nodes { name }
        pageInfo { hasNextPage endCursor }
      }
    }
    subIssues(first: 50) {
      nodes { number state }
      pageInfo { hasNextPage endCursor }
    }
    body
}
```

Page every candidate `subIssues` connection and every candidate/native-parent `labels` connection by `endCursor` until `hasNextPage` is false, with a maximum of 10 follow-up pages per connection. Merge each page into the same issue record before normalization. If a cursor is absent, a follow-up request fails, a response is malformed, or the bound is exceeded, mark the affected candidate `unverifiable` with exact connection/issue evidence and stop before presentation; never treat a partial native set as complete.

Normalize native, body, and `epic-child-of-N` label signals into deduplicated `(child, target)` pairs only after required pages are complete. After parsing the bodies and child labels, hydrate every unique target not already covered by the candidate/native-parent response, including targets outside the candidate pool. Use a second bounded GraphQL batch or supported `gh issue view #T --json number,state,labels` calls, and fully page any GraphQL label connection. Derive the complete shared result per the reference.

If `parent` or `subIssues` fields return `null` or `[]` but the GraphQL call itself succeeded (HTTP 200), treat the native contribution for that issue as an empty set and continue — this is not a fallback condition.

### Parse Body Cross-Refs

Scan each issue body line-by-line, case-insensitive, line-anchored:

| Pattern | Meaning |
|---------|---------|
| `^\s*Depends on:\s*(#\d+(?:\s*,\s*#\d+)*)` | Current issue depends on the listed issues (they are parents) |
| `^\s*Blocks:\s*(#\d+(?:\s*,\s*#\d+)*)` | Current issue blocks the listed issues (they depend on current) |

Extract issue numbers with `#?(\d+)`. Normalize: `Blocks: #Y` on issue `X` is recorded as `Depends on: #X` on issue `Y`. Cross-repo references (`owner/repo#N`) are ignored.

### Build and Classify the Graph

Construct deduplicated relationship pairs by merging native links (parent + inverse sub-issues), body cross-refs, and child labels. Derive `role`, `parentNumber`, `identity`, `consistency`, `nativeAuthority`, `degraded`, `coordinationPairs`, `executionDependencies`, and `gaps` exactly as specified by the shared reference. Build `parentsOf: Map<issue_number, Set<parent_number>>` for readiness from `executionDependencies` only. Stop selection before presentation when a candidate has `inconsistent`, `ambiguous`, or `unverifiable` coordination identity; name the candidate and exact gaps instead of silently reclassifying it.

Native link normalization happens before classification: a `parent` entry on issue `C` with `{number: P}` adds pair `(C, P)`; a `subIssues` entry on issue `P` with node `{number: C}` adds the same inverse pair `(C, P)`. Deduplicate those signals with body and label evidence. Add `P` to `parentsOf[C]` only when the classified pair appears in `executionDependencies`; never add a confirmed `coordinationPairs` entry to `parentsOf`.

### Blocked Filter

An issue `I` is **blocked** and dropped from the candidate set if any confirmed execution dependency in `parentsOf[I]` is not `CLOSED`. A known target whose metadata is missing or failed remains in `parentsOf[I]` as unresolved and emits the shared actionable warning naming the child and target. A confirmed `role = epic-child` parent never blocks, even while the epic is open.

### Topological Sort (Kahn's algorithm)

1. Compute in-degree counting only parents that are also in the candidate set (external parents are already closed by precondition).
2. Seed a priority queue with all zero-in-degree nodes, ordered by issue number ascending.
3. Pop the lowest-numbered zero-in-degree node, append it to the output, decrement in-degrees of its children, and enqueue newly-zero children.
4. Repeat until the queue drains.

Ties between sibling zero-in-degree nodes always break by issue number ascending to preserve predictable ordering.

### Cycle Handling

If any candidate remains un-emitted after the queue drains, those nodes form a cycle. Do not abort:

1. Emit a warning naming the participants:
   ```
   WARNING: Dependency cycle detected among issues #A, #B, #C — placing at end of list in issue-number order.
   ```
2. Append the cycle members to the output list in issue-number ascending order.
3. Continue.

### Fallback Chain

| Failure | Fallback |
|---------|----------|
| GraphQL batch query fails (network/auth/preview unavailable) | Re-fetch bodies only via `gh issue view --json body` per issue; parse body cross-refs only; emit `WARNING: Native dependency links unavailable; using body cross-refs only.` |
| Body fetch also fails | Skip dependency resolution entirely; emit `WARNING: Dependency resolution unavailable; preserving legacy ordering.`; preserve legacy issue-number-ascending ordering; do not abort |

The body-only fallback still hydrates every known body target. A target lookup failure retains that relationship as blocking per the shared reference; it never silently becomes satisfied.

### Session Note

Before presenting the issue selection, emit exactly one line to stdout:

```
Filtered N blocked issues from selection.
```

Emit the line even when `N == 0` — it confirms dependency resolution ran.

The topologically ordered, blocked-filtered list is what Step 2 presents.

## Step 2: Present Issue Selection

Use a `request_user_input` gate to present up to 4 issues as options, drawn from Step 1a's topologically ordered, blocked-filtered list (not the raw Step 1 fetch).

- Each option label: `#N: Title`
- Each option description: labels (comma-separated), or "No labels" if none.
- Include a final option: **"Enter issue number manually"** with description "Type a specific issue number".
- If more than 4 issues exist, show the first 4.

If the user selects "Enter issue number manually", they type their issue number via the "Other" free-text input.

## Step 3: Confirm Selection

Read the full issue details via `gh issue view #N` and present a brief summary: title and number, user story (if present), number of acceptance criteria, labels, and milestone.

Ask through `request_user_input`: "Ready to start working on this issue?" If the user says no, return to Step 2.

## Step 3.25: Canonical Parent-Spec Gate

After confirmation and before stale-branch reconciliation, re-resolve the selected issue's supported relationship signals through `../../references/epic-relationships.md`. This recheck also applies when an explicit issue argument skipped Step 1a.

1. Read the selected issue body and labels and use GitHub GraphQL for its native parent. Hydrate each deduplicated target's live state and labels. Never request `parent` through `gh issue view --json`.
2. Derive the shared result. For `ordinary` or `epic`, continue unchanged. For `inconsistent`, `ambiguous`, or `unverifiable`, stop and report the exact pairs/signals/gaps. For `epic-child`, record `P = parentNumber`; report but do not block on `identity = legacy`.
3. For `P`, run:

   ```bash
   node <plugin-root>/scripts/umbrella-spec-status.mjs \
     --project <project-root> \
     --parent-issue P \
     --json
   ```

4. Continue only for `canonical` or `canonical_marker_lost`. Report marker loss as supporting provenance information, not a failure.
5. For `stranded_recoverable`, `divergent`, `ambiguous`, or `unverifiable`, stop with the exact parent, status, `reasonCode`, path/tree/ref evidence, and this next step: publish the parent through `$nmg-sdlc:write-spec #P`, or audit an affected initialized project with `$nmg-sdlc:upgrade-project`.

This gate runs before dirty-tree handling, branch creation/switching, remote-branch deletion, or project-status mutation. A failure leaves Git and GitHub unchanged.

## Step 3.5: Reconcile Stale Remote Branch

Read `references/stale-remote-branch.md` when the selected issue number is known and before `gh issue develop --checkout` runs — the reference covers branch-name derivation, remote existence probe, ancestor-of-main check, and the deletion confirmation. The probe is skipped when no remote branch exists.

## Step 4: Create Feature Branch & Link to Issue

Read `../../references/dirty-tree.md` when Step 4 begins — the reference covers the `git status --porcelain` check and abort message when the output is non-empty. Branch creation must not proceed against a dirty tree.

### Create Branch

Check if already on a feature branch for this issue:

```bash
git branch --show-current
```

If the current branch already references the issue number, stay on it and skip branch creation.

If the current branch is `main` or `master`, create a linked feature branch using `gh issue develop`, which both creates the branch and associates it with the issue in GitHub's "Development" sidebar:

```bash
gh issue develop N --checkout --name N-feature-name
```

Where `N` is the issue number and `feature-name` is a kebab-case slug derived from the issue title.

Read `../../references/feature-naming.md` when deriving the branch-name slug — the reference defines the slug rules and the intentional mismatch between branch names (`{issue#}-{slug}`) and spec directories (`feature-{slug}` / `bug-{slug}`).

### Update Issue Status to In Progress

Read `references/project-status.md` when the branch has been created successfully — the reference covers GraphQL discovery of the project/field/option IDs and the `updateProjectV2ItemFieldValue` mutation. The update is best-effort: if the issue is not in any project or no "In Progress" option exists, skip silently and proceed to Output.

---

## Output

```
--- Issue Ready ---
Issue: #N — [title]
Branch: [branch-name]
Milestone: [milestone or "none"]
Labels: [labels or "none"]
Status: In Progress

Next step: Run `$nmg-sdlc:write-spec #N` to create specifications for this issue.
```

This summary is the handoff contract for downstream skills like `$nmg-sdlc:write-spec` and `$nmg-sdlc:write-code`.

---

## Integration with SDLC Workflow

```
$nmg-sdlc:draft-issue  →  $nmg-sdlc:start-issue #N  →  $nmg-sdlc:write-spec #N  →  $nmg-sdlc:write-code #N  →  $nmg-sdlc:simplify  →  $nmg-sdlc:verify-code #N  →  $nmg-sdlc:open-pr #N  →  $nmg-sdlc:address-pr-comments #N
                          ▲ You are here
```
