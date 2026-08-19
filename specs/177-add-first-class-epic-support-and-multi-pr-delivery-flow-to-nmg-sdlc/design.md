# Design: First-Class Epic Support and Multi-PR Delivery Flow

**Issue**: #177
**Related Spec**: specs/149-add-first-class-epic-support-and-multi-pr-delivery-flow-to-nmg-sdlc/
**Date**: 2026-08-16
**Status**: Approved
**Author**: Rich Nunley

---

> **Issue #177 supersession:** The original #149 design below is retained as
> historical context. The `Issue #177 Architecture Supersession` section is
> authoritative wherever the two designs conflict: an epic is coordination
> only, its children own executable specs, and delivery does not finish before
> merge and post-merge reconciliation.

## Overview

This feature adds a third first-class issue type — **Epic** — to the nmg-sdlc pipeline, plus a **seal-spec** flow and sibling-aware coordination across four existing pipeline skills. The goal is to eliminate today's improvised coordination for multi-PR features: an epic issue becomes a genuine coordination artifact, the umbrella spec gets committed without a version bump via seal-spec, child issues resolve back to the parent spec by link (not keyword), and both `/open-pr` and `sdlc-runner.mjs` become sibling/dependency-aware.

The changes are **surgical and local to four existing files** — no new skill is added. Epic support is threaded through `/draft-issue` (classification + body template), `/write-spec` (parent-link resolution + seal-spec), `/open-pr` (sibling-aware bumping), and `sdlc-runner.mjs` (topological ordering). No new external dependencies: all GitHub coordination goes through existing `gh` CLI calls, and dependency graphs are re-derived from live GitHub state on every runner tick per the retrospective learning about stale-cache contamination.

Where the changes are prompt-only (Markdown skill edits), `skill-creator` drives the authoring per the `Invariant: Skills must be authored via /skill-creator` contract in `steering/structure.md`. Where the change is code (`sdlc-runner.mjs`), standard edit tools apply.

---

## Architecture

### Component Diagram

The feature fans out across three skill files and one Node.js script, all within the existing plugin layer per `steering/structure.md`. No new layer is introduced.

```
┌───────────────────────────────────────────────────────────────────────┐
│                           SDLC Pipeline (existing)                     │
├───────────────────────────────────────────────────────────────────────┤
│                                                                        │
│  ┌────────────────┐   ┌────────────────┐   ┌────────────────┐         │
│  │ /draft-issue   │──▶│ /start-issue   │──▶│ /write-spec    │         │
│  │ + Epic class.  │   │ (unchanged)    │   │ + parent link  │         │
│  │ + Epic body    │   │                │   │ + seal-spec    │         │
│  └───────┬────────┘   └────────────────┘   └───────┬────────┘         │
│          │ (creates children)                       │ (seal commit)    │
│          ▼                                          ▼                  │
│   GitHub Issues ◀───────────────────────────── specs/{feature}/        │
│   (epic + sub-issues)                                                  │
│                                                                        │
│  ┌────────────────┐   ┌────────────────┐   ┌────────────────┐         │
│  │ /write-code    │──▶│ /verify-code   │──▶│ /open-pr       │         │
│  │ (unchanged)    │   │ (unchanged)    │   │ + sibling bump │         │
│  └────────────────┘   └────────────────┘   └───────┬────────┘         │
│                                                    │                   │
└────────────────────────────────────────────────────┼──────────────────-┘
                                                     │
                                                     ▼
                                              ┌──────────────┐
                                              │ sdlc-runner  │
                                              │ + topo queue │
                                              └──────────────┘
```

### Data Flow: Epic Lifecycle

```
1. User invokes /draft-issue with a multi-phase description
2. Step 1b-1d detects multi-phase signals → Step 2 offers Epic classification
3. User picks Epic → Step 6 synthesizes epic coordination body (Goal / Phases / Child Checklist)
4. Step 10 creates epic issue, then creates each child via the existing batch mechanism
5. Each child issue gets a "Depends on: #epic" line in its body and native GH sub-issue parent link
6. User invokes /write-spec on the EPIC → writes requirements/design/tasks describing multi-PR rollout
7. At Phase 3 gate approval, /write-spec detects multi-PR trigger → offers seal-spec
8. Seal-spec: commit specs/{feature}/, push, print next-step `/start-issue #{first-child}`
9. User (or runner) invokes /start-issue on first child → branch created
10. User invokes /write-spec on child → parent-link resolver finds epic spec → amendment mode
11. Normal /write-code → /verify-code → /open-pr flow on the child
12. /open-pr checks sibling state → patch bump (if other children still open) or minor (if final child)
13. Runner, on each tick, builds dependency graph → skips blocked children → picks next unblocked
```

---

## API / Interface Changes

All changes are internal to the plugin; there are no public API or HTTP interface changes. The "interfaces" below are the observable contracts between skills and between the runner and GitHub.

### New Skill Interfaces

| Interface | Type | Purpose |
|-----------|------|---------|
| `/draft-issue` Epic type output | Issue body contract | Consumed by `/write-spec` parent-link resolution |
| `/write-spec` seal-spec commit | Git commit with specific message shape | Signals to runner/human that spec is sealed |
| `/open-pr` PR body classification line | `**Bump:** patch \| minor (epic child: intermediate \| final)` | Audit trail for bump decision |

### Epic Issue Body Contract (Step 6 of /draft-issue, Epic variant)

**Required shape** (consumed by `/write-spec` parent-link resolution and `/open-pr` sibling detection):

```markdown
## Goal

[1-3 sentences describing what this epic delivers when all children merge.]

## Delivery Phases

| Phase | Child Issue | Depends On | Summary |
|-------|-------------|------------|---------|
| 1 | #{placeholder-1} | — | [short desc] |
| 2 | #{placeholder-2} | #{placeholder-1} | [short desc] |

## Success Criteria

