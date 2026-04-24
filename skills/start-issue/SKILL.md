---
name: start-issue
description: "Select a GitHub issue, create a linked feature branch, and set the issue to In Progress. Use when user says 'start issue', 'pick up issue', 'begin working on #N', 'start #N', 'what should I work on', 'how do I start an issue', 'how to begin work on an issue', or 'kick off issue #N'. Do NOT use for creating issues, writing specs, or implementing code. Fetches milestones, presents issue selection, creates branch via gh issue develop, and updates project board status. Second step in the SDLC pipeline — follows /draft-issue and precedes /write-spec."
argument-hint: "[#issue-number]"
allowed-tools: Read, Glob, Grep, Bash(gh:*), Bash(git:*)
model: sonnet
effort: low
---

# Start Issue

Select a GitHub issue to work on, create a linked feature branch, and set the issue to "In Progress" in any associated GitHub Project.

Read `../../references/legacy-layout-gate.md` when the workflow starts — the gate aborts before Step 1 if the project still keeps SDLC artifacts under `.claude/steering/` or `.claude/specs/` (the current Claude Code release refuses to Edit/Write there).

Read `../../references/unattended-mode.md` when the workflow starts — the sentinel pre-approves every `AskUserQuestion` call site in this skill. Steps 2 and 3 are skipped when the sentinel is present; the auto-selection rules below replace them.

## Unattended-Mode Behaviour Specific to This Skill

The shared reference covers sentinel semantics; these skill-specific branches apply when `.claude/unattended-mode` exists:

- **Argument supplied** (`/start-issue #N`): skip Steps 2–3 (selection and confirmation) and go directly to Step 4.
- **No argument**: select the first unblocked `automatable` issue from Step 1a's topologically-ordered output (ties broken by issue number ascending), drawn from the first viable milestone alphabetically — or from all open issues if no viable milestone exists. `AskUserQuestion` is never called.
- Only issues with the `automatable` label are eligible. Every `gh issue list` command gains `--label automatable`. If no automatable issues exist, run the diagnostic per `references/milestone-selection.md` and exit without creating a branch.

## Workflow Overview

```
/start-issue [#N]
    │
    ├─ 1.  Fetch milestones & issues
    ├─ 1a. Dependency resolution (filter blocked, topological sort)
    ├─ 2.  Present issue selection (AskUserQuestion)
    ├─ 3.  Confirm selected issue
    └─ 4.  Create linked feature branch & set issue to In Progress
         ├─ Precondition: working tree must be clean
         └─ Create branch, update status
```

---

## Step 1: Identify Issue

If an argument was provided (e.g., `/start-issue #42`), skip to Step 3 using that issue number.

Otherwise, discover available issues.

Read `references/milestone-selection.md` when no argument was supplied — the reference covers viable-milestone enumeration, auto-selection vs. interactive prompt, the `--label automatable` gating in unattended mode, and the empty-result diagnostic that halts the run when no automatable issues exist.

After the raw candidate set is produced (and the empty-result handler has not fired), proceed to Step 1a before any presentation or auto-selection.

## Step 1a: Dependency Resolution

Filter out blocked issues and topologically order the remainder so parents appear before their descendants. This runs in **both** interactive and unattended mode, on the candidate set produced by Step 1. Emit a session note reporting the filtered count before presentation/auto-selection, even when the count is zero.

### Fetch Dependency Metadata (single GraphQL batch)

Issue a single `gh api graphql` call that requests `parent`, `subIssues`, `state`, and `body` for every candidate issue in one round-trip. Use one aliased field per issue number inside a single query (e.g. `issue127: issue(number: 127) { ... }`), passed as a `-f query='...'` argument to `gh api graphql`. The query shape per issue:

```graphql
issue(number: N) {
  number
  state
  parent { number state }                       # tracked-by link
  subIssues(first: 50) { nodes { number state } }
  body
}
```

Any parent whose `state` is not `CLOSED` (including `OPEN`) is treated as an unresolved dependency.

If `parent` or `subIssues` fields return `null` or `[]` but the GraphQL call itself succeeded (HTTP 200), treat the native contribution for that issue as an empty set and continue — this is not a fallback condition.

