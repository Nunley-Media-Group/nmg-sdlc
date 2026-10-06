# Root Cause Analysis: Require observed closing-issue linkage before exact-head merge

**Issue**: #448
**Date**: 2026-10-06
**Status**: Approved
**Author**: NMG
**Related Spec**: specs/8-open-pr-skill/

## Root Cause

In `scripts/sdlc-deliver.mjs`, the ordinary merge-ready loop in `runDeliverUnlocked` runs: refreshed `fetchSnapshot` → `cleanDeliveryTree` → local branch/HEAD check → `exactRemoteHead` → `registeredGate` → `writeSmokeDeliveryProof` → `gh pr merge <P> --squash --match-head-commit <head>` → `reconcilePostMerge`. `fetchSnapshot` does not request `closingIssuesReferences`, and pull-request discovery only regex-matches `Closes #N` in the body. GitHub's computed closing linkage is read only in `reconcilePostMerge`, after the irreversible merge, so a pull request whose body says `Closes #N` but for which GitHub recorded no closing reference is merged and then fails `delivery_linkage_unproven` with the issue still OPEN. `workflows/open-pr/references/ci-monitoring.md` lists closing issue references among pre-merge observations, but neither the script nor the workflow acts on a missing link.

## Affected Code

| File | Symbol / Area | Role |
|------|---------------|------|
| `scripts/sdlc-deliver.mjs` | `runDeliverUnlocked` merge-ready loop | Issues the merge without observing linkage |
| `scripts/sdlc-deliver.mjs` | `reconcilePostMerge` | Only reader of `closingIssuesReferences`; post-merge |
| `workflows/open-pr/WORKFLOW.md` | delivery-failure guidance | Inlined into the deliver worker prompt; no guidance for missing linkage |
| `workflows/open-pr/references/ci-monitoring.md` | Terminal Exact-Head Delivery | Lists linkage as an observation without merge-precondition or worker handling |

## Fix Strategy

1. Add a private predicate `closingLinkObserved(pr, issue, issueUrl)` in `scripts/sdlc-deliver.mjs` returning exactly `Array.isArray(pr.closingIssuesReferences) && pr.closingIssuesReferences.some((item) => item.number === issue && item.url === issueUrl)`. In `reconcilePostMerge`, replace the inline `linked` expression with `closingLinkObserved(pr, issue, issueData.url)`; this is the identical expression, so post-merge behavior is unchanged.
2. Add a private `requireClosingLinkage({ context, run, prNumber, head })` that:
   - reads `gh pr view <prNumber> --json number,url,state,headRefOid,closingIssuesReferences` via `jsonCommand`;
   - if `pr?.number !== prNumber`, `pr.headRefOid !== head`, or `pr.state !== 'OPEN'`, calls `abortDelivery(fail(context, 'delivery_reconciliation_required', \`PR #${prNumber} changed before exact-head merge\`))`;
   - derives `repositoryUrl` from `pr.url` with the same `/\/pull\/[1-9]\d*\/?$/` replacement and `^https:\/\/[^/]+\/[^/]+\/[^/]+$` validation used by `reconcilePostMerge`; on mismatch (including `pr.url !== \`${repositoryUrl}/pull/${prNumber}\``) calls `abortDelivery(fail(context, 'delivery_reconciliation_required', 'Observed issue/repository identity does not match the exact delivery target'))`;
   - if `!closingLinkObserved(pr, context.issue, \`${repositoryUrl}/issues/${context.issue}\`)`, calls `abortDelivery(fail(context, 'closing_linkage_unobserved', \`PR #${prNumber} does not link issue #${context.issue}; exact-head merge not attempted\`, null, [pr.url]))`;
   - otherwise returns. It never polls, sleeps, or counts observations.
   It must not call the undefined `reconciliationFailure`.
