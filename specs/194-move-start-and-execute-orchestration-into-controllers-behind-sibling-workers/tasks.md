# Tasks: Move start and execute orchestration into controllers behind sibling workers

**Issue**: #194
**Date**: 2026-08-21
**Status**: Approved
**Author**: NMG
**Related Spec**: specs/193-reduce-injected-sdlc-workflow-tokens-while-keeping-file-command-surfaces/
---

## Summary

| Phase | Tasks | Status |
|-------|-------|--------|
| Start controller | 2 | [ ] |
| Execute controller | 2 | [ ] |
| Compact prompts | 2 | [ ] |
| Surface / ceilings | 2 | [ ] |
| **Total** | 8 | |

---

### T001: Add startIssue module and CLI

**File(s)**: `scripts/start-issue.mjs`
**Type**: Create
**Depends**: None
**Acceptance**:
- [ ] Exports `slugFromTitle` and `startIssue({ issue, cwd, run, fs })`
- [ ] CLI is `node scripts/start-issue.mjs --issue N`
- [ ] Invalid CLI prints `Usage: node scripts/start-issue.mjs --issue N`, JSON `no_issue_number`, exit 2, no handoff file
- [ ] Valid N always writes `.omp/sdlc/handoffs/N-start.json` and prints `NMG_SDLC_HANDOFF: .omp/sdlc/handoffs/N-start.json`
- [ ] Uses `parseBodyRelationships` from `scripts/epic-relationships.mjs`
- [ ] Project GraphQL failure does not fail the handoff
- [ ] Leftover spike still sets `next` to `implement`

### T002: Cover start reasonCodes with injected run

**File(s)**: `scripts/__tests__/start-issue-controller.test.mjs`, `scripts/__tests__/start-issue-selection-contract.test.mjs`
**Type**: Create | Modify
**Depends**: T001
**Acceptance**:
- [ ] Tests drive `startIssue` with fake `run`/`fs` for `issue_unreadable`, `dependency_unreadable`, `dependency_blocked`, `dirty_tree`, `default_branch_unreadable`, `branch_checkout_failed`, and passed
- [ ] `dependency_blocked` records no `gh issue develop` call
- [ ] Selection-contract tests no longer grep `workflows/start-issue/WORKFLOW.md` for `dependency_unreadable` or `gh issue develop`
- [ ] Compact start workflow is still required to contain `# Start Issue` and must not contain `ask`

### T003: Add runExecute and CLI run

**File(s)**: `scripts/sdlc-execute.mjs`
**Type**: Modify
**Depends**: T001
**Acceptance**:
- [ ] Exports `runExecute({ args, cwd, env, run, fs, herdr })`
- [ ] CLI `run` keeps `parse-args`, `backlog`, `spec-status`, `validate-handoff`, `read-run`, `write-run`, `worker-prompt`
- [ ] Does not import or call `startIssue`
- [ ] Invalid args print `Usage: /sdlc-execute [#N ...]` and exit 2
- [ ] Missing omp integration prints exactly `Run: herdr integration install omp` and mutates nothing
- [ ] `STEP_EXTRA_WORKFLOWS` remains `{ implement: ['simplify'], deliver: ['address-pr-comments'] }`

### T004: Cover execute controller and stall recovery

**File(s)**: `scripts/__tests__/sdlc-execute.test.mjs`
**Type**: Modify
**Depends**: T003
**Acceptance**:
- [ ] Existing helper CLI and `specStatus` tests still pass
- [ ] `runExecute` with unset `HERDR_ENV` prints `execute requires a Herdr OMP session` and does not split or start agents
- [ ] Fake pipeline starts `s42-start`, `s42-implement`, `s42-verify`, `s42-deliver` as `--kind omp`
- [ ] Stalled-prompt test drives the fake adapter (one `enter`, wait `working`) instead of grepping `workflows/execute/WORKFLOW.md`
- [ ] Failed/`intervention: true` handoff keeps the pane and stops the queue

### T005: Compact start and execute workflows

**File(s)**: `workflows/start-issue/WORKFLOW.md`, `workflows/execute/WORKFLOW.md`, `commands/sdlc-execute.md`
**Type**: Modify
**Depends**: T001, T003
**Acceptance**:
- [ ] Bodies match design.md compact text
- [ ] YAML `name`/`description` unchanged
- [ ] `commands/sdlc-execute.md` equals `renderAutomatedCommandMarkdown` for execute
- [ ] `workerPrompt({ step: 'start', issue: 42 })` contains `# Start Issue` and `node scripts/start-issue.mjs --issue`
- [ ] Implement still contains `# Simplify`; deliver still contains `# Address PR Comments`

### T006: Tighten start and execute prompt ceilings

**File(s)**: `scripts/__tests__/rendered-prompt-bytes.test.mjs`
**Type**: Modify
**Depends**: T005
**Acceptance**:
- [ ] `AUTOMATED_BODY_CEILINGS['sdlc-execute']` is measured `workflowBody('execute')` UTF-8 bytes + 256
- [ ] `WORKER_PROMPT_CEILINGS.start` is measured `workerPrompt({ step: 'start', issue: 42 })` UTF-8 bytes + 256
- [ ] Other ceilings in that file are unchanged

### T007: Keep automated extension surface

**File(s)**: `src/extension.ts`, `scripts/__tests__/extension-commands.test.mjs`
**Type**: Modify
**Depends**: T005
**Acceptance**:
- [ ] `src/extension.ts` still does not `registerCommand` `sdlc-execute` or other `AUTOMATED_COMMANDS`
- [ ] Automated-command comment about print/RPC `sendUserMessage` remains
- [ ] Existing extension command tests still pass

### T008: Confirm no function dropped versus current controllers

**File(s)**: `scripts/__tests__/start-issue-controller.test.mjs`, `scripts/__tests__/sdlc-execute.test.mjs`
**Type**: Modify
**Depends**: T002, T004, T005
**Acceptance**:
- [ ] Every listed start `reasonCode` is produced by `startIssue` or the documented CLI/`$ARGUMENTS` path
- [ ] Execute still stops on unapproved spec with `Run /sdlc-write-spec #N`
- [ ] Resume with a live `s<N>-*` agent does not start a second worker
- [ ] Notification body matches `Stopped on #<N> <step>. Worker pane <pane_id> agent s<N>-<step> left open.`
- [ ] Focused Jest files listed in Verification exit 0

---

## Change History

| Issue | Date | Summary |
|-------|------|---------|
| #194 | 2026-08-21 | Initial feature spec |
