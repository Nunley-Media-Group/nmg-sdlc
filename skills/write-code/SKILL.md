---
name: write-code
description: "Read specs for current branch, enter plan mode, then execute implementation tasks sequentially. Use when user says 'implement the spec', 'start coding', 'build the feature', 'implement issue #N', 'resume implementation', 'how do I implement this', 'how to start coding', 'write the code', or 'build it'. Do NOT use for writing specs, verifying implementations, or creating PRs. Reads requirements, design, and tasks from specs/ and executes them in order. Fourth step in the SDLC pipeline — follows $nmg-sdlc:write-spec and precedes $nmg-sdlc:verify-code."
---

# Write Code

Read `../../references/codex-tooling.md` when the workflow starts — it maps legacy tool wording to Codex-native file inspection, shell, editing, web, interactive-gate, and subagent behavior.

Read `../../references/interactive-gates.md` when the workflow reaches any manual-mode user decision, menu, review gate, or clarification prompt — Codex asks through `request_user_input` in Plan Mode, then finalizes a `<proposed_plan>` before execution.

Read the specifications for the current branch's issue, enter plan mode to design the implementation approach, then execute tasks sequentially.

Read `../../references/legacy-layout-gate.md` when the workflow starts — the gate aborts before Step 1 if legacy `.codex/steering/` or `.codex/specs/` trees are still present. Implementing against a mixed layout silently writes against the wrong paths.

Read `../../references/spec-context.md` when Step 2 resolves the active spec — write-code preserves active-spec-first loading and adds capped neighboring specs only when surrounding contracts can affect implementation scope.

Read `../../references/epic-relationships.md`, `../../references/epic-spec-authority.md`, and `../../references/canonical-umbrella-spec.md` when the active issue is a child of a confirmed coordination epic. Resolve helpers from the installed plugin root, not the consumer project.

## Prerequisites

1. Specs exist at `specs/{feature-name}/` (created by `$nmg-sdlc:write-spec`).
2. A feature branch exists for this issue (or will be created).
3. Steering documents exist at `steering/`.

---

## Workflow

### Step 1: Identify Context

Determine the issue and feature being implemented:

1. **From argument** — if `#N` is provided, use that issue number.
2. **From branch name** — parse the current branch for an issue number. Common patterns: `42-feature-name`, `feature/42-name`, `issue-42`. Run `git branch --show-current` to get the current branch.
3. **Read the issue** — `gh issue view #N` for full context.

If no issue can be identified, present a `request_user_input` gate per `../../references/interactive-gates.md`; the predefined option should request an issue number through the free-form `Other` answer, and the workflow maps that text to the issue number before continuing.

### Step 1.5: Spike Abort

Check the issue's labels:

```bash
gh issue view #N --json labels --jq '.labels[].name'
```

If any label is `spike`, print exactly:

```
Spikes don't produce code — run $nmg-sdlc:open-pr to merge the research spec
```

Exit 0 — this is a correctness guard, not a failure. Do NOT read specs, enter plan mode, delegate to a worker, or touch any file.

### Step 1.75: Epic Spec Authority Gate

Before reading the active spec or entering implementation planning, resolve the issue's supported label/body/native relationships through `../../references/epic-relationships.md`. Use GraphQL for native relationships and supported `gh issue view` fields for body/labels; never request `parent` through `gh issue view --json`. Fully hydrate the native parent's body, labels, and paginated `subIssues` connection before deriving identity or sibling authority; a partial parent record makes the result `unverifiable`.

- `role = ordinary` → continue unchanged.
- `role = epic` → stop before spec loading with `Epic #E is coordination-only and cannot be implemented. Start a ready executable child instead.` Do not plan, delegate, or edit.
- `role = inconsistent`, `ambiguous`, or `unverifiable` → stop before spec loading or planning and report the shared pairs/signals/gaps.
- `role = epic-child` → record complete lineage and fully paged native direct children, then run `node <plugin-root>/scripts/epic-spec-authority.mjs --project <project-root> --child N --native-children <complete-list> --json`.

