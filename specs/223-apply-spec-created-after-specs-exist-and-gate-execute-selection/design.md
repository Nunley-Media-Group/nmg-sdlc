# Design: Apply spec-created after specs exist and gate execute selection

**Issue**: #223
**Date**: 2026-08-23
**Status**: Approved
**Author**: NMG
**Related Spec**: specs/194-move-start-and-execute-orchestration-into-controllers-behind-sibling-workers/

---

## Overview

Add a shared GitHub label helper and three call sites. The label name is exactly `spec-created`. Write-spec `merge` applies it after a successful squash-merge onto the default branch. Onboard and upgrade backfill it for every unique complete `specs/{N}-*/` package. `/sdlc-execute` stops auto-picking via `selectBacklog()` on empty args; empty invocation presents open labeled issues, then the controller runs only an explicit selected or typed list that every member has labeled.

Do not register `/sdlc-execute` on `INTERACTIVE_COMMANDS` or `src/extension.ts`. Do not put the word `ask` in `workflows/execute/WORKFLOW.md` (keeps the automated-body contract and the 1040-byte ceiling). Sibling workers still never call `ask`.

Before editing any file under `workflows/` or `references/`, resolve and read `skill://skill-creator` and follow that editing procedure.

## Shared label module

Create `scripts/spec-created-label.mjs`. No equivalent module exists; label mutation today is only leftover epic-repair (`add_child_label`), which must not be reused.

Export and use these exact names:

```js
export const SPEC_CREATED_LABEL = 'spec-created';

export function issueHasSpecCreatedLabel(issue) { /* ... */ }
export function listIssueOwnedSpecNumbers(root) { /* ... */ }
export function ensureRepoLabel(run = defaultRun) { /* ... */ }
export function applySpecCreatedLabel(issueN, run = defaultRun) { /* ... */ }
export function backfillSpecCreatedLabels(root, run = defaultRun) { /* ... */ }
```

`issueHasSpecCreatedLabel(issue)` is true when any label name equals `spec-created`. Accept `labels` as strings or `{ name }` objects. Comparison is exact (GitHub label names are case-sensitive).

`listIssueOwnedSpecNumbers(root)` reads `specs/` with `fs` + `node:path` (no shell glob). A number `N` is owned when exactly one directory matches `^N-` and all four of `requirements.md`, `design.md`, `tasks.md`, `feature.gherkin` exist and each matches `/^\*\*Issue\*\*:\s*#N\s*$/m` (same rule as `isCompleteIssueSpec` in `scripts/sdlc-upgrade.mjs`). Zero dirs, two-or-more dirs, or an incomplete package → omit `N`. Status may be Draft. Do not import `isCompleteIssueSpec` (it is not exported); copy the four-file regex.

`ensureRepoLabel(run)`:

1. `gh label list --limit 100 --json name`
2. If any `name` is exactly `spec-created`, return.
3. Else `gh label create spec-created --description Has an nmg-sdlc spec package` (no `--color`, no `--force`).
4. If create is non-zero and stderr/stdout indicates the label already exists, return success. Any other failure throws with message usable as `spec_created_label_failed`.

`applySpecCreatedLabel(issueN, run)` calls `ensureRepoLabel` then `gh issue edit {N} --add-label spec-created`. It must not pass `--remove-label` or replace the label set. A second call is success (idempotent). Invalid `N` (not a safe integer `> 0`) throws without calling `gh`.

`backfillSpecCreatedLabels(root, run)` maps `listIssueOwnedSpecNumbers(root)` through `applySpecCreatedLabel`. Per-issue `gh issue view` / edit failure is recorded; other numbers still run. Return:

```json
{
  "ok": true,
  "labeled": [12],
  "already": [8],
  "skipped": [],
  "failed": []
}
```

`already` = issue already had the label (detect via `gh issue view N --json number,labels` before edit, or treat a successful no-op edit as `labeled`; implement as: view first; if `issueHasSpecCreatedLabel` then push `already` and skip edit; else apply and push `labeled`). `ok` is `false` when `failed.length > 0`. CLI prints that object and exits 0 when `ok`, 1 when not.