Each child issue owns its own acceptance criteria — this epic is a coordination document only.

## Child Issues

- [ ] #{placeholder-1} — [short desc]
- [ ] #{placeholder-2} — [short desc]
```

After Step 10 creates children, placeholders are replaced with real issue numbers and the body is edited in place via `gh issue edit`.

### Child Issue Body Contract

Every child created via an Epic's batch flow MUST include these lines in its body so `/write-spec` and `/open-pr` can discover the parent:

```markdown
Depends on: #{epic-number}
<!-- and, if the child has intra-epic prerequisites -->
Depends on: #{sibling-number}
```

The `Depends on:` line is the authoritative cross-ref. GitHub's native sub-issue parent field is set in parallel (via `gh issue edit --add-parent`), giving a redundant signal.

### `/open-pr` Sibling-Detection Query

```bash
# Given current issue #N with Depends on: #E in body
gh issue view $E --json closedByPullRequestsReferences,state,body
# Parse #E's "Child Issues" checklist and body cross-refs
# For each child issue #C (excluding #N), query:
gh issue view $C --json state,closedByPullRequestsReferences
# Classify: all closed with merged PRs → minor bump; any open or no merged PR → patch bump
```

### Runner Dependency-Graph Query (each tick, no cache)

```bash
# For each open issue in the current milestone:
gh issue view $N --json number,state,body,parent,closedByPullRequestsReferences
# Parse body for: Depends on: #A, #B → edge list
# GitHub sub-issue parent field → add implicit parent→child edge
# Build adjacency list; compute which issues are ready (all deps have merged PRs)
# Pick lowest-numbered ready issue
```

---

## Database / Storage Changes

### `sdlc-state.json` (runtime state, **not** persisted across cycles)

No schema change. Dependency graphs are **deliberately not cached** in `sdlc-state.json` per the retrospective learning "When specifying features that loop over multiple work units with shared runtime state, specs say 'reset state between iterations' at a high level but omit ACs about the data source used to derive identifiers." The graph is re-derived from live `gh issue view` output on every runner tick to prevent stale-state contamination across cycles.

### Spec Frontmatter (no change to format)

The existing `**Issues**: #A, #B` plural field is already sufficient. No new frontmatter fields. The Change History table is extended when children amend a parent spec — existing mechanism.

### Epic Issue Body (no database — it IS the coordination state)

Epic issue bodies are authoritative state for:
- Which children belong to the epic (Child Issues checklist)
- Phase ordering (Delivery Phases table)

No separate database or config file tracks these — GitHub issues ARE the source of truth, per `steering/product.md`'s "Spec as source of truth" principle extended to cross-issue coordination.

---

## State Management

### Epic Classification State (within `/draft-issue`)

The classification is a one-time decision at Step 2. State transitions:

```
Step 1 (Capture) → Step 1b-1d (Detect multi-issue) → Step 2 (Classify)
  ↓
  ├── User picks Feature → existing flow (Steps 3–10)
  ├── User picks Bug → existing flow (Steps 3–10)
  └── User picks Epic → Step 6 uses Epic template → Step 10 creates epic + children in batch
```

### Seal-Spec State (within `/write-spec`)

The seal decision is a one-time action at the end of Phase 3. State transitions:

```
Phase 3 approved → Check design.md for multi-PR trigger
  ↓
  ├── Not multi-PR → Existing "After Completion" message
  └── Multi-PR → Offer seal option
      ↓
      ├── User declines seal → Existing "After Completion" message with manual hint
      └── User approves seal
          ↓
          ├── Spec already sealed at current HEAD → print no-op message
          └── Fresh seal → commit + push + offer child creation
                ↓
                ├── Decline child creation → print manual next-step hint
                └── Approve → re-invoke /draft-issue Steps 1b-1d in batch mode
```

Seal detection is stateless — `git log --grep='^docs: seal umbrella spec for #N$'` against the current branch determines if the seal commit already exists.

### Runner Dependency-Graph State

Graph is rebuilt on every call to `selectNextIssue()`. No persistence. The existing `sdlc-state.json` fields are unchanged.

---

## UI Components

**N/A** — this is a CLI/skill feature. The only "UI" is:

| Surface | Change |
|---------|--------|
| `interactive prompt` in `/draft-issue` Step 2 | Add third option "Epic" with description |
| `interactive prompt` at `/write-spec` Phase 3 gate | Add "Seal and transition" option when multi-PR trigger fires |
| Runner stdout log lines | New `[runner] skipping #N — blocked by unmerged dependencies: #A` format |
| PR body footer | New `**Bump:** patch (epic child: intermediate)` classification line |

All four surfaces respect `.codex/unattended-mode` per FR8.

---

## Alternatives Considered

