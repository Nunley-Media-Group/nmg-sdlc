# Root Cause Analysis: Spec-only CI merge race

**Issue**: #407
**Date**: 2026-09-22
**Status**: Approved
**Author**: NMG

## Root Cause

`mergeSpec` opens or finds the PR and calls `gh pr merge` immediately. It neither observes the PR's exact head nor waits for required CI, so GitHub rejects a normal interval between PR creation and check registration. #400's implementation-delivery polling does not run on this path.

## Fix Strategy

Keep publication policy in `scripts/publish-approved-spec.mjs`. Observe the existing PR number, head SHA, mergeability, effective ruleset and branch-protection required contexts, required check results, and unfiltered check results. A configured context absent from the PR remains pending even if GitHub briefly says CLEAN; zero reported checks also remain pending. Missing and nonterminal results remain pending with a five-second polling interval but no workflow deadline. Terminal failures and proven non-CI blocks fail with structured evidence. GitHub may report `UNSTABLE` or `BLOCKED` while CI is incomplete; both become blockers only after CI is terminal. Re-read the same PR's head, policy, checks, and CLEAN state immediately before merging with `--match-head-commit`; refuse head drift. Preserve existing post-merge checkout/pull/label handling and existing-PR reuse. The fake-gh fixture drives absent-policy-context, pending-to-green, and terminal negative cases.

## Risks

- GitHub `gh pr checks --required` can exit nonzero while checks are pending or unreported: classify structured output before interpreting exit code.
- `mergeStateStatus` may be `UNSTABLE` or `BLOCKED` solely by incomplete CI: only treat it as waiting while check evidence remains incomplete; terminal successful blocking states are policy failures.
- Remote head changes across observations: pin the first observed head and never merge a different commit.
- No required checks reported is not proof of completed CI: inspect unfiltered checks and wait rather than merging on an empty list.