CLI:

```
node scripts/spec-created-label.mjs apply --issue N
node scripts/spec-created-label.mjs backfill [--root <dir>]
```

`--root` defaults to `process.cwd()`. Unknown command → `invalid_arguments`. JSON stdout. The helper never calls `git`.

`run` is an injectable `(command, args, options?) => { status, stdout, stderr }` using `spawnSync` with an explicit program and argument array (no `sh -c`). Same shape as other scripts.

## Write-spec publication

In `scripts/publish-approved-spec.mjs` `mergeSpec`, after the successful default-branch checkout and `git pull --ff-only` and before `ok(...)`, call `applySpecCreatedLabel(issueN)`. Import from `./spec-created-label.mjs`.

- Success: keep the existing `ok` payload and add `labeled: true`:

```json
{ "ok": true, "branch": "<default>", "pr": 99, "merged": true, "squash": true, "labeled": true }
```

- Label failure after merge: `fail('spec_created_label_failed', { stderr, stdout })`. Do not unmerge. Leave the helper on the default branch. The spec files stay merged.

Do not apply the label in `prepare` or `commit-push`. Do not add a fifth workflow step after merge; AC1 is satisfied when `merge` returns ok.

Update `workflows/write-spec/references/publish.md` Merge section with one sentence: successful `merge` applies `spec-created` to `#N` (creating the repo label if needed) and fails `spec_created_label_failed` if that apply fails after the squash-merge.

`workflows/write-spec/WORKFLOW.md` Approval Behavior step 4 stays the same argv. No second `xd://propose`.

## Execute argument parsing

In `scripts/sdlc-execute.mjs` `parseArgs`:

- Empty / whitespace-only still returns `{ issues: [], defaultBacklog: true }`.
- Tokenize with `trimmed.split(/[\s,]+/).filter(Boolean)` so `#12,#10`, `#12, #10`, and `#12 #10` are the same list.
- Keep `^#?(\d+)$`, `Number.isSafeInteger` `> 0`, first-occurrence-first dedupe, max 20, `usageError()` = `Usage: /sdlc-execute [#N ...]`.

`selectBacklog` algorithm stays. `runExecute` must stop calling it when `defaultBacklog` is true. Keep the `backlog` CLI subcommand and its unit tests.

## Execute controller gate

In `runExecute`, after Herdr OMP integration + `gh auth status` succeed, resolve the issue list as follows:

1. If `parsedArgs.defaultBacklog` is true:
   - If `readRun(cwd)` returns a state whose `issues` is a non-empty array of positive integers, use that list (resume). Do not present a picker inside the controller.
   - Else do **not** call `selectBacklog`. Query open labeled issues with:

     ```
     gh issue list --state open --label spec-created --limit 100 --json number,title
     ```

     Parse as an array. Unreadable / non-zero → status 1, stderr `gh issue list failed` (or the existing list-failure string if one is already used nearby). If the array is empty: `{ status: 0, stdout: 'No open spec-created issues.\n', stderr: '' }` and start no workers. If the array is non-empty: `{ status: 2, stdout: '', stderr: 'Usage: /sdlc-execute [#N ...]\n' }` and start no workers. Direct `node scripts/sdlc-execute.mjs run` with no tokens therefore never auto-picks.

2. If `parsedArgs.defaultBacklog` is false (explicit list):
   - For each listed number, `gh issue view {N} --json number,labels`. Unreadable → status 1, start zero workers, stderr names that issue as unreadable.
   - Collect every listed number where `issueHasSpecCreatedLabel` is false. If that set is non-empty: status 2, start zero workers (including labeled siblings), stdout one line per missing number in listed order:

     ```
     #12 has no spec-created label
     #15 has no spec-created label
     ```

   - If every listed issue has the label, `issues` is the parsed list (already first-occurrence-first).

3. Existing `if (issues.length === 0) return { status: 0, stdout: '', stderr: '' }` remains only as a fallback after the branches above (resume-empty should not hit this). Dirty-tree, `specStatus` / `Run /sdlc-write-spec #N`, serial workers, handoffs, notifications stay.