| Option | Description | Pros | Cons | Decision |
|--------|-------------|------|------|----------|
| **A: Standalone `/seal-spec` skill** | Extract seal-spec into its own user-invocable skill | Cleaner separation, reusable outside `/write-spec` | Extra skill to maintain, breaks pipeline "one skill per step" invariant, requires users to remember a new command | Rejected — keep inline per issue guidance; revisit in a follow-up if seal-spec reuse emerges |
| **B: Inline seal-spec in `/write-spec` Phase 3** | Add seal option to the Phase 3 approval gate when multi-PR trigger detected | No new skill, preserves pipeline chain, trigger-driven (only appears when relevant) | `/write-spec` grows slightly; users can't invoke seal-spec standalone | **Selected** |
| **C: Cache dependency graph in `sdlc-state.json`** | Persist graph across runner ticks for performance | Faster runner tick (one `gh` call instead of N) | Stale-cache contamination risk (retrospective learning `bug-fix-sdlc-runner-cross-cycle-state-contamination`); graph becomes wrong after any manual GitHub edit | Rejected |
| **D: Re-derive graph from GitHub each tick** | No caching; every `selectNextIssue()` queries `gh issue list` + per-issue `gh issue view` | Always current, resilient to manual GH edits | N API calls per tick | **Selected** — N is bounded (~20 in practice), and `gh` calls are sub-second |
| **E: Regex-only parent detection** | Parse only `Depends on: #N` lines from issue body | Zero dependency on GitHub sub-issue feature | Fails on child issues created without the body convention (e.g., manual GitHub-first children) | Rejected |
| **F: GitHub sub-issue API only** | Use only `gh issue view --json parent` | Cleaner, uses platform primitive | Legacy epic issues (#138) have no native parent link; breaks backward compatibility | Rejected |
| **G: Hybrid parent detection** | Parse body cross-refs + GitHub sub-issue parent field; union the candidate set | Covers both legacy issues and new ones | Slightly more complex resolution logic | **Selected** |
| **H: New `epic` label created eagerly at skill load** | Pre-create the label when `/draft-issue` loads | Label always present | Unexpected side effect on non-epic runs | Rejected |
| **I: Create `epic` label lazily on first epic issue** | Use existing `gh label list` → `gh label create` pattern from Step 10 (lines 931–950 of draft-issue/SKILL.md) | Follows existing idiom, zero side effect on non-epic runs | Trivial extra check | **Selected** |

---

## Detailed Change Plan (per-file)

### 1. `plugins/nmg-sdlc/skills/draft-issue/SKILL.md`

All edits below go through `skill-creator` per the "Skills must be authored via `/skill-creator`" invariant.

**Step 2 extension (around lines 383–401):**
- Add "Epic" as a third option alongside Feature and Bug in the `interactive prompt` call
- Description: "A coordinated set of child issues delivering one logical feature across multiple PRs"
- Auto-detection: when Step 1b's signals fire (`distinctComponents ≥ 4`, multi-phase language, explicit `multiple PRs` keyword), mark Epic as "(Recommended)"
- Unattended-mode rule: never auto-select Epic; default to Feature unless the user description contains `Type: epic` on its own line

**New Step 6 Epic body template (around lines 699+):**
- New inline template matching the Epic Issue Body Contract above
- Placeholders for child issues are filled by Step 10

**Step 10 extension (around lines 931–950):**
- After creating the epic issue, invoke the existing batch child-creation mechanism from Steps 1b–1d with the epic's issue number as the parent
- For each child: include `Depends on: #{epic-number}` in the body, set `gh issue edit --add-parent {epic-number}` if the CLI supports it, apply labels inherited from the epic's milestone and type
- Lazy-create the `epic` label using the existing `gh label list` / `gh label create` pattern from lines 931–950; apply `epic` + `enhancement` to the parent; apply `enhancement` (not `epic`) to each child

### 2. `plugins/nmg-sdlc/skills/write-spec/SKILL.md`

**Spec Discovery extension (around lines 100–135):**
- Prepend a new Step 0: "Parent-link resolution"
  1. Extract `Depends on: #N` and `Blocks: #N` lines from the current issue body (multiple allowed)
  2. Query `gh issue view --json parent` for the GH sub-issue parent field
  3. Build candidate parent issue number set (union of body cross-refs + parent field)
  4. For each candidate, Glob `specs/*/requirements.md` and read `**Issues**` frontmatter
  5. If match found AND parent spec directory is committed: enter amendment mode
  6. If candidate found but spec directory is uncommitted: fail loudly with the AC7c message
  7. Cycle detection: maintain a visited set across recursive parent resolution (for nested epics) and terminate with a cycle-detected error on re-visit
- Keep existing keyword-based spec discovery as a fallback when no parent-link match

**Phase 3 seal-spec extension (around lines 311–415, new sub-section after the current approval gate):**
- After the user approves the tasks summary, check `design.md` for multi-PR trigger:
  - Presence of `## Multi-PR Rollout` section, OR
  - FR row whose Requirement text references "multiple PRs" or "multi-PR"
- If trigger fires (and not unattended mode): present seal option via `interactive prompt`
  - Option 1: "Seal and transition — commit specs, push, create child issues"
  - Option 2: "Don't seal — I'll handle child-issue creation manually"
- Seal action:
  1. Check for existing seal commit via `git log --format=%H --grep='^docs: seal umbrella spec for #{N}$' HEAD`
  2. If exists: print `Spec already sealed at commit {sha}` and skip to child creation
  3. Else: `git add specs/{feature-name}/ && git commit -m "docs: seal umbrella spec for #{N}"`
  4. `git push origin HEAD`
  5. Prompt for child-issue creation; if approved, re-invoke `/draft-issue` batch mechanism with the epic's delivery phases as the batch input
- Unattended-mode rule: auto-execute seal and auto-create children when trigger fires; suppress the two `interactive prompt` calls

### 3. `plugins/nmg-sdlc/skills/open-pr/SKILL.md`

**Step 2 extension (around lines 73–99):**
- After classifying bump type from the issue's labels, run sibling detection:
  1. Parse current issue body for `Depends on: #E` lines → candidate parent
  2. Fallback to `gh issue view --json parent` for sub-issue parent
  3. If parent found AND parent is labeled `epic`:
     - Read parent's Child Issues checklist from body
     - For each child (excluding current): `gh issue view $C --json state,closedByPullRequestsReferences`
     - All closed with merged PRs → keep the label-based bump (minor for enhancement)
     - Any open or no merged PR → **downgrade** to patch bump, flag as "intermediate"
- Otherwise: keep existing label-based bump

**Step 3 extension (around lines 105–108):**
- If bump was downgraded to intermediate-patch: append ` (partial delivery — see epic #{E})` to the primary CHANGELOG bullet
- Add `**Bump:** {patch|minor} (epic child: {intermediate|final})` line to the PR body footer

**Edge case AC7d (two PRs racing plugin.json):**
- After the bump-and-commit, before push: `git fetch origin && git merge-base --is-ancestor HEAD origin/main`
- If non-zero (base is stale): `git pull --rebase origin {base-branch}`
- Re-compute bump against the now-current `plugin.json` version
- If rebase has conflicts in `plugin.json` OR `marketplace.json`: abort with a clear error, do NOT force-push

### 4. `scripts/sdlc-runner.mjs`

**Milestone-issue selection (around lines 900–921):**
- Extract the current inline issue-selection prompt into a new JS function `selectNextIssueFromMilestone(milestone)` that:
  1. Lists all open `automatable`-labeled issues in the milestone via `gh issue list -s open -m "<milestone>" --label automatable --json number,body`
  2. For each candidate, fetches `gh issue view $N --json state,body,parent,closedByPullRequestsReferences`
  3. Builds an in-memory adjacency list from `Depends on: #N` body lines + parent field
  4. Filters to issues whose every dependency is either (a) closed with at least one merged PR, or (b) not in the milestone (external dep — assumed satisfied)
  5. Returns the lowest-numbered ready issue, or null if none ready
- If null returned but issues exist in the queue: exit non-zero with diagnostic listing every blocked issue and its unresolved blockers
- The adjacency list is built fresh per call — **not** stored in `sdlc-state.json`

**Existing `sdlc-state.json` fields:** unchanged. The runner continues to track `currentIssue`, `currentBranch`, etc. per cycle.

**Logging:** add `console.log('[runner] skipping #${N} — blocked by unmerged dependencies: ${blockers.join(', ')}')` inside the filter loop.

---

## Security Considerations

| Area | Implementation |
|------|----------------|
| **Authentication** | No new auth — all GitHub calls go through existing `gh` CLI and its auth |
| **Input Validation** | `Depends on: #N` body parsing must accept only digits and reject arbitrary strings (regex `/Depends on: #(\d+)\b/gi`) — prevents injection via malicious issue bodies |
| **Shell Safety** | All `gh` invocations use array-argument form (no string interpolation); issue numbers are validated as integers before passing to shell |
| **No Secrets** | `epic` label creation, child issue creation, sub-issue parent linking — all use `gh` CLI only; no tokens handled directly |
| **Force-Push Guard** | AC7d rebase flow MUST NOT force-push; conflicts escalate with a message (this is a hard invariant per the existing git-safety protocol) |

---

## Performance Considerations

| Area | Target | Mitigation |
|------|--------|------------|
| **Parent-link resolution** | < 5s for epics with up to 20 children | Bounded by N `gh issue view` calls; each is sub-second. No caching needed at N=20 |
| **Runner per-tick cost** | + ~2–5 seconds per tick for epics with children | `gh issue list` is one call; per-child `gh issue view` is one call each; at typical epic size (< 10 children) this is < 10s total; acceptable for an autonomous runner |
| **Seal-spec flow** | Single `git add` + `git commit` + `git push` | Same cost as any other commit; no scaling concern |
| **`/open-pr` sibling check** | < 3s added | N+1 calls (parent + each sibling); typically ≤ 5 siblings |

**Explicit non-optimization**: The runner does NOT cache the dependency graph between ticks per the retrospective-driven tradeoff in Alternative C vs D.

---

## Testing Strategy

Per `steering/tech.md` "Exercise-Based Verification": skills are Markdown, so testing means loading the plugin and exercising the changed skills against a test project.

| Layer | Type | Coverage |
|-------|------|----------|
| `sdlc-runner.mjs` changes | Unit (Jest) | `selectNextIssueFromMilestone()` — happy path, all-blocked, external deps, cycle detection |
| `/draft-issue` Epic classification | Exercise test (Agent SDK) | Feature/Bug/Epic branching; auto-detection heuristic; unattended-mode default |
| `/draft-issue` Epic body template | Exercise test (Agent SDK) + dry-run | Generated epic body matches the Epic Issue Body Contract; `epic` label applied |
| `/write-spec` parent-link resolution | Exercise test (Agent SDK) | Three scenarios: (a) valid parent link + committed spec → amendment, (b) valid parent link + uncommitted → AC7c loud failure, (c) no parent link → keyword fallback; plus cycle-detection case |
| `/write-spec` seal-spec flow | Exercise test (Agent SDK) | Trigger detection; seal commit shape; idempotency re-run; child-creation invocation; unattended auto-execute |
| `/open-pr` sibling-aware bumping | Exercise test + dry-run | All-closed → minor; any-open → patch + CHANGELOG note; AC7d rebase-and-retry |
| BDD feature file | Gherkin | All 11 scenarios in the requirements Gherkin Preview |

---

## Risks & Mitigations

| Risk | Likelihood | Impact | Mitigation |
|------|------------|--------|------------|
| Parent-link resolution picks wrong parent when child has multiple `Depends on:` lines | Medium | Medium | Prefer native GH sub-issue parent field as tiebreaker; if still ambiguous, require user confirmation (or in unattended mode, abort with diagnostic) |
| `gh` CLI version doesn't support `--json parent` | Low | High | Runtime check: if `--json parent` returns nothing across all issues, fall back to body-only resolution and log a warning; document minimum `gh` version in `steering/tech.md` |
| Seal-spec commits sensitive files by accident | Low | High | Seal only stages `specs/{feature-name}/` — never `git add -A`; uses explicit path argument |
| Runner dependency-graph query becomes expensive at large epic size (> 50 children) | Low | Medium | Add a bounded concurrency limit on `gh issue view` (e.g., 5 parallel); if average tick exceeds 30s, revisit caching with a versioned invalidation key |
| Two runners running simultaneously against the same milestone pick the same "ready" issue | Low | Medium | Existing runner single-instance lock (per `sdlc-state.json`) already prevents this; no additional guard needed |
| Changing label logic (downgrade to patch for intermediate) breaks existing bump classification for non-epic PRs | Medium | High | Sibling check is gated on parent being labeled `epic` — non-epic PRs flow through unchanged path |
| A child PR closes the epic prematurely via "Closes #{epic}" | Medium | Medium | Add AC7a warning in `/open-pr`: if the current PR body contains `Closes #{E}` and `#{E}` is labeled `epic`, prompt/escalate before submit |
| `skill-creator` refuses to add novel sections to existing skills | Low | Medium | Prepare test cases ahead of implementation; if rejected, iterate on description/frontmatter before content |

---

## Open Questions

- [ ] AC6 — Should the runner itself ever "process" an epic issue (running an empty `/write-code` just to close it), or always skip epics in the milestone queue? **Tentative answer**: always skip epics. The epic is closed automatically when its last child PR merges (via GH's "Closes #{epic}" from the final child's PR body).
- [ ] AC5 sibling-detection scope — cross-milestone siblings count or not? **Tentative answer**: all children listed in the epic's Child Issues checklist, regardless of milestone. This matches the semantic intent (the epic's deliverable).
- [ ] Seal-spec on the epic vs on the first child — the spec directory convention dictates that the umbrella spec lives under the epic's branch. After seal, does the first child branch off `main` or off the epic's sealed branch? **Tentative answer**: off `main`, then amends the parent spec in its own commits. This avoids a long-lived epic branch.

