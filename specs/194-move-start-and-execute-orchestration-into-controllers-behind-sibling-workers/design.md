# Design: Move start and execute orchestration into controllers behind sibling workers

**Issue**: #194
**Date**: 2026-08-21
**Status**: Approved
**Author**: NMG
**Related Spec**: specs/193-reduce-injected-sdlc-workflow-tokens-while-keeping-file-command-surfaces/
---

## Overview

Start and execute orchestration move from workflow prose into two Node controllers. Sibling Herdr `--kind omp` workers remain the isolation boundary. The start worker invokes `scripts/start-issue.mjs`; the execute file command invokes `scripts/sdlc-execute.mjs run`. The execute process never calls `startIssue()`.

`src/extension.ts` still does not `registerCommand` automated names. `workerPrompt` still inlines compact workflow text. Handoff schema version 1 is unchanged.

## Architecture

```
/sdlc-execute  →  commands/sdlc-execute.md (compact)
                 →  node scripts/sdlc-execute.mjs run
                      → herdr pane split + agent start --kind omp
                      → workerPrompt(start|implement|verify|deliver)
                      → validateHandoff / writeRun

s<N>-start     →  compact start-issue WORKFLOW
                 →  node scripts/start-issue.mjs --issue N
                      → gh/git via injected run
                      → .omp/sdlc/handoffs/N-start.json
```

### startIssue

`export function startIssue({ issue, cwd, run, fs })` in new `scripts/start-issue.mjs`. `run(command, args, options?)` returns `{ status, stdout, stderr }`. Default `run` is `spawnSync` (`encoding: 'utf8'`, cwd from options or `cwd`). `fs` is `{ mkdirSync, writeFileSync, existsSync }`.

`export function slugFromTitle(title)` is `String(title ?? '').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '')` or `'issue'` if empty. `expectedBranch = \`${N}-${slug}\``.

Order: parse issue → `gh issue view N --json number,title,body,labels,state` → slug → `parseBodyRelationships(body)` from `scripts/epic-relationships.mjs` and `gh issue view P --json state` for each parent (unreadable / not CLOSED fail before any branch mutation) → dirty porcelain unless already on `expectedBranch` → `gh repo view --json defaultBranchRef --jq .defaultBranchRef.name` then `gh issue develop N --checkout --name ${expectedBranch} --base ${defaultBranch}` → best-effort Project V2 Status using the GraphQL already in current start Step 6 (errors ignored) → write handoff → print `NMG_SDLC_HANDOFF: .omp/sdlc/handoffs/${N}-start.json`.

Success handoff: `schemaVersion: 1`, `step: "start"`, `status: "passed"`, `intervention: false`, `summary: "Branch ready for #N"`, `artifacts: []`, `next: "implement"`, `reasonCode: null`. Failed: `status: "failed"`, `intervention: true`, `next: null`, `reasonCode` one of `no_issue_number`, `issue_unreadable`, `dependency_unreadable`, `dependency_blocked`, `dirty_tree`, `default_branch_unreadable`, `branch_checkout_failed`. Summaries: `start-issue requires explicit #N argument`; `GitHub issue #N is unreadable`; `Depends-on parent is unreadable`; `Depends-on parent is not CLOSED`; `Working tree is dirty and current branch is not ${expectedBranch}`; `Repository default branch is unreadable`; `Failed to check out ${expectedBranch}`.

CLI: `node scripts/start-issue.mjs --issue N`. Invalid/missing `--issue` → stderr `Usage: node scripts/start-issue.mjs --issue N`, stdout `{ "reasonCode": "no_issue_number", "intervention": true, "step": "start" }`, exit 2, no file. Valid N: exit 0 passed, exit 1 failed. Leftover `spike` does not change `next`.

### runExecute

`export function runExecute({ args, cwd, env, run, fs, herdr })` on `scripts/sdlc-execute.mjs`. CLI token `run` joins remaining argv as `args`. Existing subs stay.

`herdr` adapter: `integrationStatus`, `paneLayout(paneId)`, `paneSplit({ direction, cwd })`, `paneClose(paneId)`, `agentStart({ name, paneId })`, `agentPrompt({ name, prompt })`, `agentRead({ name, source })`, `agentSendKeys({ name, keys })`, `agentWait({ name, until })`, `agentGet(name)`, `listAgents()`, `notificationShow({ title, body, sound })`. Default shells the current Herdr 0.8.0 argv.

