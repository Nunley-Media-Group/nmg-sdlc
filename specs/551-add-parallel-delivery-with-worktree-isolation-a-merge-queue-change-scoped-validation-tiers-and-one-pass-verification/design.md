# Design: Add parallel delivery with worktree isolation, a merge queue, change-scoped validation tiers, and one-pass verification

**Issue**: #551
**Date**: 2026-11-13
**Status**: Approved
**Author**: Claude Code (write-spec)
**Related Spec**: specs/546-sdlc-execute-stop-losing-time-to-idle-workers-restarts-and-truncated-gate-evidence/

## Overview

Four new deterministic modules carry the change; existing scripts and workflows call them:

- `scripts/sdlc-worktree.mjs`: repository layout, worktree ensure, remove, and list.
- `scripts/sdlc-merge-queue.mjs`: per-repository queue and queue-head processing.
- `scripts/sdlc-heavy-pool.mjs`: host-wide slot pool.
- `scripts/sdlc-verify-full.mjs`: full tier records and the full-green check.

The execute controller becomes worktree-scoped and queue-driven. The verification runtime gains tiers, selection, and heavy slots. Verify becomes review-first, with a structured checklist validated by the finalizer.

## Architecture

### Repository layout (`scripts/sdlc-worktree.mjs`)

`resolveLayout(cwd)`:

1. Runs `git worktree list --porcelain`. The first entry is the primary checkout (`primaryRoot`); a bare first entry fails with `worktree_layout_unsupported`.
2. Runs `git rev-parse --path-format=absolute --git-common-dir` for `commonDir`.
3. Returns `{ primaryRoot, commonDir, worktreeRoot: join(dirname(primaryRoot), basename(primaryRoot) + '-wt'), stateDir: join(commonDir, 'nmg-sdlc') }`.

All paths use `node:path`.

`ensureWorktree({ cwd, issue, kind: 'code'|'spec', branch, setup })`:

- Path: `<worktreeRoot>/<N>` for code, `<worktreeRoot>/spec-<N>` for spec. Directory names avoid slugs, which keeps paths short on Windows.
- When `git worktree list --porcelain` shows a worktree at that path on `refs/heads/<branch>`, reuse it (`created: false`).
- When the branch is checked out in the primary checkout, fail with `worktree_branch_in_primary`. Never switch it.
- When the branch is checked out in another non-primary worktree, reuse that worktree.
- Otherwise:
  1. Run `git fetch origin <default>`.
  2. If `origin/<branch>` exists, run `git worktree add --track -b <branch> <path> origin/<branch>`, or `git worktree add <path> <branch>` when the local branch exists.
  3. Otherwise run `git worktree add -b <branch> <path> origin/<default>`.
- After creation, when the manifest declares `worktree.setup`, run it with cwd `<path>/<setup.cwd>`, then write `<path>/.nmg-sdlc/worktree-setup.json` `{schemaVersion:1, at, command}`.
- A reused worktree without that marker reruns setup.
- Setup failure returns `worktree_setup_failed` and keeps the worktree.

`removeWorktree({ cwd, path, branch })`:

1. Runs `worktree.teardown` when declared. On failure, return `worktree_teardown_failed` and keep the worktree.
2. Runs `git worktree remove --force <path>`, then `git branch -D <branch>`.
3. Calls `syncPrimary`.

`syncPrimary(layout)`:

- When the primary checkout is on the default branch, run `git -C <primaryRoot> merge --ff-only origin/<default>`.
- Return `primarySync: 'fast-forwarded' | 'skipped:<reason>'`. It never throws.

`listWorktrees(layout)`: returns the entries under `worktreeRoot` as `{ path, kind, issue, branch, lease: 'held'|'absent' }`. The lease comes from `controllerLeaseStatus(path)` in `scripts/sdlc-controller-lease.mjs`.

CLI: `sdlc-worktree.mjs ensure --issue N --kind code|spec --branch B | remove --issue N --kind code|spec | list`, with JSON output.

### Spec publication (`scripts/publish-approved-spec.mjs`)

`prepare --issue N --name {N}-{slug}`:

- Calls `ensureWorktree({kind:'spec', branch:'spec/{N}-{slug}'})`.
- Creates the empty draft directory `<session-cwd>/.nmg-sdlc/spec-drafts/{N}-{slug}/` (git-ignored).
- Returns `{ ok, branch, worktree, draftDir }`. It never runs `git checkout` in the invoking checkout.

`commit-push --issue N --dir specs/{N}-{slug}`:

