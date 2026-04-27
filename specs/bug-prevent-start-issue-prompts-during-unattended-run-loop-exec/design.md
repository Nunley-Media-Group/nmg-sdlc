# Root Cause Analysis: Prevent start-issue prompts during unattended run-loop exec

**Issue**: #129
**Date**: 2026-04-27
**Status**: Fixed
**Author**: Codex

---

## Root Cause

The current `start-issue` contract states that `.codex/unattended-mode` pre-approves prompt gates and that an argument-supplied issue skips Steps 2 and 3. The detailed Step 3 instructions, however, still say to ask whether the user is ready to proceed. In an unattended `codex exec` child, that local prompt wording can become reachable even though the higher-level unattended section says to skip it.

The runner reinforces the default no-argument selection path with explicit "UNATTENDED MODE" and "Do NOT ask the user questions" wording. When the runner has already pre-selected an issue, `buildCodexArgs()` emits the shorter "Start issue #N" prompt. That prompt is correct for issue identity, but it does not restate that the child is in `codex exec`, has no interactive user, and must not call `request_user_input`.

The runner's soft-failure catalog also detects older text such as `request_user_input` with `unattended-mode`, but it does not detect the current Codex exec error phrase `request_user_input is not supported in exec mode`. If the branch postcondition is not reached, Step 2 can fail later than necessary or with less actionable diagnostics.

### Affected Code

| File | Lines | Role |
|------|-------|------|
| `skills/start-issue/SKILL.md` | 16-24 | Defines unattended behavior and says Steps 2-3 are skipped when `.codex/unattended-mode` exists. |
| `skills/start-issue/SKILL.md` | 149-154 | Detailed Step 3 confirmation text can be interpreted as an unconditional prompt. |
| `skills/start-issue/references/stale-remote-branch.md` | 48-73 | Stale branch deletion is intentionally prompt-gated only in interactive mode. |
| `scripts/sdlc-runner.mjs` | 1156-1172 | Step 2 prompt differs between preselected issue and no-argument selection paths. |
| `scripts/sdlc-runner.mjs` | 1426-1429 | Text failure patterns do not cover the current Codex exec `request_user_input` error phrase. |
| `scripts/sdlc-runner.mjs` | 2581-2593 | Step 2 branch postcondition already catches missing branch state after successful exit. |

### Triggering Conditions

- `.codex/unattended-mode` exists and the SDLC runner is driving the workflow.
- The runner pre-selects an issue before spawning the Step 2 child session.
- The child session follows a prompt-capable `start-issue` instruction branch.
- `request_user_input` is unavailable because the child runs under `codex exec`.

---

## Fix Strategy

### Approach

Make the existing contract explicit at every reachable boundary instead of adding a new control channel. The `start-issue` skill should restate local guards where prompt-capable steps are defined, and the runner's preselected issue prompt should carry the same non-interactive warning as the default selector path.

The failure classifier should recognize the exact current exec-mode phrase as a Step 2 failure signal while avoiding broad treatment of every quoted `request_user_input` mention as a failure. This preserves the existing branch postcondition check as the final safety net.

### Changes

| File | Change | Rationale |
|------|--------|-----------|
| `skills/start-issue/SKILL.md` | Clarify that Step 3 confirmation is interactive-only and is skipped whenever `.codex/unattended-mode` exists, including argument/preselected issue paths. | Removes the local prompt instruction that can override the top-level unattended contract. |
| `skills/start-issue/references/stale-remote-branch.md` | Confirm stale-branch prompts remain interactive-only and unattended mode uses deterministic delete-or-diagnostic behavior without `request_user_input`. | Guards the other prompt-capable path named in the issue. |
| `skills/start-issue/references/milestone-selection.md` | Preserve interactive milestone prompting while keeping unattended milestone selection deterministic and prompt-free. | Ensures ambiguous milestone handling remains covered if the implementation touches this reference. |
| `scripts/sdlc-runner.mjs` | Add explicit no-user/no-`request_user_input` wording to the preselected issue Step 2 prompt. | Gives the `codex exec` child the same constraints as the default unattended prompt path. |
| `scripts/sdlc-runner.mjs` | Detect `request_user_input is not supported in exec mode` as a Step 2 contract failure. | Converts the observed failure into an actionable runner failure instead of a misleading success path. |
| `scripts/__tests__/sdlc-runner.test.mjs` | Cover the preselected issue prompt and current prompt-tool error phrase. | Prevents recurrence as prompt wording and Codex error text evolve. |

### Blast Radius

- **Direct impact**: `start-issue` skill instructions, runner Step 2 prompt construction, runner soft-failure detection, runner tests.
- **Indirect impact**: `run-loop` reliability for all projects using unattended mode.
- **Risk level**: Medium, because prompt text changes affect model behavior and runner failure classification.

---

## Regression Risk

| Risk | Likelihood | Mitigation |
|------|------------|------------|
| Interactive `start-issue` stops prompting when it should ask the user. | Low | Keep every new guard explicitly tied to `.codex/unattended-mode`; add AC4 regression coverage. |
| Runner misclassifies historical quoted error text as a live Step 2 failure. | Medium | Scope the new phrase to current exec-mode wording and preserve existing tests that quoted historical failures are ignored. |
| Preselected issue prompt becomes inconsistent with default issue-selection prompt. | Low | Add prompt-construction tests for both paths. |
| Stale-branch reconciliation skips needed human confirmation in manual mode. | Low | Leave interactive stale-branch confirmation intact and only clarify unattended deterministic behavior. |

---

## Verification Strategy

1. Run `npm test` in `scripts/` for runner unit coverage.
2. Run `node scripts/skill-inventory-audit.mjs --check` if skill/references wording changes.
3. Exercise `start-issue` under unattended conditions against a disposable or dry-run project, verifying no `request_user_input` call appears and Step 2 either creates a feature branch or fails non-interactively.
4. Verify an interactive `start-issue` session still presents selection/confirmation gates when `.codex/unattended-mode` is absent.

---

## Change History

| Issue | Date | Summary |
|-------|------|---------|
| #129 | 2026-04-27 | Initial defect design |