The default Herdr blocking wait is authoritative: do not invent or pass an `agent wait --timeout` flag and do not add a controller-side deadline shorter than one hour. `agentPrompt(... --wait)` and the recovery `agentWait` calls may remain blocked for at least 3,600 seconds while the worker is active. Elapsed time alone is not a prompt stall; only the documented Herdr stall result or a terminal failed/intervention handoff stops the queue.

Exit 0: queue done, `Run /sdlc-write-spec #N` stop, or live `s<N>-*` resume stop. Exit 2: usage, missing Herdr env (`execute requires a Herdr OMP session`), missing omp line (exactly `Run: herdr integration install omp`), dirty new-issue tree. Exit 1: `gh auth` fail, default-branch sync fail, failed/intervention/missing handoff, unrecoverable stall.

Reuse `parseArgs`, `selectBacklog`, `specStatus`, `validateHandoff`, `readRun`, `writeRun`, `nextStep`, `workerPrompt`. Split: width >= height → `right`, else `down`; missing dim → `down`. Workers `s<N>-start|implement|verify|deliver`, `--kind omp` only. Stalled prompt: detection read, one `enter` only if exact prompt pasted, wait `working`, then settle; never resend. Close only panes this run created. Notification title `nmg-sdlc stopped`, body `Stopped on #<N> <step>. Worker pane <pane_id> agent s<N>-<step> left open.`, sound `request`. Sync default branch via `gh repo view` before the next issue; never guess `main`. Delete local issue branch only after MERGED+CLOSED.

### Compact `workflows/start-issue/WORKFLOW.md` body

Keep existing frontmatter `name`/`description`. Body is exactly:

```
# Start Issue

Automated start for issue #N. No user questions, no pickers, no gates. Missing preconditions produce failed handoff with intervention.

## Arguments

The invocation must supply an explicit issue number in the form `#N` or `N` matching `^#?([1-9]\d*)$`.

If the argument is missing or does not match, write failed handoff at the worker header `Handoff path:` (`.omp/sdlc/handoffs/<N>-start.json`) with reasonCode `no_issue_number`, summary `start-issue requires explicit #N argument`, step `start`, intervention true, status `failed`, next null. Print `NMG_SDLC_HANDOFF: .omp/sdlc/handoffs/<N>-start.json` and stop.

## Execution

Invoke from the repository root:

node scripts/start-issue.mjs --issue N

Pass stdout and stderr through unchanged. Exit with the controller exit code.

Do not call start from the execute orchestrator. Do not skip the sibling `s<N>-start` worker.
```

### Compact `workflows/execute/WORKFLOW.md` body

Keep existing frontmatter `name`/`description`. Body is exactly:

```
# Execute

Automated orchestrator. Runs only in the main Herdr pane. Never edits product code, never implements tasks, never opens PRs. Delegates all work to sibling Herdr `--kind omp` workers.

## Preflight

`HERDR_ENV` must be exactly `1`. `HERDR_SOCKET_PATH` and `HERDR_PANE_ID` must be set. If any is missing, print that execute requires a Herdr OMP session and stop with no mutations.

## Execution

Trim `$ARGUMENTS`. Invoke:

node scripts/sdlc-execute.mjs run <trimmed arguments>

When arguments are empty, invoke `node scripts/sdlc-execute.mjs run` with no extra tokens.

Pass stdout and stderr through unchanged. Exit with the controller exit code.

Do not edit product code, implement tasks, or open PRs in this pane. Never run `herdr server stop`. Never pass `--kind pi`.
```

Regenerate `commands/sdlc-execute.md` from `renderAutomatedCommandMarkdown`. After the two bodies land, set `AUTOMATED_BODY_CEILINGS['sdlc-execute']` and `WORKER_PROMPT_CEILINGS.start` to `renderedPromptBytes(...) + 256`.

## Testing Strategy

| Layer | Type | Coverage |
|-------|------|----------|
| startIssue | Jest with injected `run`/`fs` | every reasonCode, spike → implement, project GraphQL throw still passes |
| runExecute | Jest with fake `herdr` | usage, env, omp install line, four worker names, stall recovery, no `startIssue` import |
| prompts | existing rendered-prompt-bytes | new execute/start ceilings; extras still inlined |
| surface | existing extension test | no automated `registerCommand` |