1. Copies the four files from `draftDir` into `<worktree>/specs/{N}-{slug}/`.
2. Verifies every `**Issue**` line is `#N`.
3. Commits `docs: approve spec for #N` in the spec worktree.
4. Pushes `spec/{N}-{slug}`.

`merge`:

- Looks up PRs only with `--head spec/{N}-{slug}`.
- Before merging, reads `gh pr view <pr> --json files` and refuses with `pr_scope_invalid` when any file is outside `specs/{N}-{slug}/`.
- After the merge is proven, it applies `spec-created`, removes the spec worktree and local branch, and calls `syncPrimary`.
- The JSON gains `primarySync`. `default_checkout_failed` is no longer produced by `merge`.

Every spec-PR lookup in `scripts/sdlc-execute.mjs` and `scripts/start-issue.mjs` that proves a merged spec PR accepts head `spec/{N}-{slug}` as well as the legacy `{N}-{slug}`.

`workflows/write-spec/WORKFLOW.md` and `workflows/write-spec/references/publish.md` change in three places:

- The files are written into `prepare`'s `draftDir`.
- A successful merge leaves the session checkout's branch unchanged.
- The `default_checkout_failed` remediation is removed.

### Execute controller (`scripts/sdlc-execute.mjs`)

Per selected issue N:

1. `resolveLayout(cwd)`, then `ensureWorktree({kind:'code', branch:'{N}-' + slugFromTitle(title)})`. `slugFromTitle` comes from `scripts/start-issue.mjs`.
2. All of N's git and gh calls, `.nmg-sdlc/handoffs`, `.nmg-sdlc/verification`, and the controller lease use `wt` instead of the session cwd. The spawn request `cwd` is `wt`. The session directory `.nmg-sdlc/execute/<session>` stays in the session cwd.
3. Before dispatching start, compute overlaps:
   - Parse N's `tasks.md` `**File(s)**` with `parseDeliveryTaskFileLines` (`scripts/sdlc-safe-recoveries.mjs`).
   - Do the same for each other code worktree in `listWorktrees` that has a `specs/{M}-*/tasks.md`.
   - Entries overlap when they are equal, one is a directory prefix of the other, or a glob entry matches the other path. Glob semantics are those of `changed_paths`.
   - The start stage report carries `overlaps: [{ issue: M, files: [...] }]`, which is `[]` when none.
4. Routing is start, then implement, then verify. The pre-dispatch `prepareVersion` call is removed.
5. A passed verify handoff with `next: "queue"` enqueues N. While N is not head, the controller polls the queue every 5 s, and check-in reports show `queuePosition`.
6. At head, run `processQueueHead` (below), then dispatch deliver.
7. After deliver passes, dequeue with `merged` and call `removeWorktree`. `leaveDeliveredBranch` and the `git switch` in `cleanupDeliveredBranch` are removed. The remote-branch delete stays.
8. Any non-passed outcome after N became head dequeues N with `failed`, so the next entry proceeds.

### Merge queue (`scripts/sdlc-merge-queue.mjs`)

The queue file is `<stateDir>/merge-queue.json`: `{ schemaVersion: 1, entries: [{ issue, branch, worktree, pid, controllerRunId, enqueuedAt, state: 'waiting'|'integrating' }] }`.

- Every read-modify-write holds `<stateDir>/merge-queue.lock`, created with exclusive `wx` and containing `{pid, at}`. A lock whose pid is not alive (`process.kill(pid, 0)` throws `ESRCH`) is reclaimed.
- Under the lock, entries whose `pid` is not alive are removed.
- Re-enqueueing an issue already queued keeps its position.

`processQueueHead({ layout, entry, run, gate, finalize, prepareVersion, revert })`:

1. Sets the entry to `integrating`, then runs `git fetch origin <default>` and `git merge --no-edit origin/<default>` in the worktree.
2. If conflicts remain only in version-artifact paths (`VERSION`, mirrors declared in tech steering, `CHANGELOG.md`, the fragment directory), resolves them with `git checkout --theirs` and commits. Any other conflict runs `git merge --abort` and returns `queue_integration_conflict` with the conflicted paths.
3. Pushes the branch.
4. Calls `prepareVersion` (`sdlc-deliver.mjs prepare-version`) unless an open PR exists for the branch, and records the version commit sha.
5. Runs `gate` (`sdlc-verify-steering.mjs --tier pre-merge`) exactly once.
6. On a failed or incomplete ceiling:
   - `git revert --no-edit <versionCommit>` and push, when a version commit was made.
   - `finalize` writes a failed verify handoff with `reasonCode: "queue_gate_failed"`, `next: "implement"`, and artifacts `[verification-report, .nmg-sdlc/verification/N.json]`.
   - Returns `{ ok: false }`.
