# Resuming Partial Implementation

**Consumed by**: `write-code` when a branch already carries some of its tasks' commits.

Implementations rarely complete in a single sitting — the developer reruns `$nmg-sdlc:write-code` on an existing branch to pick up where the previous session stopped. The skill must detect that state and resume cleanly rather than re-executing already-committed tasks.

## Resumption workflow

1. **Resolve active issue scope** — reuse the validated `scoped` or `implicit_single_issue` result from `write-code` Step 2. Enumerate only `delivery.tasks`, including explicitly adopted tasks; never begin from the entire cumulative `tasks.md`.
2. **Read mapped task definitions** — find each identifier in `delivery.tasks` and load only those task definitions and declared acceptance criteria. A missing mapped task is an unverifiable scope error.
3. **Inspect git history** — `git log main..HEAD --oneline` reveals commits made on this branch so far. Match commit messages and touched files only against mapped task IDs and file paths to identify which active tasks are already complete.
4. **Resume from the first incomplete mapped task** — subtract completed mapped tasks from `delivery.tasks` and resume in their declared order. Do NOT re-apply completed tasks; re-application produces spurious diffs and risks undoing subsequent edits. Earlier or future tasks outside the active delivery set are ignored even when they appear incomplete in the cumulative file.
5. **Continue the workflow from Step 5** using the normal execution path (inline by default, optional Codex `worker` delegation only when explicitly authorized). Re-run Step 4 only if the active mapped plan needs revision based on what is already built.

## Edge cases

| Condition | Behaviour |
|-----------|-----------|
| No commits on branch yet | Treat as a fresh run — start from the first identifier in `delivery.tasks`. |
| Commits exist but none match an active mapped task | Warn and present a `request_user_input` gate with `Treat as fresh` / `Stop as corrupt`; any free-form `Other` answer is treated as a mapped task-id hint and the active task scan is retried. |
| All mapped tasks appear complete but `$nmg-sdlc:verify-code` has not been run | Skip to Step 6 (Signal Completion) and recommend running `$nmg-sdlc:verify-code` next. |
| `tasks.md` or `issue-scope.json` was amended after commits started | Re-resolve scope, then run existing commits against the updated `delivery.tasks`; treat any mapped task without a matching commit as incomplete. Note the amendment in the completion summary. |

## Example

User says: "Resume implementing the current feature."
Actions: detects branch `42-add-auth`, reuses the normalized `delivery.tasks`, finds the first incomplete mapped identifier, and resumes from there.
Result: remaining tasks completed from where the previous session left off.