### Parse Body Cross-Refs

Scan each issue body line-by-line, case-insensitive, line-anchored:

| Pattern | Meaning |
|---------|---------|
| `^\s*Depends on:\s*(#\d+(?:\s*,\s*#\d+)*)` | Current issue depends on the listed issues (they are parents) |
| `^\s*Blocks:\s*(#\d+(?:\s*,\s*#\d+)*)` | Current issue blocks the listed issues (they depend on current) |

Extract issue numbers with `#?(\d+)`. Normalize: `Blocks: #Y` on issue `X` is recorded as `Depends on: #X` on issue `Y`. Cross-repo references (`owner/repo#N`) are ignored.

### Build Graph

Construct `parentsOf: Map<issue_number, Set<parent_number>>` by merging the native links (parent + inverse sub-issues) with the body-cross-ref data. An issue declared as a parent in both formats counts once (set deduplication).

Native link normalization: a `parent` entry on issue `C` with `{number: P}` adds `P` to `parentsOf[C]`; a `subIssues` entry on issue `P` with node `{number: C}` adds `P` to `parentsOf[C]` (inverse — the sub-issue's parent is `P`).

### Blocked Filter

An issue `I` is **blocked** and dropped from the candidate set if any element of `parentsOf[I]` is not in `CLOSED` state. Parents that are missing, deleted, or cross-repo are treated as closed (fail-open) so typos or deleted refs do not halt the pipeline.

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
4. In unattended mode, this warning is informational only — the runner does not escalate based on cycles.

### Fallback Chain

| Failure | Fallback |
|---------|----------|
| GraphQL batch query fails (network/auth/preview unavailable) | Re-fetch bodies only via `gh issue view --json body` per issue; parse body cross-refs only; emit `WARNING: Native dependency links unavailable; using body cross-refs only.` |
| Body fetch also fails | Skip dependency resolution entirely; emit `WARNING: Dependency resolution unavailable; preserving legacy ordering.`; preserve legacy issue-number-ascending ordering; do not abort |

### Session Note

Before presentation (interactive) or auto-selection (unattended), emit exactly one line to stdout:

```
Filtered N blocked issues from selection.
```

Emit the line even when `N == 0` — it confirms dependency resolution ran.

The topologically-ordered, blocked-filtered list is what Step 2 and the unattended auto-pick consume.

## Step 2: Present Issue Selection

In unattended mode, skip this step entirely — the auto-pick rule in the Unattended-Mode Behaviour section replaces it.

Interactive mode uses `AskUserQuestion` to present up to 4 issues as options, drawn from Step 1a's topologically-ordered, blocked-filtered list (not the raw Step 1 fetch).

- Each option label: `#N: Title`
- Each option description: labels (comma-separated), or "No labels" if none. If the issue has the `automatable` label, append `(automatable)` to the description.
- Include a final option: **"Enter issue number manually"** with description "Type a specific issue number".
- If more than 4 issues exist, show the first 4.

If the user selects "Enter issue number manually", they type their issue number via the "Other" free-text input.

## Step 3: Confirm Selection

Read the full issue details via `gh issue view #N` and present a brief summary: title and number, user story (if present), number of acceptance criteria, labels, and milestone.

Ask: "Ready to start working on this issue?" If the user says no, return to Step 2.

## Step 4: Create Feature Branch & Link to Issue

Read `../../references/dirty-tree.md` when Step 4 begins — the reference covers the `git status --porcelain` filter for SDLC-runner artifacts and the abort messaging (interactive vs. unattended) when the filtered output is non-empty. Branch creation must not proceed against a dirty tree.

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

[If `.claude/unattended-mode` does NOT exist]: Next step: Run `/write-spec #N` to create specifications for this issue.
[If `.claude/unattended-mode` exists]: Done. Awaiting orchestrator.
```

This summary is the handoff contract for downstream skills like `/write-spec` and `/write-code`.

---

## Integration with SDLC Workflow

```
/draft-issue  →  /start-issue #N  →  /write-spec #N  →  /write-code #N  →  /simplify  →  /verify-code #N  →  /open-pr #N  →  /address-pr-comments #N
                          ▲ You are here
```