---

## Issue #177 Architecture Supersession

### Superseded Decisions

Issue #177 changes the lifecycle boundary rather than adding another special
case to the #149 flow. The following decisions replace their historical
counterparts above:

| Historical #149 decision | Authoritative #177 decision |
|---------------------------|------------------------------|
| Start the epic and write one executable umbrella spec on its branch | Never start an epic. The first ready child creates a coordination aggregate and its own executable child package. |
| Append every child's executable requirements and tasks to the parent package | Give every child a normal, separately authoritative five-file package; the aggregate contains no executable tasks or Gherkin scenarios. |
| Treat `Depends on: #epic` as a dependency edge unless a consumer special-cases it | Resolve native epic membership first and remove only the confirmed coordination-parent pair from execution in-degree. Preserve every genuine dependency. |
| Finish `open-pr` after publication/readiness handoff | Keep `open-pr` active until the exact verified head is merged, its child issue is closed, and eligible ancestors are reconciled. |
| Let the final PR close an epic through closing text | Child PRs close only their child. Post-merge reconciliation closes an eligible epic through an explicit, verified issue mutation. |
| Treat legacy repair as identity-only and forward-only | Audit graph, spec authority, checklists, Project status, and issue state; apply an exact approved per-epic repair in either direction. |

The existing relationship representations remain supported for compatibility,
but native GitHub parent/sub-issue data is the membership authority whenever
it is fully readable. Body `Depends on:` and `Blocks:` records continue to be
execution dependencies unless the shared classifier proves that exact pair is
epic coordination.

