# Interactive CI Monitor + Auto-Merge (Step 7)

**Consumed by**: `open-pr` Step 7. Runs **only** when `.codex/unattended-mode` does NOT exist — in unattended mode the SDLC runner owns CI monitoring and merging, so the skill must not poll, prompt, or merge.

## Entry gate

If `.codex/unattended-mode` exists, Step 7 is actively suppressed — do NOT call interactive user prompt for CI monitoring, do NOT poll `gh pr checks`, do NOT invoke `gh pr merge`. Return after Step 6 with `Done. Awaiting orchestrator.` and stop.

Otherwise:

1. **Prompt the user** via interactive user prompt:

   ```
   question: "Monitor CI and auto-merge this PR once all required checks pass?"
   options:
     - "Yes, monitor CI and auto-merge"
     - "No, I'll handle it"
   ```

2. **On "No, I'll handle it"** (opt-out): print the existing guidance and exit:

   ```
   Next step: Wait for CI to pass, then merge the PR to close issue #N. After merging, you can start the next issue with `/draft-issue` (for new work) or `/start-issue` (to pick up an existing issue).
   ```

3. **On "Yes, monitor CI and auto-merge"** (opt-in): run the polling loop, then the merge-and-cleanup path (or the failure path on any non-success terminal state).

## Polling constants

Mirror `scripts/sdlc-runner.mjs`'s polling constants so interactive and unattended runs share behaviour:

| Constant | Value |
|----------|-------|
| Poll interval | 30 seconds |
| Poll timeout | 30 minutes |
| Max polls | 60 |

## Polling loop

1. Run `gh pr checks <num> --json name,state,link`. If the JSON response is an empty array `[]`, jump to the **No-CI graceful-skip path** below. If the `--json` flag is not supported by the installed `gh` version, fall back to `gh pr checks <num>` (plain text) and check for the "no checks reported" string; if present, also jump to the **No-CI graceful-skip path**.
2. Map each check's state:
   - `SUCCESS`, `SKIPPED`, `NEUTRAL` → treat as success for that check.
   - `PENDING`, `IN_PROGRESS`, `QUEUED` → not terminal; keep polling.
   - `FAILURE`, `CANCELLED`, `TIMED_OUT` → terminal failure; jump to the **Failure path**.
3. Print a progress line on each poll (e.g., `Polling checks... 3/5 complete`).
4. Sleep 30 seconds, then re-poll. Stop after 60 polls total (30 minutes); treat timeout as a failure and jump to the **Failure path** with message `Polling timeout (30 min) reached — not merging.`
5. When every check is in a success-equivalent state, proceed to the **Pre-merge mergeability check**.

## Pre-merge mergeability check

Run `gh pr view <num> --json mergeable,mergeStateStatus`. If `mergeStateStatus` is anything other than `CLEAN` (e.g., `CONFLICTING`, `BEHIND`, `BLOCKED`, `UNSTABLE`, `DIRTY`), jump to the **Failure path** with the state name in the message. Do NOT merge.

## Merge path

All checks green AND `mergeStateStatus == CLEAN`:

1. Capture the current branch name: `git rev-parse --abbrev-ref HEAD` — store this value as `<branch-name>` for step 4. Do this before `git checkout main` so the name is preserved.
2. `gh pr merge <num> --squash --delete-branch` — squash-merges and deletes the remote branch atomically.
3. `git checkout main` — detach from the feature branch before deleting it locally.
4. `git branch -D <branch-name>` — delete the local feature branch using the name captured in step 1.
5. Print:
   ```
   Merged and cleaned up — you are back on main.
   ```

## Failure path

Any terminal-failure state, non-`CLEAN` mergeability, or polling timeout:

1. Print each failing check's name and details URL (from the `link` field returned by `--json`). For non-mergeable states, print the `mergeStateStatus` value and reason. For timeout, print the timeout message from the polling loop.
2. Do NOT invoke `gh pr merge`. Do NOT run `git branch -D`. Do NOT check out `main` — leave the user on the feature branch so they can push follow-up fixes.
3. Exit so the user can investigate.

## No-CI graceful-skip path

`gh pr checks` reports no checks — print `No CI configured — skipping auto-merge.` and exit. Do NOT merge. Do NOT delete the feature branch. Graceful skip; silent pass-through merge would hide a misconfigured or absent CI pipeline.
