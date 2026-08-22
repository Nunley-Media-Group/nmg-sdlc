# Design: Move exact-head delivery into a controller with on-demand remediation

**Issue**: #195
**Date**: 2026-08-21
**Status**: Approved
**Author**: NMG
**Related Spec**: specs/194-move-start-and-execute-orchestration-into-controllers-behind-sibling-workers/

---

## Overview

Delivery orchestration moves from model-readable workflow prose into `scripts/sdlc-deliver.mjs`. The existing sibling `s<N>-deliver` worker remains the owner. Its compact workflow invokes the controller, acts only when the controller emits a remediation packet, and reruns the controller after a verified push.

The execute controller still creates and monitors the deliver worker. It does not version files, create PRs, edit code, or merge.

## Architecture

```
s<N>-deliver
  → compact open-pr workflow
  → node scripts/sdlc-deliver.mjs --issue N
      → deterministic gates/version/push/PR/readiness/merge/proof
      → passed or failed .omp/sdlc/handoffs/N-deliver.json
      → or exit 3 + NMG_SDLC_REMEDIATION packet
           → same worker applies clear fix, verifies, pushes
           → rerun controller
```

## Controller contract

`scripts/sdlc-deliver.mjs` exports:

```js
export function runDeliver({ issue, cwd, run, fs, now, sleep })
```

`run(command, args, options?)` returns `{ status, stdout, stderr }` and is the only way to invoke `gh` or `git`. Defaults use `spawnSync` with UTF-8 output and the supplied repository root. `fs` provides the Node filesystem operations needed for version files and handoffs. `now` defaults to `Date.now`; `sleep` is injected and defaults to a blocking 30-second wait between observations. Tests inject both and never wait in real time.

CLI forms:

- `node scripts/sdlc-deliver.mjs --issue N`
- `node scripts/sdlc-deliver.mjs --issue N --remediation-result human_review`

N accepts `N` or `#N` matching `^#?([1-9]\d*)$`. Unknown, missing, or conflicting arguments print `Usage: node scripts/sdlc-deliver.mjs --issue N [--remediation-result human_review]`, exit 2, and write no handoff.

Normal terminal exit codes are 0 for a passed handoff, 1 for a failed/intervention handoff, 2 for invalid CLI, and 3 for remediation required.

## Deterministic delivery sequence

1. Resolve the unique approved `specs/N-*/` package and read issue title, body, labels, state.
2. Require the current verification report to satisfy the repository's existing local-pass or `pr_evidence_pending` readiness contract.
3. Detect BREAKING case-insensitively. Require `**Version bump**: major` in approved requirements or design before any major bump.
4. Read `steering/tech.md` versioning tables. Classify the issue by bug/enhancement matrix; `spike` never suppresses the bump.
5. Update `VERSION`, `package.json`, `CHANGELOG.md` `[Unreleased]`, and every declared versioned file as one logical change. Resume idempotently: if the exact branch already has an open PR whose delivery commit contains the synchronized target version, do not bump again.
6. Commit any delivery/version changes, perform the current clean-scope and merge-base preflight, push without force, then create or resume the PR for the exact branch. Preserve draft handling for valid `pr_evidence_pending` verification.
7. Fetch PR/check/review/thread state and pass the normalized snapshot through `classifyPrDeliveryState`. Automated reviewer identity is `__typename === "Bot"`, login `coderabbitai`, or a login declared in `steering/tech.md`.
8. Human threads, CHANGES_REQUESTED, or explicit `--remediation-result human_review` write the failed intervention handoff and stop without merge.
9. Actionable failing checks or unresolved bot threads emit the remediation packet and exit 3. Pending-only state polls every 30 seconds for at most one hour from the initial observation, then writes `delivery_pending`.
10. Ready state captures head H immediately before merge and invokes repository-policy squash merge with `--match-head-commit H` and branch deletion unless steering policy overrides that mode.
11. Re-fetch PR and issue. Only PR `MERGED` at H plus issue `CLOSED` produces a passed handoff. Delete the local issue branch only after this proof.

## Remediation protocol

The controller prints exactly one line with prefix `NMG_SDLC_REMEDIATION: ` followed by compact JSON:

```json
{
  "schemaVersion": 1,
  "kind": "remediation_required",
  "issue": 195,
  "pullRequest": 203,
  "headSha": "abc123",
  "failingChecks": [{ "name": "test", "url": "https://..." }],
  "threads": [{ "path": "src/file.ts", "line": 42, "body": "...", "url": "https://..." }],
  "handoffPath": ".omp/sdlc/handoffs/195-deliver.json"
}
```

Arrays are present even when empty. Only unresolved, non-outdated automated-review threads are included. The packet is a snapshot: before any merge, rerun re-fetches and requires the current head rather than trusting the packet SHA.

The compact workflow reads the packet directly from stdout. It may apply only an obvious, local, safe fix; then it runs the repository's targeted verification, commits if needed, pushes without force, and reruns the controller. It never resends a model prompt or starts another worker. If the request is ambiguous, design-affecting, human-authored, or unsafe, it invokes the remediation-result form so the controller writes `human_review`.

## Handoffs

All valid issue invocations that terminate rather than request remediation write `.omp/sdlc/handoffs/N-deliver.json` and print `NMG_SDLC_HANDOFF: .omp/sdlc/handoffs/N-deliver.json`.

Passed handoff fields remain schema version 1, issue N, step `deliver`, status `passed`, intervention false, summary naming the merged PR and closed issue, PR URL artifact, next null, and reasonCode null.

Failed handoffs use status `failed`, intervention true, step `deliver`, next null, and a stable reasonCode. Existing delivery failures remain; this change explicitly requires `major_bump_required`, `human_review`, `delivery_pending`, and `merge_failed`.

## Workflow changes

`workflows/open-pr/WORKFLOW.md` keeps its current frontmatter and becomes a compact controller/remediation loop. `workflows/address-pr-comments/WORKFLOW.md` remains available as on-demand clear-fix guidance, but `workerPrompt({ step: 'deliver' })` no longer inlines it unconditionally.

`scripts/sdlc-execute.mjs` changes `STEP_EXTRA_WORKFLOWS` to retain only `implement: ['simplify']`. Worker names, pane behavior, handoff validation, and keep-open behavior remain unchanged.

## Testing strategy

| Layer | Coverage |
|-------|----------|
| controller unit | invalid CLI, major gate, spike bump, synchronized version writes, resume idempotence, human review, remediation packet, pending timeout, head change, merge proof |
| classifier integration | snapshots flow through `classifyPrDeliveryState`; no duplicate readiness logic |
| workflow/prompt | compact open-pr invocation, deliver excludes Address PR Comments, implement still includes Simplify |
| injected command | exact `gh pr merge --squash --match-head-commit H --delete-branch`; no force push; no local deletion before proof |
| focused regression | existing execute, delivery-state, prompt-byte, command rendering, and extension-surface tests |

---

## Change History

| Issue | Date | Summary |
|-------|------|---------|
| #195 | 2026-08-21 | Initial feature spec |