### Design Principles

1. **Coordination and execution are separate graphs.** Native parent/sub-issue
   edges form the epic membership graph. Confirmed non-epic relationship edges
   form the execution graph. Membership never adds topological in-degree.
2. **GitHub evidence is refreshed and complete.** Every native child connection
   is paged to exhaustion. A missing page, cycle, unknown target, or conflicting
   representation is `unverifiable`, not an empty or complete graph.
3. **Specification authority is physical and machine-readable.** Aggregate and
   child packages use different directory/package shapes and cross-agreeing
   manifests, so prose cannot silently duplicate executable ownership.
4. **Delivery is terminal.** Invoking `open-pr` authorizes the configured merge
   path for that issue. The skill may wait, remediate, reverify, push, and merge;
   opening a PR is an intermediate state.
5. **Repair is proposal-driven.** Audit is read-only. Each epic mutation set has
   a content digest, explicit approval, a fresh drift check, post-write proof,
   and a no-op second audit.

### Component Topology

```text
fully paged GitHub issue graph
        |
        v
scripts/epic-relationships.mjs
  - role and durable identity
  - full parent lineage
  - execution dependencies
  - native direct-child set
        |
        +------------------------------+
        |                              |
        v                              v
start-issue selection          scripts/epic-spec-authority.mjs
  - omit epics                   - aggregate/child manifests
  - show lineage                 - unique executable ownership
  - normal dependency graph      - migration/repair proposals
                                       |
                                       v
write-spec -> write-code -> verify-code -> open-pr terminal loop
                                              |
                                              v
                                  post-merge epic completion
                                              |
                                              v
                                 upgrade-project audit/repair
```

Markdown skills remain orchestration surfaces. Deterministic parsing,
normalization, identity, completion, and idempotence rules live in Node helpers
with injected adapters so they can be unit-tested without live GitHub writes.
All skill edits are authored under the repository's `skill-creator` invariant.

### Shared Relationship and Completion Model

`scripts/epic-relationships.mjs` remains the one relationship normalizer. It is
extended rather than duplicated:

```js
deriveEpicLineage({ issues, activeIssueNumber, nativeAvailable })
// {
//   status: 'resolved' | 'ordinary' | 'ambiguous' | 'cycle' | 'unverifiable',
//   lineage: [{ number, title }], // root to direct parent
//   executionDependencies: [{ issueNumber, state, blocking, signals }],
//   gaps: []
// }

classifyEpicCompletion({ issues, epicIssueNumber, specAuthority,
  nativeAvailable, projectItems })
// {
//   status: 'eligible' | 'incomplete' | 'repair_required' | 'unverifiable',
//   directChildren: [], incompleteChildren: [], nextParentNumber: null,
//   projectMutations: [], gaps: [], evidenceDigest: 'sha256:...'
// }
```

The existing `classifyEpicRelationships()` result remains backward compatible.
The new lineage traversal repeatedly follows the one confirmed native parent,
retains number and title, and stops on the first repeated node or incomplete
page. The completion classifier applies this order:

1. Confirm the target is an epic through the shared role classifier.
2. Require successful, fully paged native direct-child discovery.
3. Reject a zero-child epic, a cycle, duplicate/conflicting parents, or any
   unresolved child record.