7. On success, `finalize` (`sdlc-finalize-verification.mjs --queue-gate`) records the gate in the report and publishes it as today. Returns `{ ok: true }`.

### Heavy pool (`scripts/sdlc-heavy-pool.mjs`)

- `hostDir` defaults to `join(os.homedir(), '.nmg-sdlc')`; tests inject it.
- `slotCount(hostDir)` reads `config.json` `heavyJobSlots`. A positive safe integer is used; a missing file, missing key, or invalid value means 1.
- `acquireSlot({ hostDir, label, projectRoot, pid, pollMs = 500, signal })` tries `heavy-jobs/slot-<k>.lock` for k in 1..slots with exclusive `wx`. A lock whose pid is not alive is removed and retried. It returns `{ slot, waitedMs, release }`.
- `listHolders(hostDir)` returns `[{ slot, pid, label, projectRoot, startedAt, alive }]`.
- CLI: `sdlc-heavy-pool.mjs run --label L -- <program> <args...>` runs the program while holding a slot (no shell) and exits with its status. `list` prints the holders as JSON.

### Validation tiers (`src/sdlc-steering-runtime.mjs`, `src/sdlc-verification-runtime.mjs`)

Optional validation keys:

- `tier`: `change` or `full`.
- `selection`: a command config. Allowed only when `tier` is `change` and `provider` is `builtin.command`.
- `fallbackPaths`: safe relative globs.
- `heavy`: boolean.

Optional manifest keys:

- `worktree: { setup?, teardown? }`
- `changelog: { fragments: { dir } }`
- `fullGreen: { actions: [id] }`

Invalid values fail with `steering_validation_invalid`.

`runSteeringValidations({..., tier = 'pre-merge'})` runs untiered and `change` validations for `pre-merge`, and only `full` validations for `full`. For a `change` validation with `selection`:

1. If a changed path matches `fallbackPaths`, use reason `fallback_path`, the first matched path, and the full command.
2. Otherwise spawn the selection command with stdin `{schemaVersion:1, validationId, baseRef, changedPaths}`. It is expected to print `{schemaVersion:1, mode:'selected'|'all', tests:[string], dataStatus:'fresh'|'stale'|'missing', dataAgeSeconds:number|null}`.
   - `dataStatus` `stale` or `missing` gives reasons `selection_data_stale` or `selection_data_missing` and runs the full command.
   - `mode: 'all'` gives reason `selection_all` and runs the full command.
   - A non-zero exit or malformed output gives reason `selection_failed` and runs the full command.
   - Otherwise the reason is `selected`, and the command runs with `args.concat(tests)`. An empty selection gives `effectiveStatus: 'skipped'` with reason `selection_empty`.
3. A `heavy` validation wraps its execution in `acquireSlot` and records `heavy: { slot, waitedMs }`.

Each result gains `tier` (or null) and `selection` (or null). `scripts/sdlc-verify-steering.mjs` accepts `--tier pre-merge|full`, defaulting to `pre-merge`.

### Full tier (`scripts/sdlc-verify-full.mjs`)

`run --ref R`:

1. Resolves R to sha S.
2. Adds a detached worktree `<worktreeRoot>/full-<S[0..12]>` and runs setup there.
3. Runs `runSteeringValidations({tier:'full'})`.
4. Writes `<stateDir>/full-verification/<S>.json`: `{schemaVersion:1, commit:S, ref:R, status:'passed'|'failed'|'incomplete', generatedAt, results, sinceLastGreen}`.
5. Removes the worktree.

On a non-passed status:

- `lastGreen` is the newest passed record whose commit is an ancestor of S.
- `sinceLastGreen` is `git log --first-parent --format=%H%x09%s <lastGreen>..S` as `[{sha, subject}]`, or null with `reason: 'no_green_record'`.

Exit codes: 0 when passed, 1 otherwise.

`check --action A --commit C`:

- An action not in `fullGreen.actions` exits 2 with `full_green_action_unknown`.
- Green means a passed record exists whose commit C2 satisfies `git merge-base --is-ancestor C C2`.
- Prints `{action, commit, green, record}` and exits 0 when green, 1 when not.

`/sdlc-verify-full` is a new automated command:

- `workflows/verify-full/WORKFLOW.md` takes an optional ref, defaulting to `origin/<default>`. It runs the script and prints its output.
- It is registered in `AUTOMATED_COMMANDS` (`src/host-events.mjs`), `AUTOMATED_ARGUMENT_HINTS` (`src/sdlc-commands.mjs`), and `COMMAND_CONSUMERS` and `CATALOG` (`src/sdlc-prompt-snippets.mjs`).
- `commands/sdlc-verify-full.md` is generated by `renderAutomatedCommandMarkdown`.

