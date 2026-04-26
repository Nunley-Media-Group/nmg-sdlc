---
name: write-code
description: "Read specs for current branch, enter plan mode, then execute implementation tasks sequentially. Use when user says 'implement the spec', 'start coding', 'build the feature', 'implement issue #N', 'resume implementation', 'how do I implement this', 'how to start coding', 'write the code', or 'build it'. Do NOT use for writing specs, verifying implementations, or creating PRs. Reads requirements, design, and tasks from specs/ and executes them in order. Fourth step in the SDLC pipeline — follows $nmg-sdlc:write-spec and precedes $nmg-sdlc:verify-code."
---

# Write Code

Read `../../references/codex-tooling.md` when the workflow starts — it maps legacy tool wording to Codex-native file inspection, shell, editing, web, interactive-gate, and subagent behavior.

Read `../../references/interactive-gates.md` when the workflow reaches any manual-mode user decision, menu, review gate, or clarification prompt — Codex asks through `request_user_input` in Plan Mode, then finalizes a `<proposed_plan>` before execution.

Read the specifications for the current branch's issue, enter plan mode to design the implementation approach, then execute tasks sequentially.

Read `../../references/legacy-layout-gate.md` when the workflow starts — the gate aborts before Step 1 if legacy `.codex/steering/` or `.codex/specs/` trees are still present. Implementing against a mixed layout silently writes against the wrong paths.

Read `../../references/unattended-mode.md` when the workflow starts — the sentinel pre-approves the Step 5 execution gate and forces Step 4 to skip the interactive plan review. The interactive-vs-unattended branches in Steps 4 and 5 reference this shared semantics.

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

If no issue can be identified, ask the user.

### Step 1.5: Spike Abort

Check the issue's labels:

```bash
gh issue view #N --json labels --jq '.labels[].name'
```

If any label is `spike`, print exactly:

```
Spikes don't produce code — run $nmg-sdlc:open-pr to merge the research spec
```

Exit 0 — this is a correctness guard, not a failure. Do NOT read specs, do NOT enter plan mode, do NOT delegate to a worker, do NOT touch any file. The abort fires in both interactive and unattended modes.

### Step 2: Read Specs

Load all specification documents:

```
specs/{feature-name}/
├── requirements.md    — Acceptance criteria, functional requirements
├── design.md          — Architecture, data flow, component design
├── tasks.md           — Phased implementation tasks with dependencies
└── feature.gherkin    — BDD test scenarios
```

If specs do not exist:

- **Unattended mode**: output and stop:

  ```
  No specs found for issue #N. The `$nmg-sdlc:write-spec` step must run first.

  [Missing: no spec directory found for this issue, or required files (requirements.md, design.md, tasks.md, feature.gherkin) are absent]

  Done. Awaiting orchestrator.
  ```
- **Interactive mode**: present a `request_user_input` gate to prompt `"No specs found. Run $nmg-sdlc:write-spec #N first."`

### Step 3: Read Steering Documents

Load project conventions:

```
steering/
├── tech.md        — Stack, testing standards, coding conventions
└── structure.md   — Directory layout, naming, patterns
```

### Steps 4 and 5: Design Approach, Execute Tasks, Route Skill-Bundled Work

Read `references/plan-mode.md` when Steps 1–3 have completed — the reference covers Step 4 (interactive plan review in interactive mode, internal design in unattended), Step 5 (inline execution by default, optional Codex `worker` delegation only when the user or runner explicitly authorizes subagents), the Implementation Rules table, the deviation-handling ladder, Step 5a (SKILL-BUNDLED FILE DETECTOR + Skill-Creator Probe Contract — no hand-edit fallback), and Step 5b (bundled `$nmg-sdlc:simplify` invocation).

### Resuming Partial Implementation

Read `references/resumption.md` when the branch already carries some of its tasks' commits — the reference covers the commit-to-task matching rule and the edge cases (fresh branch, unmatchable commits, all-complete-but-not-verified, `tasks.md` amended mid-flight) plus concrete examples for implement-by-number and resume-in-place.

### Step 6: Signal Completion

After all tasks are complete and the bundled simplify pass has completed:

```
Implementation complete for issue #N.

Tasks completed: [X/Y]
Files created: [list]
Files modified: [list]

[If `.codex/unattended-mode` does NOT exist]: Next step: Run `$nmg-sdlc:verify-code #N` to verify implementation and update the issue.
[If `.codex/unattended-mode` exists]: Done. Awaiting orchestrator.
```

---

## Integration with SDLC Workflow

```
$nmg-sdlc:draft-issue  →  $nmg-sdlc:start-issue #N  →  $nmg-sdlc:write-spec #N  →  $nmg-sdlc:write-code #N  →  $nmg-sdlc:simplify  →  $nmg-sdlc:verify-code #N  →  $nmg-sdlc:open-pr #N  →  $nmg-sdlc:address-pr-comments #N
                                                                         ▲ You are here
```

`$nmg-sdlc:simplify` is bundled with this plugin. It runs between `$nmg-sdlc:write-code` and `$nmg-sdlc:verify-code`, including from inside `$nmg-sdlc:write-code`'s completion flow.