4. Require every direct child to be `CLOSED`. A child that is itself an epic is
   acceptable only after its own completion evidence is valid.
5. Require aggregate/child authority to be `valid` for the whole direct-child
   set; a planned or ambiguous child package prevents closure.
6. Resolve every readable ProjectV2 item and its Status field. An attached item
   with an unreadable field or no unambiguous Done option is unverifiable. No
   attached Project item is recorded as `not_applicable` and does not invent a
   Project mutation.
7. Return a digest over issue states, relationship node IDs/page completion,
   spec tree identities, and Project field/option IDs. Mutation consumers must
   re-fetch and reproduce the digest immediately before writing.

No checklist or session-cached sibling set can authorize selection or closure.
The checklist remains a human-readable projection whose drift is reported and
repairable.

### Selection and Start-Issue Flow

`skills/start-issue/SKILL.md` and
`skills/start-issue/references/milestone-selection.md` use one selection order:

1. Fully hydrate enough issue and relationship data to classify each candidate.
2. Remove confirmed epics before calculating the shortlist target or bounded
   backfill count. `ambiguous`, `inconsistent`, and `unverifiable` candidates are
   surfaced as blockers, never treated as ordinary issues.
3. Evaluate ordinary issues and epic children through the unchanged execution
   dependency and deliverable-readiness classifiers. The confirmed epic-parent
   pair is informational only; all sibling and external prerequisite pairs stay
   in the graph.
4. Render a child label such as
   `#214 Child title (epic #108 Parent > #170 Nested)` using the resolved
   root-to-parent lineage. This annotation does not affect readiness.
5. If explicit input resolves to `role = epic`, return a coordination-only
   explanation and the currently ready direct descendants. Do not invoke
   `gh issue develop`, switch/create a branch, close/reopen the issue, or change
   Project status.

This same classifier feeds runner selection, preventing an unattended path from
bypassing the interactive rule.

### Aggregate and Child Specification Packages

An epic aggregate has a distinct non-executable package:

```text
specs/epic-<parent-title-slug>/
  requirements.md     # aggregate outcomes and cross-child constraints
  design.md           # topology, integration contracts, rollout boundaries
  epic-scope.json     # graph and aggregate-to-child traceability
```

A child retains the normal executable package:

```text
specs/feature-<child-title-slug>/   # or bug-/spike- as classified
  requirements.md
  design.md
  tasks.md
  feature.gherkin
  issue-scope.json
  epic-link.json
```

Aggregate outcomes use stable `EO###` identifiers. They describe results that
span children and are not copied into child AC/FR/task/scenario namespaces. A
child may contribute to multiple outcomes, and an outcome may need multiple
children, but each executable `AC`, `FR`, `T`, and `SCN` identifier belongs to
exactly one child issue through that child's `issue-scope.json`.

`epic-scope.json` schema version 1:

```json
{
  "schemaVersion": 1,
  "epicIssue": 108,
  "aggregatePath": "specs/epic-route-weather-reliability",
  "outcomes": [
    { "id": "EO001", "childIssues": [109, 110] }
  ],
  "children": [
    {
      "issue": 109,
      "specPath": "specs/feature-sample-route-weather",
      "packageState": "canonical",
      "outcomes": ["EO001"]
    },
    {
      "issue": 110,
      "specPath": "specs/feature-present-route-weather",
      "packageState": "planned",
      "outcomes": ["EO001"]
    }
  ],
  "migrations": []
}
```

`epic-link.json` schema version 1:

```json
{
  "schemaVersion": 1,
  "epicIssue": 108,
  "epicSpecPath": "specs/epic-route-weather-reliability",
  "childIssue": 109,
  "childSpecPath": "specs/feature-sample-route-weather",
  "outcomes": ["EO001"]
}
```

If a native direct child is itself an epic, the parent child row uses that
issue's distinct `specs/epic-*` aggregate path. The nested epic receives no
`epic-link.json` and no executable files. Authority recursively validates the
nested aggregate with cycle detection. A canonical nested aggregate remains a
valid coordination child while its own executable descendants are planned;
the nested issue's open state and its own completion proof prevent premature
ancestor closure.

`scripts/epic-spec-authority.mjs` provides `--epic N`, `--child N`, and `--all`
JSON modes with an optional Git source. It validates normalized paths, schema
versions, issue numbers, exact bidirectional agreement, unique child package
ownership, child `issue-scope.json` coverage, absence of aggregate tasks and
Gherkin, and the set of native children supplied by relationship evidence. Its
statuses are `valid`, `planned`, `repair_required`, and `unverifiable`.
Unknown schema versions, duplicate issue/path ownership, missing links, or an
aggregate containing executable files fail closed.

### First and Later Child Write-Spec Flow

For a ready child with a confirmed parent, `write-spec` first runs native
relationship and canonical aggregate discovery:

- **No aggregate exists:** the normal requirements, design, and tasks gates
  review both the new aggregate contract and the active child's executable
  package. Files are not written before their respective gates. The resulting
  spec-only publication contains exactly both approved directories, uses the
  existing dedicated publication-ref/marker safeguards, references without
  closing the epic, and reaches the default branch before code work continues.
- **A canonical aggregate exists and the child is planned:** create only the
  reviewed child package plus its `epic-link.json`, and update only the matching
  planned entry in `epic-scope.json`. Publish and refresh canonical proof before
  implementation.
- **A child package already exists:** enter normal issue-scoped amendment mode.
  Aggregate or sibling files are immutable unless the user separately approves
  an aggregate amendment at the applicable review gate.
- **Authority conflicts:** stop before spec writes and route the exact finding to
  `upgrade-project`; never append child obligations to the aggregate as a
  fallback.