### Changelog fragments (`scripts/sdlc-deliver.mjs`)

When `changelog.fragments.dir` is declared, `synchronizeVersion`:

- Reads `<dir>/<N>.md` and inserts its bullet lines into the new `## [X.Y.Z]` section under the classification heading.
- Deletes the fragment in the version commit.
- Skips the generated `- <title> (#N)` line when a fragment bullet contains `(#N)`.

`requireVersionArtifacts` still requires `CHANGELOG.md`. Without the opt-in, behaviour is unchanged. `workflows/write-code/WORKFLOW.md` directs implement to write `<dir>/<N>.md` bullets ending `(#N)` instead of editing `[Unreleased]` when the opt-in is declared.

### Review-first verify

The changes span `workflows/verify-code/WORKFLOW.md`, `agents/architecture-reviewer.md`, `scripts/sdlc-finalize-verification.mjs`, and a new `scripts/sdlc-review-scope.mjs`.

Verify order:

1. Bind the owner.
2. Run `sdlc-review-scope.mjs --issue N` to choose a scoped or full review.
3. Run the review lenses in parallel with the `Agent` tool: acceptance walk-through through real entry points, failure and state paths, and test quality including mocked-entry-point detection.
4. Merge the lens results into `.nmg-sdlc/verification/<N>-review.json`.
5. Write the report.
6. Run `sdlc-finalize-verification.mjs --review`.

Verify never runs `sdlc-verify-steering.mjs`.

Review checklist: `{ schemaVersion:1, issue, head, mode:'full'|'scoped', rows:[{ kind:'ac'|'fr'|'design-path'|'consumer', id, verdict:'pass'|'fail'|'partial'|null, findingIds:[] }], findings:[{ id, severity:'blocking'|'major'|'minor', rowIds:[], files:[], summary }], mockedEntryPoints:[acId] }`.

`--review` mode:

- Refuses with `review_checklist_incomplete` when any row has a null or absent verdict, or any `### ACn` heading or FR table id in `requirements.md` has no row. The refusal lists the row ids.
- With findings, or any `fail`/`partial` row, writes a failed handoff with `reasonCode: 'review_findings'`, `next: 'implement'`, a summary listing every finding id and summary, and artifacts `[report, review.json]`.
- Otherwise writes a passed handoff with `next: 'queue'` and `verificationHead`.

`validateHandoff` accepts `next: 'queue'`. `--queue-gate` mode keeps today's gate-at-exact-head checks. The implement remediation prompt includes every finding from the review artifact.

`sdlc-review-scope.mjs --issue N`:

- Reads the prior review JSON.
- With no prior review, a prior review without findings, or a prior head that is not an ancestor of HEAD, returns `{mode:'full'}`.
- Otherwise computes `repairPaths = git diff --name-only <priorHead>..HEAD` and `findingFiles` = the union of the findings' `files`.
- Returns `{mode:'scoped', priorHead, findings, repairPaths}` when every repair path is in `findingFiles`, else `{mode:'full', outsidePaths}`.

### Status (`scripts/sdlc-status.mjs`)

`collectEvidence` adds `parallel` (read-only):

```
{ repository: { worktreeRoot,
    inFlight: [{ issue, kind, worktree, branch, stage, queuePosition, leaseHeld }],
    queue: [{ issue, position, state }],
    leftoverWorktrees: [{ path, issue, kind }] },
  host: { heavyJobSlots, holders: [{ slot, pid, label, projectRoot, startedAt, alive }] } }
```

- `stage` is `queue-head` or `queued` when the issue is queued. Otherwise it is the step of the newest `.nmg-sdlc/handoffs/<M>-*.json` in the worktree, or `start` when there is none.
- A worktree is leftover when its lease is absent or stale and it is not in the queue.
- `renderText` adds a `Parallel:` block.

### Worker heavy commands (`src/sdlc-prompt-snippets.mjs`)

The worker prompt rule for implement and verify: when running the command of a validation that steering marks `heavy`, run it through `node "<plugin-root>/scripts/sdlc-heavy-pool.mjs" run --label <id> -- <program> <args...>`.

## API / Interface Changes

