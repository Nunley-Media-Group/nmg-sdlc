---
name: open-pr
description: "Deliver verified work through exact-head PR merge and issue closure. Branch/live remote is authority."
---

# Open PR

Resolve issue N from `$ARGUMENTS` or the current issue branch. Resolve `<plugin-root>` from the active installed extension. Operate on the live issue branch and its exact remote branch; `.omp/sdlc/run.json`, session tokens, and old handoffs are not authority.

Run `node <plugin-root>/scripts/sdlc-deliver.mjs --issue N`. The controller checks the singular Approved spec, passing exact-source registered verification, live PR-only evidence, CI, review, exact-head merge, and linked CLOSED issue. Exit 0 is delivery only when its validated passed handoff proves the expected PR head is MERGED and issue N is CLOSED.

If the report states `PR Evidence Pending`, run `node <plugin-root>/scripts/sdlc-deliver.mjs prepare-pr-evidence --issue N` to create or reuse the draft and observe PR checks. Do not mark ready or merge. Return to `/sdlc-verify-code #N` to incorporate actual green exact-head PR evidence into a Pass report and finalize; then retry ordinary delivery.

If version preparation is needed before final verification, run `node <plugin-root>/scripts/sdlc-deliver.mjs prepare-version --issue N`, then verify the resulting source HEAD with the full registered gate. Never make a new version commit after a passing gate.

On failed CI or actionable bot review, give the exact check/thread packet to an implementation repair worker. Rerun full verification after a substantive source change, then retry ordinary delivery against the same PR. An unchanged failure requires different diagnosis, not replay of the same smoke or push. Pending checks require live state change; human-required review remains blocked until actual approval. Do not forge approval, suppress checks, force push, manually replay a lost merge, or synthesize handoffs. If a merge acknowledgment is lost, inspect the remote PR and issue before any repeat.

Read `references/preflight.md`, `references/ci-monitoring.md`, and `references/pr-dependent-delivery.md` when their respective checks fail; live remote facts and exact commit identity govern resumption.