Continue only for `valid`. Resolve the active spec from `requestedChild.specPath`, retain `aggregatePath` as one related bounded-context spec, and retain the authority digest in the plan evidence. `planned` stops with `$nmg-sdlc:write-spec #N`; `repair_required` or `unverifiable` stops before spec loading, plan review, delegation, or edits and routes exact gaps to `$nmg-sdlc:upgrade-project`.

Aggregate `EO###` outcomes and topology cannot enter the delivery ID set or satisfy task completion. Legacy cumulative packages remain readable only for their documented ordinary/legacy boundary; new epic-child work requires the split authority above.

### Step 2: Read Specs

Load all active specification documents:

Read `../../references/issue-spec-scope.md` and run its read-only resolver for the active issue and resolved executable spec path before implementation planning. Continue only for `scoped` or `implicit_single_issue`. Treat `delivery.acceptanceCriteria`, `delivery.functionalRequirements`, `delivery.tasks`, and `delivery.scenarios` as the complete current implementation slice; `regression` is verification context and never adds implementation tasks. On `repair_required`, stop and direct `$nmg-sdlc:write-spec #N` with the exact gaps. On `unverifiable`, fail closed with `reasonCode` and gaps. Never fall back to all tasks in a multi-issue spec, any cumulative package, or aggregate outcomes/topology.

Then read `../../references/spec-context.md` and establish bounded neighboring context. Fully load related specs only when the ranking reasons show their surrounding contracts can affect implementation scope, and cap related full-spec loading per the shared contract. The active spec remains authoritative; related specs provide constraints, compatibility notes, and blast-radius context, not replacement task sources.

```
specs/{feature-name}/
├── requirements.md    — Acceptance criteria, functional requirements
├── design.md          — Architecture, data flow, component design
├── tasks.md           — Phased implementation tasks with dependencies
└── feature.gherkin    — BDD test scenarios
```

If specs do not exist, present a `request_user_input` gate with the message `"No specs found. Run $nmg-sdlc:write-spec #N first."`; the only predefined action is to stop, and any free-form `Other` answer is treated as a corrected spec path or issue number to re-check before stopping.

### Step 3: Read Steering Documents

Load project conventions:

```
steering/
├── tech.md        — Stack, testing standards, coding conventions
└── structure.md   — Directory layout, naming, patterns
```

### Steps 4 and 5: Design Approach, Execute Tasks, Route Skill-Bundled Work

Read `references/plan-mode.md` when Steps 1–3 have completed — the reference covers Step 4 plan review, Step 5 inline execution by default, optional Codex `worker` delegation only when the user authorizes subagents, the Implementation Rules table, the deviation-handling ladder, Step 5a skill-bundled routing, and Step 5b bundled `$nmg-sdlc:simplify` invocation.

### Resuming Partial Implementation

Read `references/resumption.md` when the branch already carries some of its tasks' commits — the reference covers the commit-to-task matching rule and the edge cases (fresh branch, unmatchable commits, all-complete-but-not-verified, `tasks.md` amended mid-flight) plus concrete examples for implement-by-number and resume-in-place.

### Step 6: Signal Completion

After all tasks are complete and the bundled simplify pass has completed:

```
Implementation complete for issue #N.

Tasks completed: [X/Y]
Files created: [list]
Files modified: [list]

Next step: Run `$nmg-sdlc:verify-code #N` to verify implementation and update the issue.
```

---

## Integration with SDLC Workflow

```
$nmg-sdlc:draft-issue  →  $nmg-sdlc:start-issue #<executable>  →  $nmg-sdlc:write-spec #N  →  $nmg-sdlc:write-code #N  →  $nmg-sdlc:simplify  →  $nmg-sdlc:verify-code #N  →  $nmg-sdlc:open-pr #N (review + merge + closure)
                                                                         ▲ You are here
```

`$nmg-sdlc:simplify` is bundled with this plugin. It runs between `$nmg-sdlc:write-code` and `$nmg-sdlc:verify-code`, including from inside `$nmg-sdlc:write-code`'s completion flow.
