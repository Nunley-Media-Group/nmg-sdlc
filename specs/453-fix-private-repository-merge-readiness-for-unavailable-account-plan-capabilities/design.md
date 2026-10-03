# Design: Fix private-repository merge readiness for unavailable account-plan capabilities

**Issue**: #453
**Date**: 2026-10-03
**Status**: Approved
**Author**: RussellBTech
**Related Spec**: specs/407-wait-for-required-ci-before-merging-spec-only-prs/, specs/429-wait-through-stale-unstable-spec-pr-mergeability-after-checks-pass/

## Overview

Keep account-plan capability classification private to policy discovery in `scripts/publish-approved-spec.mjs`. No public CLI, output schema, dependency, or configuration change is needed. `expectedCheckNames` currently fails through `readJson` on any non-success branch-rule response and permits only the existing explicitly unprotected-branch response for classic protection. Correct only those two discovery decisions.

## Architecture

Add a private `isAccountPlanCapabilityUnavailable(result)` predicate beside `expectedCheckNames`; no equivalent predicate exists in this publication helper. It returns true only for a completed command with a nonzero integer exit status whose stderr contains a trimmed diagnostic line equal to `gh: Upgrade to GitHub Pro or make this repository public to enable this feature. (HTTP 403)` or the same line without the `gh: ` prefix. Match the complete sentence and HTTP status together. Do not infer capability from exit status alone, a generic 403, repository identity, private visibility, a 404, successful response data, or a transport/spawn failure. Do not broaden the generic `readJson` or command runner.

In `expectedCheckNames`, capture the branch-rules command result before parsing. If the predicate matches, contribute no expected names from that source; otherwise use the existing `readJson` and rules-array validation unchanged. Always continue to classic required-status-check protection discovery. Preserve the one accumulating `Set` of expected check names.

For the classic-protection result, retain existing successful parsing and context/check accumulation. In the non-success branch, accept the same predicate in addition to the existing explicit exit-1 `Branch not protected` case. Neither exception clears requirements already obtained from rules. Every other discovery error retains the existing fail-closed path and diagnostics. If both sources independently match the explicit unavailable diagnostic, neither supplies expected names, but required/all reported checks and every normal readiness gate still apply; an empty check set is not readiness. An unavailable source never masks an ordinary failure from the other source.

## Readiness Behavior

`publicationSnapshot` must still combine expected names, required checks, and all reported checks. A missing expected check and an empty reported set remain non-ready; pending observations cannot authorize merge. Terminal failure and unknown/unreadable evidence remain non-passing. A capability-unavailable response to a check query is still a check-query failure, never an empty successful list.

Preserve exact PR number, head SHA, head branch, base branch, OPEN state, non-draft state, and mergeability checks. `awaitPublicationReady` continues to require two fresh ready snapshots at the same captured local head. CLEAN is the only ready mergeability state; UNKNOWN and stale UNSTABLE continue waiting, and explicit blockers remain blocking. The existing merge operation retains its matching-head argument.

`scripts/sdlc-deliver.mjs` remains production-code unchanged: its required/all check parsing is not one of these policy-discovery sources. Add regression evidence through its existing test harness, not a shared exception, empty-success fallback, or independently claimed delivery fix.

## Behavioral Proof Boundaries

Extend the existing publication CLI fixture tests for each discovery source independently and together. A failed discovery with the exact diagnostic and successful fresh checks permits the existing merge path; the same status without that sentence fails without a merge. A readable source requiring an unreported check still prevents merge when the other source is unavailable, in both source directions.

Cover generic permission/authentication errors, generic 403, 404, malformed successful payloads, network failures, and the exact diagnostic with an HTTP status other than 403. Preserve the existing explicit unprotected-branch case. Exercise absent, pending, failed, unknown, malformed, and unreadable check responses while discovery is unavailable; require unchanged identity and two fresh CLEAN observations before a merge command. Assert observable CLI results and ordering, not source strings or predicate implementation.

Use isolated delivery fixtures to prove ordinary successful readiness and non-passing pending/failed/absent/malformed/unreadable check evidence. Include the exact capability diagnostic returned from required and all-check queries as separate cases; neither may pass as an empty list. Existing verification, automated-review, identity, and mergeability fixtures remain passing without changing their contracts.

## Fixture Integration

Reuse `makeRepo`, `writeApproved`, and the real publication CLI invocation in `scripts/__tests__/publish-approved-spec.test.mjs`. Its fake `gh` routes for rules and protection currently lack independent error controls; extend those routes with per-source status/stdout/stderr responses while preserving existing default responses. Reuse `GH_EXPECTED_MISSING`, `GH_PROTECTED`, `GH_PENDING_CI`, `GH_NO_REQUIRED`, `GH_OPTIONAL_PENDING`, `GH_FAILED_CI`, `GH_POLICY_BLOCK`, `GH_STALE_UNSTABLE`, and existing identity flags. `.gh-log` and `.pr-state-log` prove observation order. New negative fixture responses must terminate; wait-path fixtures transition to success after recorded pending snapshots instead of depending on an indefinite timeout.

Reuse `fixture`, its recorded `calls`, and `runDeliver` in `scripts/__tests__/sdlc-deliver.test.mjs`. Add independent status/stdout/stderr responses selected by `args.includes('--required')`; current `pending: true` configures verification evidence, not live check state, so it cannot substitute for a live-pending check case. A failing required query and a failing unfiltered query are separate cases. Keep valid failed-check JSON distinct from unreadable command output. The recognized no-check diagnostic remains distinct from a generic error. For absence, preserve existing configured/declared-required-check semantics, using the existing classifier coverage in `scripts/__tests__/pr-delivery-state.test.mjs` rather than imposing a new universal delivery no-check rule. Reuse its pending-state and identity cases; extend only gaps in delivery command-response behavior.

## Change History

| Issue | Date | Summary |
|-------|------|---------|
| #453 | 2026-10-03 | Initial feature design |
