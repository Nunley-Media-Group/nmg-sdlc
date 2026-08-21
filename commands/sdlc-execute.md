---
name: sdlc-execute
description: "Run automated SDLC delivery"
---


# Execute

Automated orchestrator. Runs only in the main Herdr pane. Never edits product code, never implements tasks, never opens PRs. Delegates all work to sibling Herdr `--kind omp` workers via documented launch sequence.

Read this file and the Herdr skill documentation before starting.

## Preflight (orchestrator only)

- `HERDR_ENV` must be exactly `1`, `HERDR_SOCKET_PATH` and `HERDR_PANE_ID` must be set. If any missing, print that execute requires a Herdr OMP session and stop with no mutations.
- Run `herdr integration status`. The output must contain a line matching `^omp:\s+(?!not installed)`. Observed shape example: `omp: current (v8) (/Users/.../herdr-omp-agent-state.ts)`. If missing or the command fails, print exactly `Run: herdr integration install omp` and stop.
- `gh auth status` must succeed.
- Working tree must be clean, or the current branch must already equal `{N}-{slug}` for the target issue (resume case). Do not stash, discard, or reset user work. Fail closed on dirty tree for a new issue.

Never run `herdr server stop`. Never pass `--kind pi` to any agent start. Stay inside the caller's Herdr session and workspace. Do not create new sessions, tabs, or worktrees unless already present.

## Argument handling

Trim `$ARGUMENTS`.

- Empty after trim → use default backlog resolution.
- Otherwise split on whitespace. Each token must match `^#?\d+$`. Collect unique numbers preserving first-occurrence order. Any other token prints `Usage: /sdlc-execute [#N ...]` and stops non-zero.
- More than 20 numbers → stop non-zero with the usage line.

Use the helper to classify:

```
node scripts/sdlc-execute.mjs parse-args "<trimmed arguments>"
```

The helper returns JSON `{ "issues": [N, ...], "defaultBacklog": bool }`.

## Backlog selection (when defaultBacklog true)

Invoke:

```
node scripts/sdlc-execute.mjs backlog
```

The helper runs:

- `gh issue list --state open --limit 100 --json number,title,labels,body,projectItems`
- For every issue body, reuse `parseBodyRelationships` (imported from `scripts/epic-relationships.mjs`; do not reimplement the Depends-on regex).
- Hydrate every `dependsOn` parent number via one GraphQL batch (`gh api graphql`) or individual `gh issue view --json state`. Any GraphQL or `gh` failure → exit 1 from helper; do not guess ready issues.
- An issue is blocked (dropped) if any parent state is not `CLOSED` (case-insensitive match on the state value).
- Drop the issue if every readable Project status (from `projectItems` shapes containing `statusName`, `status.name`, or legacy title) is exactly `Done` (case-insensitive). Absent or unreadable Project items do not count as Done; keep the issue.
- Sort surviving issues by number ascending.
- Print the first number (or nothing) to stdout.

If the selected issue (default or explicit) has no approved spec, print `Run /sdlc-write-spec #N` and stop the queue. Do not advance to later issues.

Check approved via helper:

```
node scripts/sdlc-execute.mjs spec-status --issue N
```

Returns `{ "dir": "specs/N-slug" or null, "approved": bool, "ref"?: "<git ref>" }`.

A spec dir is resolved by `resolveSpecDir(root, N)`: the unique directory under `specs/` whose name matches `^N-`. A unique worktree match is used as-is — do not override a worktree Draft with a remote Approved.

When there is no unique worktree dir, the helper looks at unique `refs/heads/{N}-*` then unique `refs/remotes/origin/{N}-*` and `git show`s the four required files without checkout. Unique approved ref → `{ dir: "specs/{N}-{slug}", approved: true, ref }`. Zero or multiple matching names, missing files, or failed `git show` → not approved.

A directory or ref counts approved only when every required artifact (`requirements.md`, `design.md`, `tasks.md`, `feature.gherkin`) carries both `**Issue**: #N` (singular) and `**Status**: Approved`.

## Run state

Persist after every transition using the helper:

```
node scripts/sdlc-execute.mjs read-run
node scripts/sdlc-execute.mjs write-run '<json>'
```

Schema (authoritative on disk):

```json
{
  "schemaVersion": 1,
  "issues": [42, 57],
  "currentIssue": 42,
  "currentStep": "verify",
  "completed": { "42": ["start", "implement"] },
  "failed": null,
  "startedAt": "ISO-8601"
}
```

`completed[issue]` is the ordered prefix of steps already successfully finished for that issue.

On session start the extension may also append a `com.nmg-sdlc.run` entry; disk file wins on conflict.

Handoff files live at `.omp/sdlc/handoffs/<N>-<step>.json`. Use `validate-handoff --file <path>` before trusting content.

Handoff schema:

```json
{
  "schemaVersion": 1,
  "issue": 42,
  "step": "verify",
  "status": "passed",
  "intervention": false,
  "summary": "one paragraph",
  "artifacts": ["specs/42-slug/verification-report.md"],
  "next": "deliver",
  "reasonCode": null
}
```

`status` ∈ {passed, failed, blocked}. `step` ∈ {start, implement, verify, deliver}. `intervention` true means the pane must remain open for a human.

## Per-issue pipeline

Process issues in the supplied (or backlog) order. One issue reaches `MERGED` + `CLOSED` before the next issue begins.

For current issue:

1. If no approved spec → stop queue, tell user to run `/sdlc-write-spec #N`.
2. Compute the next step to perform:
   - Use `nextStep(completedForIssue)` from helper, or inspect last handoff for the issue.
   - If a live agent `sN-*` exists for a prior step of this issue, see Resume rules.
