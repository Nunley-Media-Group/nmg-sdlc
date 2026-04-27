# Resuming Partial Implementation

**Consumed by**: `write-code` when a branch already carries some of its tasks' commits.

Implementations rarely complete in a single sitting — the developer reruns `$nmg-sdlc:write-code` on an existing branch to pick up where the previous session stopped. The skill must detect that state and resume cleanly rather than re-executing already-committed tasks.

## Resumption workflow

1. **Read `tasks.md`** to enumerate every task and its declared acceptance criteria.
2. **Inspect git history** — `git log main..HEAD --oneline` reveals commits made on this branch so far. Match commit messages and touched files against task IDs and file paths in `tasks.md` to identify which tasks are already complete.
3. **Resume from the first incomplete task** — skip everything earlier than that task in the phase ordering from `tasks.md`. Do NOT re-apply completed tasks; re-application produces spurious diffs and risks undoing subsequent edits.
4. **Continue the workflow from Step 5** using the normal execution path (inline by default, optional Codex `worker` delegation only when explicitly authorized, and always inline in unattended mode). Re-run Step 4 only if the plan needs revision based on what's already been built.

## Edge cases

| Condition | Behaviour |
|-----------|-----------|
| No commits on branch yet | Treat as a fresh run — start from Task 1. |
| Commits exist but none match a task in `tasks.md` | Warn and present a `request_user_input` gate with `Treat as fresh` / `Stop as corrupt`; any free-form `Other` answer is treated as a task-id mapping hint and the task scan is retried. In unattended mode, emit an `ESCALATION:` line rather than guessing. |
| All tasks appear complete but `$nmg-sdlc:verify-code` has not been run | Skip to Step 6 (Signal Completion) and recommend running `$nmg-sdlc:verify-code` next. |
| `tasks.md` was amended after commits started | Run the existing commits against the updated task list; treat any task without a matching commit as incomplete. Note the amendment in the completion summary. |

## Example

User says: "Resume implementing the current feature."
Actions: detects branch `42-add-auth`, reads `tasks.md`, finds the first incomplete task, resumes from there.
Result: remaining tasks completed from where the previous session left off.