4. Before `herdr pane split` / `herdr agent start` for an issue, re-check `spec-created` is still present. If missing, print `#N has no spec-created label`, start no **new** worker for that issue, stop the queue. A live agent whose name starts with `s{N}-` continues under the existing resume/handoff table (FR2 applies to starting workers).

5. After the label gate, `specStatus` / `isSpecApproved` still runs. Labeled + unapproved still prints `Run /sdlc-write-spec #N` and starts no worker.

Add CLI subcommand:

```
node scripts/sdlc-execute.mjs list-specified
```

Prints `{ "ok": true, "issues": [{ "number": 8, "title": "..." }] }` sorted by `number` ascending. Same `gh issue list` argv as above. Failures non-zero with `{ "ok": false, "reasonCode": "issues_unreadable" }`.

## Empty-args picker (file command, not /plan)

Keep `/sdlc-execute` on `AUTOMATED_COMMANDS`. `commands/sdlc-execute.md` remains the rendered workflow body.

Replace the Execution empty-args sentence in `workflows/execute/WORKFLOW.md` so the UTF-8 body stays `<= 1040` bytes (`scripts/__tests__/rendered-prompt-bytes.test.mjs`). Exact replacement for the three Execution invoke sentences:

```
Trim `$ARGUMENTS`. Non-empty: invoke `node scripts/sdlc-execute.mjs run` with the trimmed tokens. Empty: read `references/selection.md` and follow it, then invoke `run` only with the selected tokens.
```

Keep Preflight, pass-through, and the never-edit / never `--kind pi` lines. The file must not contain the word `ask`.

Create `workflows/execute/references/selection.md` with this contract (this is the only execute picker):

1. Run `node scripts/sdlc-execute.mjs list-specified`.
2. `ok: false` → print the helper output and stop. Do not invoke `run`.
3. `issues.length === 0` → print exactly `No open spec-created issues.` and stop. Do not invoke `run`.
4. `issues.length >= 1` → one built-in `ask`, `multi: true`, recommended index 0. This is the empty-args selection; sibling workers still never call `ask`.
   - `question` is a short paragraph that lists **every** returned issue as `#N — {title}` (one per line) then the sentence `Which spec-created issues should /sdlc-execute run?`
   - Options: the lowest-numbered issues as `#N — {title}`, at most three, then last option `Cancel — start nothing`. Never exceed four options.
   - Automatic Other accepts `#N` / `N` / comma or whitespace lists using the same `parseArgs` token rules.
5. If the choice is only `Cancel — start nothing`, or Cancel is among the selected options → start nothing; do not invoke `run`.
6. Union selected chips (excluding Cancel) with Other tokens. Dedupe first-occurrence-first: chips in ascending number order as presented, then Other tokens in typed order. Invalid Other → re-ask the same question. Empty union → treat as Cancel.
7. Invoke `node scripts/sdlc-execute.mjs run` with the selected numbers as `#N` tokens separated by spaces.
8. If `ask` cannot be used (print/RPC / no UI) → print `Run /sdlc-execute in the TUI to choose spec-created issues.` plus the `list-specified` titles, and stop without `run`.

After editing `WORKFLOW.md`, overwrite `commands/sdlc-execute.md` with the exact output of `renderAutomatedCommandMarkdown('sdlc-execute', 'execute', 'Run automated SDLC delivery')` from `src/sdlc-commands.mjs` so `scripts/__tests__/extension-commands.test.mjs` stays green.

Do not change `selectBacklog` Depends-on / Project Done filtering. Those still apply only after a queue exists (out of scope to change).

## Upgrade backfill

In `scripts/sdlc-upgrade.mjs` `applyUpgrade`, after the approved-item loop and before the final `detectUpgrade`, always call `backfillSpecCreatedLabels(rootAbs)` (import from `./spec-created-label.mjs`). This is not a declineable category and has no per-issue ask. Push a result `{ id: 'spec-created-backfill', status: 'applied', ...backfillFields }` or `status: 'failed'` when `ok` is false. Do not label issues that `listIssueOwnedSpecNumbers` omitted.

