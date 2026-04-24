# Design Implementation Approach and Execute Tasks

**Consumed by**: `write-code` Steps 4 (Design Implementation Approach), 5 (Execute Tasks), and 5a (Route Skill-Bundled Tasks Through `/skill-creator`).

Steps 4 and 5 turn the loaded specs and steering docs into running code. Interactive mode presents a concise plan for user approval before any file is touched; unattended mode skips that approval and designs the approach internally. Step 5a's skill-routing contract applies on every execution path — skill-bundled edits go through `/skill-creator` or escalate.

## Step 4: Design Implementation Approach

**Unattended mode** (`.codex/unattended-mode` exists): skip interactive approval entirely because there is no user to approve the plan. Design the approach internally, covering the points below, then go straight to Step 5.

**Interactive mode**: present the implementation approach to the user and wait for approval before editing files.

The implementation approach (whether internal or in plan mode) should:

1. **Map tasks to files** — take each task from `tasks.md` and map it to actual files in the codebase. Use file discovery and text search to find existing code to build on. Reference `structure.md` for directory conventions.
2. **Identify reuse** — find existing code patterns to follow: similar features already implemented, shared utilities, base classes, common patterns.
3. **Propose implementation order** — based on task dependencies.
4. **Flag any deviations** — if the codebase has evolved since specs were written.
5. **Present the plan** for user approval (interactive only).

## Step 5: Execute Tasks

**Unattended mode**: the runner handles implementation directly via its code phase — proceed to execute tasks inline using the approach designed in your thinking.

**Interactive mode**: after the user approves the plan, execute tasks inline by default. If the user explicitly authorizes subagents, spawn a Codex `worker` subagent for implementation and include the Step 5a skill-routing contract in the delegation prompt so the worker classifies and routes skill-bundled tasks:

```
Spawn a Codex worker with this bounded task:
"Implement the specs for issue #N in specs/{feature-name}/. Read requirements.md, design.md, tasks.md, and steering docs in steering/, then execute all tasks sequentially. For each task, apply the SKILL-BUNDLED FILE DETECTOR and Skill-Creator Probe Contract from this reference — route every skill-bundled file edit through /skill-creator. There is no hand-edit fallback: if /skill-creator is unavailable, escalate and stop. Return the files changed and task-completion summary."
```

The worker reads all spec and steering documents, executes tasks from `tasks.md` sequentially, and returns a completion summary with files created / modified.

If the worker reports partial completion or deviations, review its output and decide whether to re-invoke it for remaining tasks or handle them directly.

### Fallback — inline execution

If subagents are not explicitly authorized or a worker fails, implement tasks directly:

1. **Mark in-progress** — note which task you're working on.
2. **Classify** — apply the SKILL-BUNDLED FILE DETECTOR below. If the task touches a skill-bundled file, route through `/skill-creator` per the Skill-Creator Probe Contract below — never edit those files directly.
3. **Write code** — follow `design.md` for architecture decisions, use patterns from `structure.md` and `tech.md`, follow existing code style in the project.
4. **Self-check** — compare output against the task's acceptance criteria.
5. **Test** — run relevant tests if specified in `tech.md`.
6. **Complete** — mark task done, move to next.

### Bug-Fix Implementation

When specs follow the defect format (root-cause analysis in `design.md`, flat task list in `tasks.md`):

- Follow the fix strategy from `design.md` precisely — it describes the minimal correct change.
- The task list is flat (2–4 tasks), not phased — execute linearly: fix → regression test → verify.
- Minimise change scope — do not refactor surrounding code, clean up adjacent files, or add features.
- Write the regression test (T002) before marking the fix complete — it must fail without the fix and pass with it.

### Implementation Rules

| Rule | Rationale |
|------|-----------|
| Follow the spec | Reduces deviation and rework |
| One task at a time | Maintains focus and traceability |
| Test after each task | Catches issues early |
| Update spec if needed | Keep specs as living documents |
| Reference steering docs | Ensures consistency with project conventions |

### Handling Deviations

1. **Minor deviation** — note it and proceed; update the spec after.
2. **Major deviation** — stop and discuss with the user.
3. **Blocker** — flag the issue and suggest alternatives.