| Interface | Input | Output / Error | Behavior |
|-----------|-------|----------------|----------|
| `sdlc-worktree.mjs ensure` | `--issue N --kind code\|spec --branch B` | `{ok, path, created, setup}`; `worktree_branch_in_primary`, `worktree_setup_failed`, `worktree_layout_unsupported` | Create or reuse an issue worktree |
| `sdlc-worktree.mjs remove` | `--issue N --kind code\|spec` | `{ok, primarySync}`; `worktree_teardown_failed` | Tear down and remove |
| `sdlc-worktree.mjs list` | none | `{worktreeRoot, worktrees[]}` | List worktrees under the root |
| `publish-approved-spec.mjs prepare` | `--issue N --name {N}-{slug}` | `{ok, branch:'spec/…', worktree, draftDir}` | Spec worktree, no checkout |
| `publish-approved-spec.mjs merge` | `--issue N --dir` | adds `primarySync`; `pr_scope_invalid` | Spec-branch-only merge |
| `sdlc-merge-queue.mjs` | `enqueue\|dequeue\|position\|list --issue N` | JSON | Queue operations under the lock |
| `sdlc-heavy-pool.mjs run` | `--label L -- program args` | child exit status | Run while holding a slot |
| `sdlc-heavy-pool.mjs list` | none | `{slots, holders[]}` | Holder listing |
| `sdlc-verify-steering.mjs` | `--tier pre-merge\|full` | record with `tier`, `selection`, `heavy` | Tier filtering |
| `sdlc-verify-full.mjs run` | `--ref R` | record; exit 0/1 | Full tier per commit |
| `sdlc-verify-full.mjs check` | `--action A --commit C` | `{green}`; exit 0/1/2 | Full-green query |
| `sdlc-finalize-verification.mjs` | `--review` or `--queue-gate` | handoff; `review_checklist_incomplete`, `review_findings`, `queue_gate_failed` | Review and gate finalization |
| `sdlc-review-scope.mjs` | `--issue N` | `{mode, …}` | Repair scoping |
| `/sdlc-verify-full` | `[ref]` | script output | New automated command |
| `sdlc-status.mjs --json` | none | adds `parallel` | Queue and pool state |
| Start stage report | none | adds `overlaps[]` | Overlap reporting |

## Data / Storage Changes

| Location | Scope | Content |
|----------|-------|---------|
| `<primary-parent>/<repo-name>-wt/<N>`, `spec-<N>`, `full-<sha12>` | repository | Git worktrees |
| `<worktree>/.nmg-sdlc/` | per worktree | Lease, handoffs, verification, review checklist, `worktree-setup.json` |
| `<git-common-dir>/nmg-sdlc/merge-queue.json` + `.lock` | repository | Merge queue |
| `<git-common-dir>/nmg-sdlc/full-verification/<sha>.json` | repository | Full-tier records |
| `~/.nmg-sdlc/config.json` | host | `{ "heavyJobSlots": <positive integer> }` |
| `~/.nmg-sdlc/heavy-jobs/slot-<k>.lock` | host | `{pid, label, projectRoot, startedAt}` |
| `<session-cwd>/.nmg-sdlc/spec-drafts/{N}-{slug}/` | session checkout (ignored) | Spec drafts before copy |
| `<fragments.dir>/<N>.md` | project (committed) | Changelog fragment, removed at version preparation |

All new manifest keys are optional. Absent keys preserve current behaviour.

## State and UI Behavior

Execute per issue:

`ensure worktree → start → implement → verify (review only) → queued → queue-head (integrate → prepare version → pre-merge gate → finalize) → deliver → dequeue + remove worktree`

Failure paths:

- `verify` with `review_findings` returns to implement.
- `queue-head` with `queue_integration_conflict` or `queue_gate_failed` reverts the version commit, dequeues, and returns to implement.
- A deliver failure dequeues and follows existing deliver routing.

## Alternatives Considered

| Option | Decision | Reason |
|--------|----------|--------|
| Sibling `<repo>-wt/` worktree directories | Selected | Interview choice; easy to open and outside the primary tree |
| Worktrees under `<git-common-dir>` or the primary `.nmg-sdlc/` | Rejected | Interview choice |
| Host config `~/.nmg-sdlc/config.json` for pool size | Selected | Interview choice; persistent without shell setup |
| Environment variable pool size | Rejected | Interview choice |
| Slug in worktree directory names | Rejected | Long slugs exceed Windows path limits |
| GitHub hosted merge queue | Rejected | Out of scope |
| Keep the version commit on a dequeued branch | Rejected | It conflicts with the next integration; revert keeps the branch net-neutral on version artifacts |

## Change History

| Issue | Date | Summary |
|-------|------|---------|
| #551 | 2026-11-13 | Initial feature design |
