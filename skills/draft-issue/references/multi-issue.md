# Multi-Issue Detection, Split Confirmation, DAG Inference, Per-Issue Loop, Autolinking, Batch Summary, Epic Coordination

**Consumed by**: `draft-issue` Steps 1b, 1c, 1d, Per-Issue Loop, 6 (Epic template), 10, 11.
**Triggering condition**: The initial description shows multi-issue signals (bullets, conjunctions, distinct components) OR the user selects the Epic classification at Step 2.

This reference covers the entire multi-issue pipeline: detecting that one prompt asks for several issues, confirming the proposed split with the user, inferring a dependency graph across the planned asks, looping issue creation with read-only session state, wiring sub-issue links after creation, rendering the final batch summary, and the Epic coordination template used when the user picks the Epic type at Step 2.

## Table of Contents

1. [Step 1b — Detect Multi-Issue Prompt](#step-1b--detect-multi-issue-prompt)
2. [Step 1c — Split-Confirm Menu](#step-1c--split-confirm-menu)
3. [Step 1d — Infer Dependency Graph + Graph-Confirm](#step-1d--infer-dependency-graph--graph-confirm)
4. [Per-Issue Loop](#per-issue-loop)
5. [Epic Coordination Template (Step 6)](#epic-coordination-template-step-6)
6. [Step 10 — Autolink Batch](#step-10--autolink-batch)
7. [Step 11 — Batch Summary](#step-11--batch-summary)

---

## Step 1b — Detect Multi-Issue Prompt

### Input

- `session.initialDescription` from Step 1

### Process

Run a heuristic over the initial description to decide whether the user asked for one issue or several. Signals (all computed from the initial description):

| Signal | Extraction |
|--------|-----------|
| `conjunctionHits` | Count of occurrences of `{"and also", "second thing", "another thing", "in addition", "plus", "separately", "as well as another", "on top of that", "two things", "three things"}` (case-insensitive, word-boundary matched) |
| `bulletListCount` | Count of top-level `- ` / `* ` / numbered `1.` list items |
| `distinctComponents` | Count of distinct top-level component mentions (file paths, skill names, module references) appearing in different sentences |
| `sentenceCount` | Total sentence count |

#### Split decision

| Confidence | Rule |
|------------|------|
| `high` | `bulletListCount ≥ 2` OR `conjunctionHits ≥ 2` |
| `medium` | `conjunctionHits ≥ 1` AND `distinctComponents ≥ 2` |
| `low` | `distinctComponents ≥ 3` AND `sentenceCount ≥ 4` (borderline — prefer to propose and let the user collapse) |
| `single` | otherwise — exit with `"single-issue detected"` trail note |

When a split is proposed, segment the description at conjunction markers / list boundaries and generate a one-line summary per segment. Assign each segment an `id` (`A1`, `A2`, ...).

#### Trail note (always emitted)

Emit a visible session note regardless of the decision. Examples:

```
Step 1b: single-issue detected — no split proposed.
  Signals: conjunctionHits=0, bulletListCount=0, distinctComponents=1 (confidence: single)

Step 1b: multi-issue split proposed (confidence: high).
  Signals: conjunctionHits=2, bulletListCount=3, distinctComponents=4
  Proposed: 3 asks
```

### Output

- `session.proposedSplit` — `{asks: [{id, summary, sourceText}], signals, confidence}` or `null` on the single-issue path

On the single-issue path, skip directly to the Per-Issue Loop (one iteration).

---

## Step 1c — Split-Confirm Menu

Runs only when `session.proposedSplit` is non-null.

### Input

- `session.proposedSplit` from Step 1b

### Process

Render an inline summary of the proposed split:

```
Multi-issue detection proposed a split of N asks:

  A1: [one-line summary of ask 1]
  A2: [one-line summary of ask 2]
  A3: [one-line summary of ask 3]

Signals: conjunctionHits=2, bulletListCount=3, distinctComponents=4 (confidence: high)
```

Present a `request_user_input` gate:

```
question: "How would you like to proceed with the proposed split?"
options:
  - "[1] Approve the split as proposed"
  - "[2] Adjust the split (merge or re-divide)"
  - "[3] Collapse back to a single issue"
```

- **`[1] Approve`** — proceed to Step 1d.
- **`[2] Adjust`** — use the free-form `Other` answer for `"How should the split be adjusted? (e.g., 'merge A1 and A2', 'split A3 into two')"`, apply the edits, re-render the summary, and re-present the `request_user_input` gate. Loop until `[1]` or `[3]`.
- **`[3] Collapse`** — set `session.proposedSplit = null` and proceed to Step 2 with the original single-issue description (false-positive path).

### Output

- `session.proposedSplit` — confirmed (possibly edited) or null on collapse

### Human Review Gate

This gate blocks Step 1d until the user approves, adjusts-then-approves, or collapses.

---

## Step 1d — Infer Dependency Graph + Graph-Confirm

Runs only when `session.proposedSplit` is non-null after Step 1c.

### Input

- `session.proposedSplit.asks`

### Process

#### Edge inference rules (applied in order; duplicates suppressed)

1. **Explicit cues** — if an ask's text contains `"depends on <reference>"`, `"requires <reference>"`, `"blocked by <reference>"`, or `"blocks <reference>"`, add the corresponding edge.
2. **Shared component — precursor** — if two asks mention the same top-level component and one ask's summary contains foundational language (`"add"`, `"create"`, `"introduce"`, `"scaffold"`) while the other contains modification language (`"update"`, `"enhance"`, `"extend"`, `"wire"`), the scaffolding ask is the parent.
3. **AC/FR overlap** — if segments describe the same acceptance criterion with differing scope (one broader, one narrower), the narrower ask depends on the broader one.

#### Deliverable-boundary validation

Read `../../../references/deliverable-dependencies.md`. Before rendering the graph:

1. Inventory task IDs and named artifacts owned by each planned ask. When the batch comes from `write-spec`, use its approved task/artifact ownership map; otherwise use explicit task/artifact statements in each ask and the investigation summary.
2. Detect references from one ask to another ask's task or artifact, including explicit `after`, `requires`, `consume`, `baseline`, and `checkpoint` language.
3. Classify each reference as a whole-issue wait or a separately reviewed baseline-extraction proposal. Recommend a whole-issue wait unless the baseline is independently reviewable and parallel delivery materially requires another issue/PR.
4. For a whole-issue wait, add the owner-to-consumer DAG edge and store `{owner, consumer, description, boundary: "whole-issue"}` in the current scope's deliverable prerequisite list. For extraction, stop before the graph gate and return the proposed baseline ownership, consumers, and task/artifact scope for a separate `$nmg-sdlc:draft-issue` plus `$nmg-sdlc:write-spec` review; do not revise `session.proposedSplit` or create an ask inside this flow. When a later invocation consumes that separately approved plan, require the baseline ask to exist, add its owner-to-consumer edges, and store one `{owner, consumer, description, boundary: "baseline"}` record per consumer before drafting.
5. If any reference still points to a midpoint inside a broader child, stop before the graph gate. Do not represent it as schedulable prose.

Normalize the result to a DAG. A deliverable-boundary edge is mandatory and may not be dropped to break a cycle; return the conflicting plan to boundary resolution instead. For a cycle containing only heuristic non-deliverable edges, drop the lowest-priority edge (last rule applied wins tie-breaks) and emit a visible note: `"Graph cycle detected — dropped edge A{X} → A{Y}."`

#### Render

```
Proposed dependency graph:

  A1 ──▶ A2 ──▶ A3
  A1 ──▶ A4

(A1 is the root; A3 and A4 are leaves.)

Deliverable boundaries:
  A2 requires A1 — T054 validated schema/register baseline (whole-issue dependency)
```

Present a `request_user_input` gate:

```
question: "Approve the proposed dependency graph?"
options:
  - "[1] Approve the graph"
  - "[2] Adjust edges (add/remove a dependency)"
  - "[3] Flatten — no dependencies between issues"
```

- **`[1] Approve`** — proceed only when every displayed cross-child prerequisite has a deliverable boundary.
- **`[2] Adjust edges`** — use the free-form `Other` answer for `"Describe the edge to add or remove, e.g., 'A2 depends on A4' or 'remove A1 → A3'"`; apply only when every deliverable prerequisite remains represented, then re-render and re-present the gate. Removing a required edge first requires an approved baseline extraction or ownership change.
- **`[3] Flatten`** — clear all edges only when the plan has no cross-child deliverable prerequisites. Otherwise explain which required edges prevent flattening and re-present the gate.

### Output

- `session.dag` — ordered list of `{parent: askId, child: askId}` pairs; empty on flatten
- `session.deliverablePrerequisites` — ordered scope-bound records `{owner, consumer, description, boundary}` approved with the graph

### Human Review Gate

This gate blocks the Per-Issue Loop until the user approves or flattens.

---

## Per-Issue Loop

The confirmed split + DAG drives a loop over Steps 2–9. Each iteration runs the full existing Steps 2–9 contract independently — a preamble note: each step below now runs **per planned issue**.

### Shared read-only session state

| Field | Source | Consumers |
|-------|--------|-----------|
| `session.productContext` | Step 1 | Step 4 investigation |
| `session.dag` | Step 1d | Step 6 and Step 10.4 body cross-ref placeholders |
| `session.deliverablePrerequisites` | Step 1d | Step 6 structured records and Step 10.5 graph verification |
| `session.coordinationMembershipEdges` | Initialized empty; Step 10.1 epic fan-out is the sole append owner | Steps 10.2-10.3 native umbrella membership |

Iterations **must not mutate** `session.productContext`, `session.dag`, or the approved deliverable prerequisite records. They may read `session.coordinationMembershipEdges`, but only the Step 10.1 epic fan-out operation may append an exact created parent/child pair. Everything else — classification, milestone, investigation, interview answers, depth, understanding, draft, review counter — lives in a per-iteration `DraftState`.

### Loop ordering

Issues are created in **topological order** by `session.dag` so dependency issue numbers exist before Step 10 resolves body cross-references. Flat DAGs preserve the order from `session.proposedSplit.asks`. Ordinary DAG edges never assign a GitHub native parent; that single-parent relationship is reserved for a synthesized epic-to-child coordination membership edge.

### Iteration output

Each successful iteration appends to `session.createdIssues`:

```
session.createdIssues = [
  { scopeId, planId, issueNumber, url, labels, classification, dependsOn: [askId, ...], blocks: [askId, ...] },
  ...
]
```

Assign `scopeId = outer` to the original batch. Assign each nested epic child batch the collision-safe scope `epic-<created-epic-issue-number>`; plan IDs are unique only within that scope. `dependsOn` / `blocks` are computed from the iteration's read-only `activeDag`: the outer `session.dag` for the original batch or a Step 10-local `childDag` for epic fan-out. They are passed with `scopeId` to Step 6 so it can write placeholder body lines (`Depends on: <A1>`, `Blocks: <A3>`); Step 10 later resolves them only against created records in the same scope. An epic child's separate `coordinationParentNumber` supplies its mandatory `Depends on: #P` membership line and is never added to these execution-dependency fields.

### Single-issue path

When `session.proposedSplit === null`, the loop runs exactly once against the original description and `session.dag === []`. Steps 10 and 11 still run. Step 10 is a no-op for an ordinary feature or bug, while an epic may populate its child-membership queue through Step 10.1; Step 11 renders the resulting summary.

### State model

```
SessionState {
  initialDescription: string
  productContext: object

  proposedSplit: {
    asks: [{ id, summary, sourceText }]
    signals: { conjunctionHits, bulletListCount, distinctComponents, sentenceCount }
    confidence: 'high' | 'medium' | 'low'
  } | null

  dag: [{ parent: askId, child: askId }]
  deliverablePrerequisites: [{ scopeId, owner: askId, consumer: askId, description, boundary }]
  coordinationMembershipEdges: [{ scopeId, parent: issueNumber, child: issueNumber }]  // initialized []

  subIssueSupported: boolean | null
  nativeLinkComplete: boolean
  autolinkDegradationNotes: string[]

  createdIssues: [{
    scopeId, planId, issueNumber, url, labels, classification, dependsOn, blocks
  }]

  abandoned: boolean
}

DraftState {
  scopeId: string  // outer or epic-<created-epic-issue-number>
  planId: askId
  activeDag: [{ parent: askId, child: askId }]  // read-only outer or child-scoped graph
  activeDeliverablePrerequisites: [{ owner: askId, consumer: askId, description, boundary }]  // read-only, current scope
  coordinationParentNumber: issueNumber | null  // separate from execution dependencies
  description: string  // per-ask summary + sourceText (or original description on single-issue path)
  classification: 'feature' | 'bug' | 'epic'
  milestone: string | null
  investigation: { filesFound, componentsInvolved, descriptionVagueness, summary }
  depth: 'core' | 'extended'
  depthOverridden: boolean
  anythingMissed: string | null
  interviewAnswers: map<round, text>
  understanding: { persona, outcome, acOutline, scopeIn, scopeOut }
  understandingConfirmed: boolean
  draft: string  // may contain "Depends on: <askId>" placeholders
  consecutiveRevises: int
  approved: boolean
}
```

---

## Epic Coordination Template (Step 6)

When `classification === 'epic'`, synthesize the issue body using this template **only**. An epic is a coordination document — it MUST NOT contain a User Story, Acceptance Criteria, or Functional Requirements. ACs belong to each child issue.

```markdown
## Goal

[1–3 sentences describing what this epic delivers when all children are done.]

## Delivery Phases

| Phase | Child Issue | Depends On | Summary |
|-------|-------------|------------|---------|
| 1 | #{askId-1} | — | [short description] |
| 2 | #{askId-2} | #{askId-1} | [short description] |

## Success Criteria

Each child issue owns its own acceptance criteria — this epic is a coordination document only.

## Child Issues

- [ ] #{askId-1} — [short description]
- [ ] #{askId-2} — [short description]
```

### Template invariants (flagged as skill-quality findings if violated)

- Delivery Phases table columns MUST be exactly `Phase | Child Issue | Depends On | Summary` in that order.
- `#{askId-N}` placeholders are resolved to real issue numbers in Step 10 after children are created. On fresh synthesis, keep the placeholders.
- Every child referenced in Delivery Phases MUST also appear in Child Issues; Step 10 keeps them synchronized.
- The Success Criteria section is a fixed delegation note — do not replace it with per-child criteria.

The child issues themselves (created in Step 10 via the existing Steps 1b–1d batch mechanism) use the Feature or Bug template as usual (see `references/feature-template.md` and `references/bug-template.md`).

---

## Step 10 — Autolink Batch

Runs after the Per-Issue Loop (or immediately after Step 9 on the single-issue path). It is a no-op for an ordinary single feature or bug; a single epic may populate and deliver its child-membership queue before Step 11 renders the summary.

### Input

- `session.createdIssues` (from the loop)
- `session.dag` (from Step 1d)
- `session.coordinationMembershipEdges` (initialized empty; populated only by Step 10.1 epic fan-out)
- Step 10-local `childDagsByEpic`, `childPlansByEpic`, and `childBatchSummaries` maps (initialized empty; never replace `session.proposedSplit` or `session.dag`)
- Step 10-local `childDeliverablesByEpic` map populated from the approved Delivery Phases/task ownership input

### Process

#### 10.1 Materialize Epic Children and Their Coordination Queue

For every successfully created iteration whose `classification === 'epic'`, after the epic issue itself exists:

1. **Parse Delivery Phases** from the epic body (already synthesized in Step 6). Each row yields a planned child with a short summary and optional sibling prerequisites (the `Depends On` column).
2. **Build a child-local plan, DAG, and deliverable map.** Set `scopeId = epic-<created-epic-issue-number>`. Convert the Delivery Phases into a step-local `childPlan`, combine its prerequisites with the approved task/artifact ownership inventory, and run the Step 1d deliverable-boundary validation before child creation. A baseline-extraction proposal stops this child batch for separate draft/spec review; it never revises `childPlan` in place. Store the valid graph in `childDagsByEpic[scopeId]` and the approved prerequisite records, including `boundary: "baseline"` records from any already approved extracted-baseline ask, in `childDeliverablesByEpic[scopeId]`. Validate every endpoint and topologically order it with the same deterministic rules as Step 1d. Never replace or mutate the outer `session.proposedSplit` or `session.dag`. Never replace the approved outer or child-scoped deliverable list.
3. **Enter batch mode for the children.** Iterate `childPlan` directly, set each child's draft classification (Feature unless the row summary starts with `bug:`), and run the Per-Issue Loop starting at Step 2. Pass `scopeId`, the matching `childDag` as read-only `activeDag`, matching prerequisites as `activeDeliverablePrerequisites`, and the created epic issue number as the separate `coordinationParentNumber` for every child; nested Steps 2-9 must not read or mutate the outer plan, DAG, or deliverable records.
4. **Enforce child body identity and deliverables.** Step 6 writes `Depends on: #{epic-number}` from `coordinationParentNumber`. Each intra-epic prerequisite separately produces `Depends on: #{sibling-number}` from `activeDag`; every cross-child task/artifact prerequisite also writes its structured `Requires deliverable` record. The epic signal never becomes an ordinary DAG edge or execution dependency.
5. **Persist labels.** Lazily create `epic-child-of-<epic>` with color `BFD4F2`, then apply it plus `enhancement` (not `epic`) to every child. Each child has exactly one `epic-child-of-N` label.
6. **Populate the native queue.** Append exactly one `{scopeId, parent: epic.issueNumber, child: child.issueNumber}` entry per created child to `session.coordinationMembershipEdges`. This operation is the queue's sole append owner. It does not run `gh issue edit`; sibling prerequisites stay body-only execution dependencies.
7. **Prepare the epic checklist.** Replace child placeholders in the epic's Child Issues checklist and Delivery Phases table with the captured issue numbers in the pending Step 10.4 body content.
8. **Record child summary inputs.** Append `{scopeId, epicIssueNumber, plannedCount, createdCount, abandonedPlanIds}` to step-local `childBatchSummaries`; derive it from `childPlan` plus created records in that exact scope. Step 11 uses this record without altering the original outer plan counts.

Do not proceed to Step 10.2 until child creation has finished or stopped and the queue contains every successfully created epic-child membership pair. Preserve partial child creation exactly; never synthesize an edge for a child that was not created.

#### 10.2 Probe `gh` Capability Once per Batch

When `session.coordinationMembershipEdges` is non-empty, run `gh issue edit --help 2>&1` and look for `--add-sub-issue` in the output. Cache the result as `session.subIssueSupported`. If the probe output cannot be read or the flag is absent, set `session.subIssueSupported = false`, set `session.nativeLinkComplete = false`, and record a single degradation note: `"Sub-issue linking unavailable in this gh version — body cross-refs only; handoff is partial until native membership is repaired"`. Continue only to body preservation and Step 10.5 report-only verification; do not report successful handoff. With no coordination membership edges, skip the probe and set `session.nativeLinkComplete = true`.

#### 10.3 Write Coordination Membership Edges (only when supported)

For each synthesized `{parent: epic, child}` in `session.coordinationMembershipEdges` where both endpoints have created issue numbers:

```bash
gh issue edit <parent.issueNumber> --add-sub-issue <child.issueNumber>
```

Initialize `session.nativeLinkComplete = true` before writes. Per-edge failures are appended to `session.autolinkDegradationNotes` and set `session.nativeLinkComplete = false`; continue only to preserve remaining body representations and produce the Step 10.5 partial-handoff result.

Do not enqueue `session.dag` or child-scoped `activeDag` prerequisite edges here. They remain execution dependencies represented by the unconditional `Depends on:` / `Blocks:` body records in Step 10.4. Before reporting the batch complete, re-fetch every affected issue, normalize the expected DAG body pairs plus coordination membership pairs, and require the complete expected edge set with no missing or conflicting target. A partial body or native write is reported exactly.

#### 10.4 Resolve Body Cross-Ref and Checklist Placeholders (always)

Every issue body written in Step 6 contains `Depends on: <A1>, <A2>` / `Blocks: <A3>` placeholder lines (when the iteration had DAG neighbors). Step 10 selects the outer `session.dag` for `scopeId = outer` or `childDagsByEpic[scopeId]` for an epic child, then resolves each `<askId>` using only `session.createdIssues` records whose `scopeId` matches:

- The real `#N` number when a same-scope `session.createdIssues` entry exists for that ask ID
- The plain-text marker `(planned but not created)` when the batch was abandoned before the ask was created

Never resolve an `A1`-style token from the outer batch or a different epic scope. Duplicate plan IDs across scopes are expected and harmless.

Apply the rewrite via:

```bash
gh issue edit <issue.number> --body-file <updated-body>
```

Body cross-refs are written **unconditionally** — independent of `session.subIssueSupported` and independent of whether any `--add-sub-issue` call succeeded.

Resolve `- Requires deliverable from <askId>: description` placeholders through the same same-scope map. A created owner becomes `#N`; an uncreated owner retains `(planned but not created)` and the handoff remains partial. Never resolve an owner from another scope.

For an epic, this step also writes the prepared Child Issues checklist and Delivery Phases replacements to the epic body with the same temporary-body-file discipline.

#### 10.5 Re-Fetch and Verify the Complete Expected Edge Set

Re-fetch every issue affected by `session.dag`, `childDagsByEpic`, or `session.coordinationMembershipEdges`. Normalize the complete body, label, parent, and inverse sub-issue evidence through `../../../references/epic-relationships.md`.

- For each outer or child-scoped DAG pair, first inspect same-scope creation records. When both endpoints were created, require one concrete supported body pair and an `executionDependencies` entry rather than a native parent assignment. When either endpoint was not created, require the surviving affected body to retain `(planned but not created)` and classify the edge as planned/abandoned rather than missing concrete evidence.
- For each approved deliverable prerequisite, require the concrete structured record, the same owner/consumer execution-dependency pair, and agreement with the task/artifact ownership inventory. Invoke the shared classifier; only `ready` or truthfully `blocked` is graph-consistent. `repair_required` or `unverifiable` makes the batch a partial handoff.
- Require every queued epic membership to be `role = epic-child`, have its expected `parentNumber`, `identity = durable`, `consistency = consistent`, `nativeAuthority = native`, and matching native plus body signals.
- Require the observed pair set to contain every expected edge with no missing, duplicate, or conflicting target before the batch summary reports success.
- If `session.nativeLinkComplete` is false or re-fetch yields `nativeAuthority = checklist-fallback`/`incomplete`, return `native-degraded partial handoff`, preserve the exact created issues and body/label evidence, and direct recovery to `$nmg-sdlc:upgrade-project`. Never treat fallback evidence as successful creation, completion, or permission to continue another lifecycle mutation.

Preserve and report partial writes exactly; never create a replacement child or a second native parent as compensation.

### Output

- `session.subIssueSupported` — boolean
- `session.nativeLinkComplete` — false for an unavailable or failed native write; such a batch is partial, never successful
- `session.autolinkDegradationNotes` — list of failure descriptions
- `session.coordinationMembershipEdges` — the only edges eligible for native parent writes
- `childBatchSummaries` — explicit per-epic planned/created/abandoned counts; the original outer plan remains unchanged
- Updated issue bodies with resolved cross-refs
- For epics: one fresh durable-identity result per child, or exact partial-write evidence when handoff stops

---

## Step 11 — Batch Summary

### Input

- `session.createdIssues`, unchanged outer `session.proposedSplit`, `session.dag`, `session.coordinationMembershipEdges`, `childBatchSummaries`
- `session.abandoned`, `session.autolinkDegradationNotes`, `session.subIssueSupported`, `session.nativeLinkComplete`

### Process

Render the final summary.

#### Batch mode

```
Batch result: <complete | partial handoff>
Created N of M planned issues

  #<num1> — <title1>  (url)
  #<num2> — <title2>  (url)
  ...
  [Abandoned]: <list of asks not drafted, if any>

  Epic #<num> child batch (<scopeId>): Created C of P planned children
    [Abandoned child IDs]: <same-scope list, if any>

Autolinking:
  - Native epic memberships wired: <count> / <total coordinationMembershipEdges>
  - Concrete execution-dependency body cross-refs written: <count> / <edges whose same-scope endpoints both exist>
  - Deliverable prerequisites represented: <count> / <approved cross-child prerequisites>
  - Planned markers retained: <count> / <edges with an abandoned or uncreated same-scope endpoint>
  [If degraded]: Native membership incomplete — exact surviving labels, bodies, and edges listed below.

[Only when complete]: Epic #<num> is coordination-only and cannot be started. Next step: $nmg-sdlc:start-issue #<first-ready-executable-child-number> (selected by normal dependency rules; epic lineage is informational)
[When partial]: Stop lifecycle handoff. Repair exact native identity through $nmg-sdlc:upgrade-project, then rerun verification; do not create replacement children.
```

#### Single-issue mode

For an ordinary feature or bug, Steps 10 and 11 collapse to the existing `"Issue #N created ... Next step: $nmg-sdlc:start-issue #N"` block from Step 9 (M=1, N=1, no autolinking block). A single epic uses the batch summary because Step 10.1 creates children and native membership edges. It never prints a handoff to the epic. When identity is complete, it derives the first ready executable child with the ordinary dependency/deliverable classifier and displays nested epic lineage as informational context; when `session.nativeLinkComplete` is false, it prints no lifecycle handoff.

#### Abandonment

When `session.abandoned === true`, the summary reports the original outer partial counts (`"Created N of M planned issues"` with `N < M`) without including child plans in `M`, lists already-created outer issues with URLs, and marks remaining outer entries as `[Abandoned]`. Each `childBatchSummaries` record independently reports its planned, created, and abandoned child counts so multiple epics cannot overwrite or inflate the outer plan. No rollback or deletion runs.

### Output

- Final rendered summary (user-visible)
