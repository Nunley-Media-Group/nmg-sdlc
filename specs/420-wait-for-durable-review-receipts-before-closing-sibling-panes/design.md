# Design: Durable review receipt collection

**Issue**: #420
**Date**: 2026-09-24
**Status**: Approved
**Author**: NMG

## Boundary
`runBoundedReview` in `scripts/sdlc-execute.mjs` owns sibling worker orchestration. `src/sdlc-review-isolation.mjs` alone creates host-signed startup/tool/final-result receipts and validates assignment digest, module, tools and allowed snapshot paths. Preserve that contract; never read reviewer terminal prose as a result.

## Collection
Launch and prompt all assigned slices as before. Wait for every worker to reach idle/done before inspecting any receipt or closing any pane; keep nonterminal/unknown worker failures fail-closed. When a receipt snapshot is missing or transiently invalid, use the existing `herdr.observationPause` once and re-read exact same assignment/receipt, then reject if still invalid. A valid receipt lacking `review_result` gets the same bounded recheck before `review_artifact_missing`; a persistent invalid scope remains `review_scope_unproven`. After all proofs are valid and results nonempty, close owned panes and write the existing aggregated artifact and handoff. Preserve cleanup on genuinely failed attempts without creating another review attempt or altering assignment authority.

## Evidence and risk
Retained #129 reviewer-1 final receipt at 00:54:37.208Z precedes Herdr pane-close commands at 00:54:37.672–37.793Z. Reviewers 2/3 received SIGHUP/aborted requests during controller cleanup. Every retained assignment and receipt validates after the stop. The precise instantaneous invalid snapshot was not recorded; a collection race remains an inference about that occurrence. The deterministic delayed-host-result fixture did fail before the fix because the controller closed a pane before waiting for all siblings, and passed after the fix. A partial JSONL host receipt completed during the one allowed observation pause also passes after the fix; persistent malformed/foreign receipt tests remain fail-closed.

## Delivery
Read-only `discoverRecovery` on retained #129 after this collector change still returns `blocked`, `review_scope_unproven`, `missing_handoff`, with only inspect-or-stay-stopped options. Do not replay #129 or create a replacement issue under the no-progress rule. CI and skill surface checks are required, but no failed registered smoke is called pass. Coordinate `scripts/sdlc-execute.mjs`, release mirrors and global plugin link with live #418 before publishing or installing.