## Step 5a: Route Skill-Bundled Tasks Through `/skill-creator`

Skills are Markdown instructions, and `steering/tech.md` declares an architectural invariant: any time a skill-bundled file is created or edited — whether by a human or by an SDLC workflow — the work MUST be driven through `/skill-creator`. The invariant covers the whole bundle (SKILL.md, per-skill `references/` / `scripts/` / `templates/` / `checklists/` / `assets/`, shared plugin/repo-root `references/`, and prompt contracts under `agents/*.md`) because every one of those files shapes how the skill behaves at runtime.

Apply this step on both the optional delegated worker path and the inline path. Cache the probe result for the duration of the run.

### SKILL-BUNDLED FILE DETECTOR

A task is classified as **skill-bundled** when ANY of the following signals is present:

- **Path signals** — the target file path matches any of:
  - `**/skills/*/SKILL.md`
  - `**/skills/*/references/**`, `**/skills/*/scripts/**`, `**/skills/*/templates/**`, `**/skills/*/checklists/**`, `**/skills/*/assets/**`
  - `references/**` at the plugin or repo root (cross-skill shared references)
  - `**/agents/*.md` (plugin prompt contracts consumed by skills)
- **Description signals** — the task description, issue title, or issue body contains `skill`, `SKILL.md`, `skill definition`, `skill reference`, or `skill bundle` (case-insensitive, word-boundary match — `skills` matches, `skillet` does not).

Detection is deliberately conservative — any single signal triggers routing (false-positive preferred over false-negative). Non-skill-bundled tasks skip the probe entirely and use normal Codex editing.

### Skill-Creator Probe Contract

1. **Probe for availability** — treat the `skill-creator` skill as available if ANY of the following is true:
   - file discovery finds `~/.codex/skills/skill-creator/SKILL.md`
   - file discovery finds `~/.codex/plugins/**/skills/skill-creator/SKILL.md`
   - The available-skills list in your system reminder advertises a skill named `skill-creator` (or `*:skill-creator`)
2. **If available**: invoke `/skill-creator` for the task, passing task context (title, acceptance criteria), the target file path, existing file content (for edits), and a pointer to `steering/` for project conventions. Let `/skill-creator` author or update the file — never edit a skill-bundled file directly.
3. **If unavailable**: there is no hand-edit fallback — skill-bundled files must route through `/skill-creator`.
   - **Interactive mode**: surface the missing dependency to the user — `/skill-creator is required to author skill-bundled files but is not installed. Install it (e.g., via the official skill-creator plugin) and re-run.` Stop the workflow.
   - **Unattended mode**: emit `ESCALATION: /skill-creator is required for skill-bundled file edits — install it before re-running` and exit non-zero so the SDLC runner reports the escalation.

If `/skill-creator` is available but errors or reports failures, surface those as additional findings and address them before proceeding to Step 5b.

## Step 5b: Simplify Pass

After all tasks are complete and before signalling completion, run the `/simplify` skill over the files changed on this branch. Simplify is a marketplace skill that is NOT bundled with `nmg-sdlc`; the probe-and-skip pattern below keeps pipelines without it working.

### Simplify-Skill Probe Contract

1. **Probe for availability** — treat the `simplify` skill as available if ANY of the following is true:
   - file discovery finds `~/.codex/skills/simplify/SKILL.md`
   - file discovery finds `~/.codex/plugins/**/skills/simplify/SKILL.md`
   - The available-skills list in your system reminder advertises a skill named `simplify` (or `*:simplify`)
2. **If available**: invoke `/simplify` against the files returned by `git diff main...HEAD --name-only`. Apply any fixes it returns in-place. Only proceed to Step 6 once findings are cleared.
3. **If unavailable**: emit the warning verbatim:

   ```
   simplify skill not available — skipping simplification pass
   ```

   Then proceed to Step 6 with the same success status you would have had without the simplify pass.

If the `simplify` skill is available but errors or reports failures, surface those as additional findings and address them before proceeding to Step 6.

Unattended-mode behaviour is preserved — the probe is a filesystem / system-reminder check, not an interactive user prompt gate.