4. Launch the required worker step (see Worker launch sequence).
5. After the worker settles, read the handoff (source of truth), validate it, apply close-vs-keep table.
6. On successful `deliver` step: only after the PR is `MERGED` and issue `CLOSED`, delete the local branch (best-effort). Then advance to next issue in list.
7. Update `run.json` after each transition: set `currentIssue`, `currentStep`, append to `completed[N]`, clear or set `failed`.

## Worker launch sequence (exact)

1. Determine split direction:
   ```
   herdr pane layout --pane "$HERDR_PANE_ID"
   ```
   Parse the first numeric `width` and `height` found under `.result` then at top level. If `width >= height` use `right`, else `down`. If either dimension absent, default to `down`.

2. Split (do not focus):
   ```
   herdr pane split --current --direction <right|down> --cwd "$PWD" --no-focus
   ```
   Capture new pane id from `.result.pane.pane_id`.

3. Start agent (default timeout, never override):
   ```
   herdr agent start s<N>-<step> --kind omp --pane <pane_id>
   ```
   Agent names are `s` + issue + `-` + step (e.g. `s42-implement`). Must match `^[a-z][a-z0-9_-]{0,31}$`. Never use `sdlc-` prefix.

4. Send prompt and wait:
   ```
   herdr agent prompt s<N>-<step> "<exact prompt>" --wait
   ```
   If this returns `agent_prompt_stalled`, inspect `herdr agent read s<N>-<step> --source detection` before failing. Only when the exact prompt is visibly pasted but not submitted, recover once:
   ```
   herdr agent send-keys s<N>-<step> enter
   herdr agent wait s<N>-<step> --until working
   herdr agent wait s<N>-<step>
   ```
   The first wait proves Enter started the worker; the second waits for `idle`, `done`, or `blocked`. Do not resend the prompt. If the prompt is not visibly pasted, `send-keys` fails, the worker does not reach `working`, or the worker does not settle, keep the pane and fail the step.

5. After the original prompt or one successful recovery settles, inspect with `herdr agent get s<N>-<step>` and read the handoff file.

The worker prompt is obtained only via:

```
node scripts/sdlc-execute.mjs worker-prompt --step <start|implement|verify|deliver> --issue N
```

Do not send `/skill:`. The helper inlines the frontmatter-stripped workflow files (`start` → `start-issue`, `implement` → `write-code` then `simplify`, `verify` → `verify-code`, `deliver` → `open-pr` then `address-pr-comments`). Missing workflow file → helper exit 2.

Step mapping: `start` → `start-issue`, `implement` → `write-code` + `simplify`, `verify` → `verify-code`, `deliver` → `open-pr` + `address-pr-comments`.

## Close vs keep table (source of truth = handoff file, never TTY)

| Condition | Action |
|-----------|--------|
| Agent state `idle` or `done` AND handoff `status=passed` AND `intervention=false` | Read summary into orchestrator context; `herdr pane close <pane_id>` (only panes created by this execute run); advance to next step or issue. |
| Agent state `blocked` | Keep pane; send notification; set `run.failed`; stop the queue. |
| Prompt returns `agent_prompt_stalled` and the exact prompt is visibly pasted but not submitted | Send `enter` once, prove the agent reaches `working`, then wait for it to settle and apply this table to the resulting agent state and handoff. |
| Prompt recovery cannot start or settle correctly | Keep pane; treat as failed. |
| Agent state `unknown` after the original prompt or recovery settles | Keep pane; treat as failed. |
| Handoff file missing after `idle`/`done` | Keep pane; reasonCode `missing_handoff`. |
| Handoff `status=failed` or `blocked` or `intervention=true` | Keep pane; stop queue. |
| Process error inside worker (gh/git/test failure) | Worker itself writes a failed handoff; keep the pane. |

After a keep-open decision, always also print the sentence in the orchestrator pane.

Notification command (exact, Herdr 0.8.0):

```
herdr notification show "nmg-sdlc stopped" --body "Stopped on #<N> <step>. Worker pane <pane_id> agent s<N>-<step> left open." --sound request
```

If the notification result is not `shown` (e.g. `disabled`, `rate_limited`), the print in the orchestrator pane is still required.

## Resume rules

Re-invoking `/sdlc-execute` (no args or same issue list):

- If `.omp/sdlc/run.json` names the current issue and a live agent whose name matches `s<N>-*` exists for it, do not create a second split or worker. Print the existing pane and agent ids and stop.
- If no live agent but `completed` already lists a prefix of steps for the issue, skip directly to the first missing step.
- If the last recorded handoff for the step was `failed` and the user re-runs after manual repair inside the kept pane:
  - If the old agent is still live and now `idle`, re-read the handoff file. If it now reports `passed`, close the pane and continue.
  - If the agent is gone, launch a fresh worker for that step.
- Never reopen a successfully closed pane from a prior run.

## Helper functions exported for callers and tests

- `parseArgs(inputString)` → `{issues, defaultBacklog}` or error shape.
- `selectBacklog()` → first ready issue number or null (throws on gh/GraphQL failure).
- `specStatus(issueN, root?)` → `{dir, approved, ref?}`.
- `validateHandoff(filePath)` → boolean.
- `readRun(root?)`, `writeRun(data, root?)`.
- `resolveSpecDir(root, issueN)`, `nextStep(completedArray)`, `workerPrompt({step, issue, skill})`.

All gh and filesystem operations inside the helper are read-only except the explicit `write-run` path.