3. In the merge-ready loop, call `requireClosingLinkage({ context, run, prNumber: current.number, head })` after `registeredGate(...)` and before `writeSmokeDeliveryProof(...)`, so no smoke pre-merge receipt is written and no merge command is issued when linkage is unobserved. The already-MERGED paths (`pr?.state === 'MERGED'` at discovery, `current.state === 'MERGED'`, and `observed.pr.state === 'MERGED'` in the loop) stay as they are and never call it.
4. Update `workflows/open-pr/WORKFLOW.md` and `workflows/open-pr/references/ci-monitoring.md` with the worker guidance in Changes.

## Changes

| File | Change | Behavioral reason |
|------|--------|-------------------|
| `scripts/sdlc-deliver.mjs` | Add `closingLinkObserved`; use it in `reconcilePostMerge` | FR1 single predicate; AC4 unchanged post-merge behavior |
| `scripts/sdlc-deliver.mjs` | Add `requireClosingLinkage`; call it between `registeredGate` and `writeSmokeDeliveryProof` | AC1, AC2, FR1, FR2 |
| `workflows/open-pr/WORKFLOW.md` | Insert, after the paragraph beginning "On failed CI or actionable bot review", a paragraph: "If delivery fails with `closing_linkage_unobserved`, the PR was not merged and stays open. Wait for CI and the PR's other checks and processes to complete, re-observe live linkage with `gh pr view <P> --json closingIssuesReferences`, diagnose repository-specific causes using `references/ci-monitoring.md`, then rerun ordinary delivery. No numeric observation limit applies. Never merge outside ordinary delivery, force push, or synthesize a handoff. If linkage still cannot be established, keep the branch and PR, leave the delivery-written failed handoff, and report the exact gap." Also extend the final reference-reading sentence so `references/ci-monitoring.md` is read when closing linkage is unobserved. | AC3, FR3 (inlined into the deliver worker prompt) |
| `workflows/open-pr/references/ci-monitoring.md` | Insert after the "Ready requires…" paragraph: "Closing linkage is a merge precondition. Ordinary delivery reads live `closingIssuesReferences` immediately before the exact-head merge and requires an entry whose number is N and whose URL is the same-repository issue URL. When absent, it does not merge and fails `closing_linkage_unobserved` (`PR #P does not link issue #N; exact-head merge not attempted`). Treat this as a non-terminal worker condition: wait until `gh pr checks <P>` reports no pending check and the PR's other checks and processes have completed; re-observe `gh pr view <P> --json closingIssuesReferences,baseRefName,body`; diagnose repository-specific causes such as a base branch other than the repository default branch, a missing or altered `Closes #N` line, or an issue in another repository; then rerun ordinary delivery. Rerun after linkage is observed or after a diagnosed cause changes; an unchanged observation without new diagnosis is not a reason to rerun. No numeric observation limit applies. Never merge outside ordinary delivery, force push, or synthesize a handoff. If linkage still cannot be established, keep the branch and PR, leave the delivery-written failed handoff, and report the exact gap." | AC3, FR3 |

## Blast Radius

Only the ordinary (non-MERGED) merge-ready path of `runDeliverUnlocked` gains one `gh pr view` read before the merge. `prepare-version` and `prepare-pr-evidence` actions, PR creation, draft-to-ready, remediation packets, and every already-MERGED reconciliation path are unchanged. `scripts/sdlc-execute.mjs` handling of failed deliver handoffs is unchanged; the new failure uses the existing `fail` helper (`intervention: true`, `next: null`). The deliver worker prompt changes only through the inlined `workflows/open-pr/WORKFLOW.md` text.

## Alternatives Considered

| Option | Decision | Reason |
|--------|----------|--------|
| Add `closingIssuesReferences` to `fetchSnapshot` and gate in `classifyPrDeliveryState` | Rejected | Classifier is shared state logic; the issue requires the observation immediately before the merge, after the registered gate |
| Poll for linkage inside the script | Rejected | FR2 forbids an in-script timeout or observation count; waiting belongs to the worker |
| Derive the same-repository issue URL from a separate `gh issue view` | Rejected | `reconcilePostMerge` already proves that URL equals the PR-derived `${repositoryUrl}/issues/N`; one read suffices |

## Change History

| Issue | Date | Summary |
|-------|------|---------|
| #448 | 2026-10-06 | Initial defect design |
