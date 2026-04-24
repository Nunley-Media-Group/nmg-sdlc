---
name: write-code
description: "Read specs for current branch, enter plan mode, then execute implementation tasks sequentially. Use when user says 'implement the spec', 'start coding', 'build the feature', 'implement issue #N', 'resume implementation', 'how do I implement this', 'how to start coding', 'write the code', or 'build it'. Do NOT use for writing specs, verifying implementations, or creating PRs. Reads requirements, design, and tasks from specs/ and executes them in order. Fourth step in the SDLC pipeline — follows /write-spec and precedes /verify-code."
argument-hint: "[#issue-number]"
allowed-tools: Read, Glob, Grep, Task, Write, Edit, WebFetch, WebSearch, EnterPlanMode, Bash(gh:*), Bash(git:*)
model: opus
effort: xhigh
---

# Write Code

Read the specifications for the current branch's issue, enter plan mode to design the implementation approach, then execute tasks sequentially.

Read `../../references/legacy-layout-gate.md` when the workflow starts — the gate aborts before Step 1 if legacy `.claude/steering/` or `.claude/specs/` trees are still present. Implementing against a mixed layout silently writes against the wrong paths.

Read `../../references/unattended-mode.md` when the workflow starts — the sentinel pre-approves the Step 5 delegation gate AND forces Step 4 to skip `EnterPlanMode` (plan mode fails headless). The interactive-vs-unattended branches in Steps 4 and 5 reference this shared semantics.

## Prerequisites

1. Specs exist at `specs/{feature-name}/` (created by `/write-spec`).
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
Spikes don't produce code — run /open-pr to merge the research spec
```

Exit 0 — this is a correctness guard, not a failure. Do NOT read specs, do NOT enter plan mode, do NOT delegate to `spec-implementer`, do NOT touch any file. The abort fires in both interactive and unattended modes.

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
  No specs found for issue #N. The `/write-spec` step must run first.

  [Missing: no spec directory found for this issue, or required files (requirements.md, design.md, tasks.md, feature.gherkin) are absent]

  Done. Awaiting orchestrator.
  ```
- **Interactive mode**: use `AskUserQuestion` to prompt `"No specs found. Run /write-spec #N first."`

### Step 3: Read Steering Documents

Load project conventions:

```
steering/
├── tech.md        — Stack, testing standards, coding conventions
└── structure.md   — Directory layout, naming, patterns
```

### Steps 4 and 5: Design Approach, Execute Tasks, Route Skill-Bundled Work

Read `references/plan-mode.md` when Steps 1–3 have completed — the reference covers Step 4 (`EnterPlanMode` in interactive, internal design in unattended), Step 5 (`spec-implementer` delegation with the skill-routing contract baked into the prompt, plus the inline fallback and bug-fix variant), the Implementation Rules table, the deviation-handling ladder, Step 5a (SKILL-BUNDLED FILE DETECTOR + Skill-Creator Probe Contract — no hand-edit fallback), and Step 5b (`/simplify` probe-and-skip).

### Resuming Partial Implementation

Read `references/resumption.md` when the branch already carries some of its tasks' commits — the reference covers the commit-to-task matching rule and the edge cases (fresh branch, unmatchable commits, all-complete-but-not-verified, `tasks.md` amended mid-flight) plus concrete examples for implement-by-number and resume-in-place.

### Step 6: Signal Completion

After all tasks are complete and the simplify pass has either run or been gracefully skipped:

```
Implementation complete for issue #N.

Tasks completed: [X/Y]
Files created: [list]
Files modified: [list]

[If `.claude/unattended-mode` does NOT exist]: Next step: Run `/verify-code #N` to verify implementation and update the issue.
[If `.claude/unattended-mode` exists]: Done. Awaiting orchestrator.
```

---

## Integration with SDLC Workflow

```
/draft-issue  →  /start-issue #N  →  /write-spec #N  →  /write-code #N  →  /simplify  →  /verify-code #N  →  /open-pr #N  →  /address-pr-comments #N
                                                                         ▲ You are here
```

`/simplify` is an optional external marketplace skill. When installed, it runs between `/write-code` and `/verify-code` (including from inside `/write-code`'s completion step via the Step 5b probe). When not installed, pipeline steps log a warning and proceed without simplification.
