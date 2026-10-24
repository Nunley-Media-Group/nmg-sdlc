# Root Cause Analysis: Fix autopilot plan approval leaving Claude Code's ExitPlanMode dialog up

**Issue**: #474
**Date**: 2026-10-24
**Status**: Approved
**Author**: NMG
**Related Spec**: specs/473-fix-smoke-provisioning-prompting-through-a-workspace-trust-dialog-herdr-reports-as-ready/

## Root Cause

`hooks/register.ts` returns `{ decision: { behavior: 'allow' } }` from `classic.PermissionRequest` for `ExitPlanMode`. Claude Code treats `ExitPlanMode` as a tool that requires the person, and it settles such a tool only from an allow that carries the tool's input back. Its debug log shows the difference. The `AskUserQuestion` allow, which carries `updatedInput`, is followed by `control_cancel_request` and `tool_dispatch_start`. The bare `ExitPlanMode` allow is followed by neither, and the dialog paints. The hooks test harness accepts either shape, so the tests did not catch it.

## Affected Code

| File | Symbol / Area | Role |
|------|---------------|------|
| `hooks/register.ts` | `classic.PermissionRequest` hook | Returns a bare allow for `ExitPlanMode` |
| `hooks/register.test.ts` | write-spec Finished and autopilot tests | Assert the bare allow |

## Fix Strategy

Add `approvePlan(input)`, which returns `{ behavior: 'allow', updatedInput: input ?? {} }`, and use it for both `ExitPlanMode` approvals.

## Verification

Live, with Claude Code 2.1.310 and `--debug`: after the fix, the `ExitPlanMode` allow is followed by `control_cancel_request` and `tool_dispatch_start tool=ExitPlanMode ... outcome=ok`, and the session keeps working with no dialog.
