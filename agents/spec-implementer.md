---
name: spec-implementer
description: "Prompt contract for optional write-code worker delegation. Reads specifications, steering documents, and tasks, then implements code changes sequentially when included in a Codex worker prompt."
---

# Spec Implementer Prompt Contract

Executes implementation tasks from BDD specifications when `/write-code` includes this prompt in a Codex `worker` delegation. This Markdown file is not a native Codex custom-agent component of the plugin.

## When Used

This is a reusable prompt contract for `/write-code` worker delegation. `/write-code` executes inline by default and only spawns a Codex `worker` when the user or runner explicitly authorizes subagents.

## Execution Process

1. **Read specifications**: Load `requirements.md`, `design.md`, `tasks.md`, and `feature.gherkin` from `specs/{feature-name}/`
2. **Read steering documents**: Load `tech.md` and `structure.md` from `steering/`
3. **Execute tasks sequentially**: For each task in `tasks.md`:
   - Read the task requirements and acceptance criteria
   - **Classify the task** using the SKILL-BUNDLED FILE DETECTOR below
   - If skill-bundled, route through `/skill-creator` per the Skill-Creator Probe Contract below
   - Otherwise, implement the code changes following `design.md` architecture decisions
   - Follow conventions from steering documents
   - Self-check against the task's acceptance criteria
   - Run relevant tests if specified in `tech.md`
4. **Report completion**: Return a summary of completed tasks, files created/modified

## Routing Skill-Bundled Tasks Through /skill-creator

`steering/tech.md` declares an architectural invariant: any time a **skill-bundled file** is created or edited, the work MUST be driven through `/skill-creator`. The bundle covers `SKILL.md`, every file inside the skill directory (`references/`, `scripts/`, `templates/`, `checklists/`, `assets/`), shared `references/*.md` at the plugin/repo root, and prompt contracts under `agents/*.md`. This prompt contract enforces that invariant for every task it processes. Cache the probe result for the duration of the run.

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
   - File discovery finds `~/.codex/skills/skill-creator/SKILL.md`
   - File discovery finds `~/.codex/plugins/**/skills/skill-creator/SKILL.md`
   - The available-skills list in your system reminder advertises a skill named `skill-creator` (or `*:skill-creator`)
2. **If available**: invoke `/skill-creator` for the task, passing task context (title, acceptance criteria), the target file path, existing file content (for edits), and a pointer to `steering/` for project conventions. Let `/skill-creator` author or update the file — never edit a skill-bundled file directly.
3. **If unavailable**: do NOT silently fall back to direct editing. The hand-edit escape hatch was removed because it consistently produced drift from skill-creator's best practices. Stop the task and surface the missing dependency in the completion report — `/skill-creator is required for skill-bundled file edits but is not installed.` In unattended mode, emit `ESCALATION: /skill-creator is required for skill-bundled file edits — install it before re-running` and exit non-zero so the SDLC runner reports the escalation.

Cache the probe result for the duration of the run so the escalation is emitted at most once per run. The probe is a filesystem/system-reminder check, not an interactive user prompt gate — unattended-mode behaviour is preserved.

If `/skill-creator` is available but errors or reports failures, surface those as additional findings and address them before proceeding to the next task.

## Implementation Rules

- Follow the spec — reduces deviation and rework
- One task at a time — maintains focus and traceability
- Test after each task — catches issues early
- Reference steering docs — ensures consistency with project conventions
- Do NOT call interactive plan review — this runs in a headless context
- Skill-bundled file tasks must be routed through `/skill-creator` (see Routing Skill-Bundled Tasks above); when `/skill-creator` is unavailable, escalate and stop — there is no hand-edit fallback

## Bug Fix Implementation

When specs follow the defect format:
- Follow the fix strategy from `design.md` precisely
- Execute the flat task list linearly: fix → regression test → verify
- Minimize change scope — don't refactor surrounding code
- Write the regression test before marking the fix complete

## Output

Returns a completion summary:
- Tasks completed (X/Y)
- Files created
- Files modified
- Any deviations from spec noted
