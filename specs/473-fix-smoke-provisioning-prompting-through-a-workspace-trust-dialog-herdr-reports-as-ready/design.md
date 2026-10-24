# Root Cause Analysis: Fix smoke provisioning prompting through a workspace-trust dialog Herdr reports as ready

**Issue**: #473
**Date**: 2026-10-24
**Status**: Approved
**Author**: NMG
**Related Spec**: specs/470-fix-sdlc-execute-closing-worker-panes-while-their-background-work-runs/

## Root Cause

In `steering/extensions/nmg-sdlc-smoke.mjs`, the provisioning readiness loop breaks on `agentGet(name).agent.interactive_ready === true` before it reads the pane. When `herdr agent start` succeeds, the trust dialog is never looked for. The provisioning pane is a narrow `--direction right` split. There, Claude Code's trust dialog has scrolled its header away and wraps `Yes, I trust this folder` across two lines, and Herdr reports the agent `idle` and ready. The provider's `/sdlc-draft-issue` prompt ends with Enter, which confirms the preselected `No, exit`, and Claude Code exits.

Even with the dialog checked first, `claudeDialog` would not have recognized it. It matches patterns such as `/Yes, I trust this folder/` against raw pane text, and the only trust text left on the narrow screen is wrapped.

## Affected Code

| File | Symbol / Area | Role |
|------|---------------|------|
| `steering/extensions/nmg-sdlc-smoke.mjs` | provisioning readiness loop | Trusts `interactive_ready` before checking for a dialog |
| `steering/extensions/nmg-sdlc-smoke.mjs` | `claudeDialog` | Misses wrapped dialog labels |

## Fix Strategy

- Check `visibleDialog()` first on every readiness poll. If it shows the workspace-trust dialog, accept it through the existing `acceptOwnedTrust` (once, and only for the owned clone) and poll again. Readiness counts only when no trust dialog is visible (FR1).
- In `claudeDialog`, replace every whitespace run with one space before matching (FR2).

## Risks

- Each readiness poll now also reads the pane. The added cost is one Herdr call per poll during startup only.