Do not add a user-facing upgrade ask for this. `workflows/upgrade-project/WORKFLOW.md` Generated / After Propose: one sentence that approved apply always backfills `spec-created` for unique complete issue-owned spec packages.

Do not rewrite historical `specs/151-*` or the plugin-surface test that snapshots those scenario titles.

## Onboard backfill

`workflows/onboard-project/WORKFLOW.md` and `workflows/onboard-project/references/brownfield.md`: after brownfield (or source-backfill) writes unique `specs/{N}-*/` packages, the approved plan execution runs `node scripts/spec-created-label.mjs backfill`. Greenfield that only creates an empty `specs/` tree still runs backfill; it labels nothing. Already-initialized onboard that does not mutate specs does not run backfill.

No per-issue confirmation.

## Tests

Extend existing Jest files; add `scripts/__tests__/spec-created-label.test.mjs`.

`scripts/__tests__/spec-created-label.test.mjs`:

- `issueHasSpecCreatedLabel` true/false for string and `{ name }` labels; other labels ignored
- `listIssueOwnedSpecNumbers` unique complete package; omit missing file, wrong `**Issue**`, and two dirs sharing `N`
- `applySpecCreatedLabel` creates the repo label when missing, skips create when present, edits `--add-label spec-created` only, second apply does not remove labels
- `backfillSpecCreatedLabels` labels owned numbers only; continues after one view/edit failure and returns `ok: false`

`scripts/__tests__/publish-approved-spec.test.mjs`:

- Extend the stub `gh` in `makeRepo` so `label list`, `label create`, `issue view … labels`, and `issue edit … --add-label spec-created` exit 0 (unknown `gh` still exits 1)
- Successful merge assertion includes `labeled: true` and `.gh-log` contains `issue edit 42 --add-label spec-created`
- New test: after squash-merge, if `issue edit` fails, status non-zero, `reasonCode` is `spec_created_label_failed`, current branch is still the default branch

`scripts/__tests__/sdlc-execute.test.mjs`:

- `parseArgs('#12,#10')` and `parseArgs('#12, #10')` equal `{ issues: [12, 10], defaultBacklog: false }`
- Keep empty → `defaultBacklog: true`
- In `makeControllerFixture` `run`, add a default `gh issue view` when `args.includes('labels')` returning `{ number: 42, labels: [{ name: 'spec-created' }] }` so existing `#42` controller tests still start workers
- New `runExecute` cases:
  - `args: ''` and no `run.json` and list returns `[]` → stdout `No open spec-created issues.\n`, `starts` empty
  - `args: ''` and no `run.json` and list returns a labeled issue → status 2, usage stderr, `starts` empty (controller does not auto-pick)
  - `args: ''` with existing `run.json` `{ issues: [42], ... }` → resumes 42 (fixture already labeled)
  - `args: '#12 #15'` when 12 lacks the label and 15 has it → stdout contains `#12 has no spec-created label`, `starts` empty
  - `args: '#15,#12'` both labeled → queue order `[15, 12]` (inspect `run.json` or the first started agent names)
  - `args: '#42'` unlabeled → `#42 has no spec-created label`, `starts` empty, does not print `Run /sdlc-write-spec #42` first
  - `args: '#42'` labeled but Draft spec → still `Run /sdlc-write-spec #42\n` (FR6)

Upgrade tests (existing upgrade test file if present, else add cases next to `detectUpgrade` / `applyUpgrade` exports): `applyUpgrade` with empty `approvedItemIds` still calls backfill; a unique complete package is labeled; a number with no package is not.

Workflow contract: `workflows/execute/WORKFLOW.md` contains `references/selection.md` and does not contain `ask`; `workflows/execute/references/selection.md` contains `list-specified`, `No open spec-created issues.`, `Cancel — start nothing`, and `multi`. `rendered-prompt-bytes` still passes for `sdlc-execute`.

---

## Change History

| Issue | Date | Summary |
|-------|------|---------|
| #223 | 2026-08-23 | Initial feature spec |
