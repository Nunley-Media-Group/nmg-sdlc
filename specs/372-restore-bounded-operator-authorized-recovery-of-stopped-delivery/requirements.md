# Defect Report: Restore bounded operator-authorized recovery of stopped delivery

**Issue**: #372
**Date**: 2026-09-07
**Status**: Approved
**Author**: NMG
**Related Spec**: specs/369-detect-execute-remediation-loops-and-close-workers-on-cancel/

## Bug Report
Bare /sdlc-execute cannot resume a branch's incomplete delivery automatically. It opens an issue picker, while an exhausted legacy remediation checkpoint cannot start recovery even after the cause of failure is fixed. The user requires no-parameter branch-local recovery and continued delivery without weakening loop protection.

## Root Cause Analysis
The public command always selects issues when no tokens remain. The execute checkpoint gate correctly preserves #369's exhausted retry history, but has no bounded, auditable bare-invocation recovery transition. --recover-stale reclaims ownership only. A previously recorded pane that no longer exists can also leave pane_close_failed.

**User Confirmed**: Yes. User requested: "When I run sdlc-execute with no params in a branch that is an incomplete execute run it should just automatically recover and continue delivery without weakening loop protection."

## Reproduction Steps
1. Retain an incomplete execute run on its linked feature branch (observed legacy case: 13 implementation remediation attempts).
2. Fix the original failure or install an updated plugin.
3. Invoke /sdlc-execute with no parameters.
4. Observe issue selection rather than recovery; selecting the same issue still stops at the exhausted remediation gate.

## Expected Behavior
Bare execute resolves the exact current branch's incomplete checkpoint, safely recovers demonstrably stale ownership and resumes its persisted queue without a picker or extra flags. For an exhausted loop stop it consumes one durable recovery allowance for that run/issue/step. If that recovery fails, repeated bare commands cannot regenerate the allowance. All historical evidence and downstream gates remain mandatory.

## Actual Behavior
The command opens a picker, then the controller refuses exhausted state without a supported repair dispatch path.

## Environment
| Factor | Value |
|---|---|
| OS / Platform | Observed macOS; solution must be project-, language-, and platform-agnostic |
| Version | nmg-sdlc 3.21.0 |
| Runtime | Node.js, Herdr OMP |

## Acceptance Criteria
### AC1: Bare execute resumes the current branch's incomplete run
**Given** the current branch has one matching incomplete execute checkpoint
**When** the user invokes /sdlc-execute with no parameters
**Then** execute resolves and resumes that exact persisted issue queue and stage without a picker, issue tokens or recovery flags, preserving current work and completed stages; demonstrably stale ownership is recovered automatically, while live ownership is never stolen.

### AC2: Exhausted recovery is durable and cannot become a loop
**Given** the matched checkpoint is an exhausted remediation-loop stop, including legacy attempt 13
**When** bare execute first recovers that stopped run/issue/step
**Then** it durably consumes exactly one recovery allowance before launching at most one repair worker, preserving every prior attempt and failure; duplicate, concurrent and later bare invocations cannot create a second allowance for that same unadvanced stage, including after commits, changed summaries, plugin upgrades or failed recovery.

### AC3: Failed or ambiguous recovery remains stopped
**Given** the one authorized recovery has been consumed
**When** its worker fails without stage advancement, its dispatch becomes ambiguous, or invocation/process loss occurs
**Then** no automatic follow-on remediation or replay starts; the consumed allowance, ownership and evidence remain durable, and the output names the exact actionable blocker without recommending another unchanged retry.

### AC4: Validated recovery continues through delivery
**Given** a resumed or recovery worker produces a genuinely validated passed handoff
**When** execute advances the stage
**Then** normal remaining reviews, fixes, verification, exact-head merge and issue closure continue without waiver; later stages retain normal bounded remediation, and genuine already-passed handoffs can settle without consuming recovery work.

### AC5: Branch, intervention and ownership stay fail-closed
**Given** a mismatched/ambiguous checkpoint or branch, blocked/intervention evidence, live owner or worker, reused pane identity or unreadable Herdr evidence
**When** bare recovery is attempted
**Then** execute refuses unsafe adoption, never downgrades intervention and does not mutate unrelated state or duplicate workers; only positively confirmed absent owned panes may be reconciled as absent.

### AC6: Discovery fallback and operator diagnostics remain complete
**Given** there is no matching incomplete run and no conflicting or unreadable checkpoint
**When** bare execute is invoked
**Then** existing specified-issue selection remains available; completed runs are not reopened. When an incomplete run exists, status and stop output distinguish resumable, loop-recovery-available, recovery-consumed and blocked states with the exact next action. Behavioral regressions, an isolated actual command exercise and fresh registered smoke delivery prove the complete path.

## Functional Requirements
| ID | Requirement | Priority |
|---|---|---|
| FR1 | Resolve bare execute from exact current-branch checkpoint before issue selection. | Must |
| FR2 | Consume a single audited recovery allowance per exhausted run/issue/step before dispatch; preserve all attempt history. | Must |
| FR3 | Do not regenerate allowance without actual stage advancement or convert intervention into retryable failure. | Must |
| FR4 | Recover only proven stale/absent ownership and preserve every normal cancellation, publication and delivery gate. | Must |
| FR5 | No new operator flags or manual token/reason workflow is required for bare recovery. | Must |

## Contract Precedence
This issue adds the explicitly requested bare-command recovery transition to #369. Ordinary explicit-queue reinvocation and --recover-stale alone do not silently grant fresh retries. Automatic remediation still stops after its normal bound. Bare recovery is one additional persisted allowance, never reset by command reinvocation, summary/commit churn or upgraded code.

## Out of Scope
- PennyScan product code, trading, live profiles or broker/service mutations.
- Deleting checkpoints, clearing history, fabricating passed handoffs or altering unrelated #360 state.
- Unlimited restart epochs, automatic recovery after a consumed failed attempt, extra classifier workers or smoke backlog repair.

## Change History

| Issue | Date | Summary |
|---|---|---|
| #372 | 2026-09-07 | Initial defect specification authorized by the operator request to fix recovery and complete delivery without repeating a loop |
| #372 | 2026-09-07 | User requires bare execute to recover the exact incomplete branch automatically; one durable recovery allowance per unadvanced stage, no flags or token workflow |
| #372 | 2026-09-08 | Spec revised before delivery: restore the user-approved bare-command package from bda29350c915ed80a889a44af6a0febd4c2eb2af for an explicitly authorized fresh completion run from released 3.21.1; retain the original issue/spec ownership and protected branch, with the absent original runtime and recovered failure evidence historical only, never copied into live runtime state or represented as a resume |
