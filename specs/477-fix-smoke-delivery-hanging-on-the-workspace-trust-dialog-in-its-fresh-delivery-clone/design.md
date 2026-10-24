# Root Cause Analysis: Fix smoke delivery hanging on the workspace-trust dialog in its fresh delivery clone

**Issue**: #477
**Date**: 2026-10-24
**Status**: Approved
**Author**: NMG
**Related Spec**: specs/473-fix-smoke-provisioning-prompting-through-a-workspace-trust-dialog-herdr-reports-as-ready/

## Root Cause

Claude Code shows its workspace-trust dialog to every session started in an untrusted directory. The smoke provider accepts it only for its provisioning clone, through `acceptOwnedTrust` in `provisionSmokeIssue`. Delivery uses a second fresh clone, and the nested `/sdlc-execute` controller starts its Herdr Claude workers in it. The controller never answers a trust dialog, so its first worker waits on `No, exit` forever.

## Affected Code

| File | Symbol / Area | Role |
|------|---------------|------|
| `steering/extensions/nmg-sdlc-smoke.mjs` | delivery clone preparation in `deliverSmoke` | Launches the nested controller in an untrusted clone |

## Fix Strategy

Add an exported `trustSmokeClone({ herdr, clone, sleep, pollMs, signal, pluginRoot, permissionMode })` and call it after the delivery clone's clean check. It works as follows:

1. Split a pane in the clone and start a Claude agent with the candidate plugin.
2. Poll the pane:
   - On the workspace-trust dialog, check that the pane's cwd is the owned clone, then key `down enter` once.
   - On any other dialog, fail.
   - When `agent get` reports `interactive_ready` with no dialog on screen, pass.
3. Close the pane in a `finally`.

Claude Code records the acceptance, so the controller's workers start trusted. A non-passing result is retained as the gate outcome.

## Risks

- Accepting workspace trust is the provider's one keyed exception. It is still limited to a clone this run created and checked by pane cwd.
