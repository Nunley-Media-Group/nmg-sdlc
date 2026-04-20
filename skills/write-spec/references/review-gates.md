# Phase Review Gates

**Read this when** a phase has finished writing its file and the workflow is presenting findings for human approval. The three phase summaries (Requirements, Design, Tasks) follow the same shape: an inline summary the reviewer can evaluate without opening the file, then a two-option `AskUserQuestion` menu. Loop until the reviewer approves; revise iterations apply user-described changes wholesale rather than preserving prior drafts as diffs.

The summaries exist because reviewers should not have to switch context to a separate file to evaluate a phase. Inline summaries make the review gate honest — what the user sees here is what they're approving.

## Unattended-mode behavior

In unattended mode (`.claude/unattended-mode` present), all three gates are **pre-approved**: do NOT call `AskUserQuestion`, do NOT render the inline summary, and proceed directly from each phase to the next. The shared semantics live in `../../references/unattended-mode.md`.

## Phase 1 — Requirements Review Gate

Render this exact structure:

```
**Requirements Summary** — `specs/{feature-name}/requirements.md`

**User Story**: As a [type], I want [action] so that [benefit]

**Acceptance Criteria** ([count] total):
- **AC1: [Name]** — Given [precondition], when [action], then [outcome]
- **AC2: [Name]** — Given [precondition], when [action], then [outcome]
- *(list every AC with its one-line Given/When/Then summary)*

**Key Functional Requirements**:
- FR1: [requirement] *(Must)*
- FR2: [requirement] *(Should)*
- *(list all FRs with priority)*

**Out of Scope**: [comma-separated list of excluded items]

**Open Questions**: [list any, or "None"]
```

Then present a numbered menu via `AskUserQuestion`:

```
Select an option:
  [1] Approve — proceed to technical design
  [2] Revise — I'll describe what to change
```

If the user selects 2 (or provides feedback), apply the changes to the file and re-present the summary and menu. Repeat until they select 1.

## Phase 2 — Design Review Gate

```
**Design Summary** — `specs/{feature-name}/design.md`

**Approach**: [2-3 sentence summary of the architectural approach — what components are involved, the key design decision, and why this approach was chosen over alternatives]

**Components Modified**:
- `path/to/file` — [what changes and why]
- `path/to/file` — [what changes and why]
- *(list every file/component being added or modified)*

**New APIs / Interfaces**:
- `[endpoint or method signature]` — [purpose]
- *(list all, or "None")*

**Database / Storage Changes**: [summary of schema changes, or "None"]

**Key Tradeoff**: [the most important architectural tradeoff and why you chose this side of it]

**Risks**: [top 1-2 risks with their mitigations]
```

Menu:

```
Select an option:
  [1] Approve — proceed to implementation tasks
  [2] Revise — I'll describe what to change
```

Same revise-loop semantics as Phase 1.

## Phase 3 — Tasks Review Gate

```
**Tasks Summary** — `specs/{feature-name}/tasks.md`

**Phase breakdown**:
| Phase | Tasks | Key work |
|-------|-------|----------|
| Setup | [count] | [1-line summary of what this phase does] |
| Backend | [count] | [1-line summary] |
| Frontend | [count] | [1-line summary] |
| Integration | [count] | [1-line summary] |
| Testing | [count] | [1-line summary] |
| **Total** | **[N] tasks** | |

*(For defects, show the flat task list instead of phases)*

**Task list**:
- **T001**: [title] → `file/path` *(depends: none)*
- **T002**: [title] → `file/path` *(depends: T001)*
- *(list every task with its target file and dependencies)*

**Critical path**: T001 → T003 → T004 → ... → T[last] *(the longest dependency chain)*

**Gherkin scenarios**: [count] scenarios covering [count] acceptance criteria
```

Menu:

```
Select an option:
  [1] Approve — specs are complete
  [2] Revise — I'll describe what to change
```

Same revise-loop semantics. After approval, the workflow may enter the Seal-Spec Flow when a multi-PR delivery trigger fires (see SKILL.md).