For nested lineage, publish the immediate epic/executable-leaf pair first, then
reconcile missing ancestor links leaf-to-root. Each ancestor publication pairs
only the approved ancestor aggregate/manifest with the already canonical nested
aggregate tree, references both epic issues without closing them, and refreshes
default-branch proof before moving upward. No nested epic receives an
executable package or code handoff.

`scripts/umbrella-spec-status.mjs`,
`scripts/umbrella-publication-status.mjs`, and
`references/canonical-umbrella-spec.md` are generalized to aggregate packages
while retaining legacy umbrella recognition. Canonical proof compares the full
approved aggregate-plus-active-child tree set and the exact publication marker.
Publication cannot start or close the epic and cannot modify release artifacts.

### Downstream Spec Consumption

`write-code`, `verify-code`, `status`, and `open-pr` resolve the active issue's
child package from `epic-link.json`, validate it against `epic-scope.json`, and
scope work through the child `issue-scope.json`. They may read aggregate outcomes
and topology as bounded context but cannot claim aggregate IDs as executable
completion evidence. Ordinary non-epic issue behavior remains unchanged.

The original cumulative #149 format remains readable as `legacy` during audit,
but new writes cannot create it. Issue #177's own amendment stays in the
historical package because it is the migration implementation issue, not an
example of the post-migration package shape.

### Terminal Open-PR Delivery State Machine

`skills/open-pr/SKILL.md` becomes the terminal delivery owner for its invocation:

```text
preflight -> create/resume exact PR -> observe exact head
    -> pending checks: wait and refresh
    -> actionable review: fix -> verify -> push -> observe new head
    -> mergeability defect: safely rebase/fix -> verify -> push -> observe
    -> success-equivalent checks + clean reviews + CLEAN
    -> revalidate exact head -> merge -> verify PR MERGED + child CLOSED
    -> reconcile eligible epic ancestors -> complete
```

The loop fingerprints `{pr, headOid, checks, reviews, threads,
mergeStateStatus}` on every observation. A changed head invalidates all prior
verification evidence. Remediation uses the existing write-code, verify-code,
review-thread, and CI contracts; release/version artifacts are recomputed after
rebases and never force-pushed. Pending checks cause continued monitoring with
periodic progress updates, not a successful return.

Before merge, all configured checks must be success-equivalent, requested
changes and unresolved actionable threads must be absent, and live
`mergeStateStatus` must be `CLEAN`. The merge command targets the exact observed
head and the configured repository merge method. Completion requires a fresh PR
state of `MERGED`, matching merged/head OIDs where GitHub exposes them, and a
fresh child issue state of `CLOSED`.

The only incomplete terminal is one precise blocker outside safe authorized
repository scope, such as a required human approval, unavailable protected
secret, permission denial, or persistent external service outage. The result
names the owner, evidence, and one recovery action. A pending check, fixable
review, dirty merge state, or merely open PR is not a terminal result.

### Post-Merge Epic Closure and Nested Cascade

After child closure proof, `open-pr` walks the child's confirmed parent chain
leaf-to-root:

1. Hydrate the immediate parent, all native direct children, spec authority,
   and readable Project status; require `classifyEpicCompletion().status` to be
   `eligible`.
2. Re-fetch and compare the evidence digest immediately before mutation.
3. Reconcile each attached readable Project Status to its unambiguous Done
   option, then close the epic with an auditable completion comment. Each write
   is idempotent and a rerun resumes any partially applied sequence.
4. Re-fetch the epic and Project items and require the intended state.
5. If the closed epic has a confirmed parent, repeat. Stop normally at the first
   incomplete parent; stop with exact evidence on repair-required or
   unverifiable state.

Closing PR text never targets an epic. A zero-child epic, truncated connection,
cycle, open/missing child, conflicting identity, incomplete spec package, or
unreadable attached Project state prevents closure. No sibling, external issue,
or unrelated Project item is mutated.

### Upgrade Audit and Explicit Repair

`upgrade-project` gains an epic audit before its mutation summary. It combines
`epic-relationships --all`, `epic-spec-authority --all`, checklist comparison,
issue state, and Project state into one group per epic. The read-only report can
propose:

- durable native/body/label/checklist identity reconciliation;
- a legacy cumulative-spec split into one aggregate and exact child packages;
- executable AC/FR/task/scenario ownership transfer to one child;
- stale-complete epic closure and Done reconciliation;
- premature epic reopening and a deterministic non-Done Project status;
- nested leaf-to-root reconciliation.

Each proposal displays exact issue/path/field mutations and a SHA-256 digest of
the source Git trees plus live GitHub records. Approval is requested separately
for each epic. Immediately before applying, the workflow repeats the audit and
requires the same digest. Spec migration preserves project-authored prose,
records the source tree and ID-to-child mapping in `epic-scope.json.migrations`,
and stages only the approved paths. If ownership cannot be proven from existing
issue-scope records, issue references, and non-overlapping IDs, no file or issue
is changed; the report instead offers an explicit child-drafting decision.

State repair is bidirectional. An open epic that satisfies the completion
classifier may be closed; a closed epic with open children or invalid authority
may be reopened. The proposal resolves an exact Project Status option before
approval; absence of an unambiguous target leaves Project state unchanged and
the group blocked. After apply, the workflow verifies every mutation and repeats
the audit. Success requires the approved finding to disappear and the second
apply plan to be empty.

### Documentation and Managed-Asset Parity

The implementation audits and updates all maintained copies of the lifecycle
contract, including:

- root `README.md` and `CONTRIBUTING.md`;
- `references/contribution-guide.md`, `references/contribution-gate.md`,
  `references/issue-form.md`, and the generated `.github/ISSUE_TEMPLATE` asset;
- onboarding and upgrade skill guidance, references, and templates;
- write-spec templates and aggregate/child references;
- start-issue, write-code, verify-code, status, open-pr, and shared relationship,
  spec-context, canonical-publication, and issue-scope references;
- repository steering documents whose delivery or skill boundaries changed.

