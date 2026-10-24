---
description: "Deliver verified work through exact-head PR merge"
argument-hint: "[#N]"
---

Plugin paths: `${CLAUDE_PLUGIN_ROOT}` is the installed nmg-sdlc plugin root. Read packaged files by their `${CLAUDE_PLUGIN_ROOT}/...` path.
- In the inlined `open-pr` workflow, relative paths such as `references/...`, `templates/...`, `checklists/...`, and `agents/...` resolve under `${CLAUDE_PLUGIN_ROOT}/workflows/open-pr/`.
- `../../references/...` resolves under `${CLAUDE_PLUGIN_ROOT}/references/`, and a path beginning `workflows/` resolves under `${CLAUDE_PLUGIN_ROOT}/`.
- Paths such as `specs/`, `steering/`, and `.nmg-sdlc/` name files in the current project, not in the plugin.


# Open PR

Resolve issue N from `$ARGUMENTS` or the current issue branch. Controller paths (`${CLAUDE_PLUGIN_ROOT}/scripts/...`) name the installed nmg-sdlc plugin: the command file and the nmg-sdlc hooks module materialize them, so invoke controllers exactly as written. Operate on the live issue branch and its exact remote branch; `.nmg-sdlc/run.json`, session tokens, and old handoffs are not authority.

Run `node ${CLAUDE_PLUGIN_ROOT}/scripts/sdlc-deliver.mjs --issue N`. The controller checks the singular Approved spec, passing exact-source registered verification, live PR-only evidence, CI, review, exact-head merge, and linked CLOSED issue. Exit 0 is delivery only when its validated passed handoff proves the expected PR head is MERGED and issue N is CLOSED.

If the report states `PR Evidence Pending`, run `node ${CLAUDE_PLUGIN_ROOT}/scripts/sdlc-deliver.mjs prepare-pr-evidence --issue N` to create or reuse the draft and observe PR checks. Do not mark ready or merge. Return to `/sdlc-verify-code #N` to incorporate actual green exact-head PR evidence into a Pass report and finalize; then retry ordinary delivery.

If version preparation is needed before final verification, run `node ${CLAUDE_PLUGIN_ROOT}/scripts/sdlc-deliver.mjs prepare-version --issue N`, then verify the resulting source HEAD with the full registered gate. Never make a new version commit after a passing gate.

On failed CI or actionable bot review, give the exact check/thread packet to an implementation repair worker. Rerun full verification after a substantive source change, then retry ordinary delivery against the same PR. An unchanged failure requires different diagnosis, not replay of the same smoke or push. Pending checks require live state change; human-required review remains blocked until actual approval. Do not forge approval, suppress checks, force push, manually replay a lost merge, or synthesize handoffs. If a merge acknowledgment is lost, inspect the remote PR and issue before any repeat.

If delivery fails with `closing_linkage_unobserved`, the PR was not merged and stays open. Wait for CI and the PR's other checks and processes to complete, re-observe live linkage with `gh pr view <P> --json closingIssuesReferences`, diagnose repository-specific causes using `references/ci-monitoring.md`, then rerun ordinary delivery. No numeric observation limit applies. Never merge outside ordinary delivery, force push, or synthesize a handoff. If linkage still cannot be established, keep the branch and PR, leave the delivery-written failed handoff, and report the exact gap.

Read `references/ci-monitoring.md` when CI checks fail or closing linkage is unobserved, `references/preflight.md` when preflight checks fail, and `references/pr-dependent-delivery.md` when PR-dependent delivery checks fail; live remote facts and exact commit identity govern resumption.