Contribution guidance explicitly states that epics cannot be started, children
follow the ordinary dependency graph, membership is informational, executable
work belongs to child specs, `open-pr` ends only after merge, and backlog repair
requires exact approval. Contract tests render/generated consumer assets and
assert semantic markers so a future template edit cannot silently restore the
historical workflow.

### Security, Reliability, and Performance

| Concern | Design response |
|---------|-----------------|
| Shell and GraphQL injection | Validate positive issue numbers, normalized repository/spec/ref paths, field IDs, and option IDs; pass commands as argument arrays and preserve GraphQL variables. |
| Partial pagination | Treat any `hasNextPage` without a consumed next page, missing cursor, or page cap as `unverifiable`; never interpret it as completion. |
| Stale approval | Digest the full proposal evidence and reproduce it directly before each mutation group. |
| Partial multi-system mutation | Use a resumable ordered journal, idempotent writes, and post-write rehydration; never compensate by mutating unrelated records. |
| Arbitrary Markdown migration | Transfer only uniquely attributable stable IDs; preserve ambiguous content and require a child-drafting decision. |
| Delivery-loop churn | Compare progress fingerprints, continue on genuine progress/pending work, and return only an exact external-authority blocker. |
| API volume | Batch issue hydration where possible, fully page each bounded connection, and cap concurrency without truncating results. Typical epics remain under 20 children. |
| Backward compatibility | Keep legacy relationship and cumulative-spec readers in audit/consumer-safe modes; prohibit new legacy writes. |

### Verification Strategy

| Layer | Evidence |
|-------|----------|
| Helper unit tests | Lineage, graph separation, pagination gaps, nested cycles, completion eligibility, manifest validation, migration proposals, digest drift, and rerun idempotence. |
| Contract tests | Every affected skill/reference/template contains the same selection, authority, terminal-delivery, closure, and approval invariants. |
| Disposable repository exercises | Ordinary issue selection; explicit and automatic epic exclusion; first/later child spec publication; pending/failing/review/CLEAN delivery transitions; final-child and nested closure; stale-complete close; premature reopen; ambiguous ownership; approved split; no-op rerun. |
| Existing regression suite | Historical #149 identity, publication, versioning, issue-scope, start-issue backfill, contribution guide/form/gate, and open-pr exercises remain green or are deliberately superseded. |
| Real-project evidence | Run a read-only audit against PathCast's live epic graph and repository specs. Perform all mutation exercises only in disposable repositories unless PathCast writes receive separate authorization. |
| Installed-plugin exercise | Refresh the local plugin cache, prove source/cache parity, and invoke changed skills/helpers from the installed path rather than relying only on source-tree tests. |

### Alternatives Considered for #177

| Option | Decision |
|--------|----------|
| Keep one cumulative umbrella package and add stricter issue-scope rows | Rejected: physical co-location keeps authority ambiguous and makes child verification depend on mutable sibling content. |
| Create a branch/spec for each epic but forbid only code work | Rejected: starting the container still consumes selection/status semantics and recreates a non-deliverable lifecycle. |
| Infer membership only from `Depends on:` | Rejected: it conflates coordination with execution and cannot prove the complete child set. |
| Use webhooks or a background closer | Rejected: it adds deployment/state outside the plugin. The already-running terminal delivery flow owns closure. |
| Close the epic from the final child PR body | Rejected: closing references are decided before fully paged child/spec/Project revalidation and are unsafe for nested repair. |
| Automatically migrate every legacy cumulative spec | Rejected: prose-to-child ownership can be ambiguous. Exact per-epic approval and fail-closed mapping are required. |
| Separate aggregate and child packages with agreeing manifests | Selected: the filesystem makes coordination versus execution authority explicit and testable. |

### Resolved #177 Design Questions

- Epics are never execution candidates, including explicit starts and runner
  selection.
- All fully paged native children count regardless of milestone.
- The first ready child creates the aggregate and its own child package in one
  reviewed spec publication; no epic branch is created.
- Aggregate specs own outcomes/topology only; child packages own all executable
  acceptance, task, scenario, implementation, and verification evidence.
- `open-pr` owns terminal monitoring, safe remediation, merge, child closure
  proof, and eligible ancestor closure for the invoked issue.
- Backlog repair is opt-in per epic, can close or reopen, and never guesses an
  ambiguous executable owner.

---

## Change History

| Issue | Date | Summary |
|-------|------|---------|
| #149 | 2026-04-19 | Initial feature spec |
| #177 | 2026-08-16 | Superseded executable-epic flow with coordination-only selection, split spec authority, terminal delivery, automatic closure, explicit repair, and documentation parity |

---

## Validation Checklist

- [x] Architecture follows existing project patterns (per `structure.md`) — no new layers, changes are local to four existing files
- [x] All API/interface changes documented with schemas — Epic Body Contract, Child Body Contract, PR body line format
- [x] Database/storage changes planned — deliberate non-change (no graph caching in `sdlc-state.json`)
- [x] State management approach is clear — per-skill state transitions diagrammed
- [x] UI components — N/A; surfaces limited to interactive prompt options, stdout log lines, PR body line
- [x] Security considerations addressed — input validation, shell safety, no force-push
- [x] Performance impact analyzed — bounded N, sub-10s tick cost
- [x] Testing strategy defined — exercise testing via Agent SDK per `tech.md`
- [x] Alternatives were considered and documented — 9 options across 3 decisions
- [x] Risks identified with mitigations — 9 risks assessed
- [x] Issue #177 explicitly supersedes every conflicting #149 lifecycle decision
- [x] Aggregate and child storage schemas define non-overlapping authority
- [x] Selection, publication, terminal delivery, closure, and repair state transitions are defined
- [x] Nested, partial-page, zero-child, drift, ambiguity, and partial-mutation failures are fail-closed
- [x] README, contribution guidance, distributed templates, exercises, and real-project audit are in scope
