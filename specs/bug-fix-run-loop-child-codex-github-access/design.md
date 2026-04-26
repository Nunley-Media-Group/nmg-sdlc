# Root Cause Analysis: Fix run-loop child Codex GitHub access

**Issue**: #122
**Date**: 2026-04-26
**Status**: Complete
**Author**: Codex

---

## Root Cause

The SDLC runner uses one child-launch path for every pipeline step: `buildCodexArgs()` builds `codex exec --full-auto --json`, and `runCodex()` passes those arguments to `spawn()`. Current `codex exec --help` describes `--full-auto` as a low-friction sandboxed automatic mode, so it preserves unattended execution but still constrains child tool calls.

That coupling is the design flaw. Runner-spawned child sessions are not ordinary user-initiated sandboxed sessions; they are the execution engine for a trusted unattended automation loop. Steps like `startIssue`, `writeSpecs`, `createPR`, `monitorCI`, and `merge` must be able to use GitHub, and implementation/verification steps may need normal workspace and tool access. Because the runner currently uses sandboxed `--full-auto`, a child can fail `gh` calls with `error connecting to api.github.com` even when the parent process can reach GitHub. The child may then exit 0 with only prose output, causing the generic missing-branch postcondition to burn retries instead of surfacing the real capability mismatch.

The fix is to separate "non-interactive" from "sandboxed" in the runner contract. The runner should keep unattended-mode semantics through `.codex/unattended-mode`, `--json`, and no interactive prompts, but child Codex sessions should use Codex's yolo/no-sandbox flag for every step. The currently observed failure is GitHub network access, but the contract is broader: runner-spawned children need parent-equivalent execution capability for SDLC automation.

### Affected Code

| File | Lines / Area | Role |
|------|--------------|------|
| `scripts/sdlc-runner.mjs` | `buildCodexArgs()` around the child `codex exec` argument list | Adds `--full-auto` to every runner-spawned child session. |
| `scripts/sdlc-runner.mjs` | `runCodex()` spawn path | Launches every pipeline step through the generated child args while preserving filtered environment variables. |
| `scripts/sdlc-runner.mjs` | `TEXT_FAILURE_PATTERNS` and `detectSoftFailure()` | Detects exit-code-0 child failures from raw text output after JSON checks. |
| `scripts/sdlc-runner.mjs` | Step 2 missing-feature-branch postcondition | Catches silent `startIssue` failures after state extraction. |
| `scripts/__tests__/sdlc-runner.test.mjs` | `buildCodexArgs`, `detectSoftFailure`, and runner integration tests | Locks launch arguments, soft-failure detection, and branch postcondition behavior. |

### Triggering Conditions

- The runner invokes any child step through `codex exec --full-auto --json`.
- The child step needs capability outside the sandbox, such as GitHub network access.
- The parent process has the required capability, but the child sandbox blocks it.
- The child emits a textual GitHub access failure and exits 0.
- Step 2 remains on `main` with no feature branch, so the runner retries the missing-branch postcondition instead of escalating the root cause immediately.

---

## Fix Strategy

### Approach

Replace `--full-auto` in `buildCodexArgs()` with `--dangerously-bypass-approvals-and-sandbox`, the current Codex CLI yolo/no-sandbox flag. Keep `--json`, `--model`, `--cd`, and effort configuration unchanged. This applies to every step because the user-approved requirement is that all runner-spawned child sessions run without sandboxing, not that the runner select per-step capability policies.

Extend the text soft-failure catalog with GitHub auth/network failure patterns. The minimal initial pattern should cover the reproduced `error connecting to api.github.com` message and use a reason label that preserves the concrete failure class, such as `github_access`. Because `detectSoftFailure()` runs before state extraction and before the Step 2 missing-branch postcondition, this routes known GitHub access failures into the existing failure/escalation path with the actual cause. The missing-branch gate remains unchanged so non-GitHub silent `startIssue` failures still follow the normal retry/escalation path.

### Changes

| File | Change | Rationale |
|------|--------|-----------|
| `scripts/sdlc-runner.mjs` | Replace `--full-auto` with `--dangerously-bypass-approvals-and-sandbox` in `buildCodexArgs()` for all steps. | Ensures all runner-spawned child Codex sessions use yolo/no-sandbox execution while remaining non-interactive through runner prompts and unattended-mode sentinel behavior. |
| `scripts/sdlc-runner.mjs` | Add a GitHub access entry to `TEXT_FAILURE_PATTERNS`, covering `error connecting to api.github.com` and closely related `gh` auth/network failures if observed in existing logs. | Converts exit-code-0 GitHub access blockers into soft failures with a concrete reason before postcondition retries hide the root cause. |
| `scripts/__tests__/sdlc-runner.test.mjs` | Add launch-argument coverage asserting every `STEP_KEYS` entry uses the yolo flag and omits `--full-auto`. | Prevents regression to sandboxed child execution on any step. |
| `scripts/__tests__/sdlc-runner.test.mjs` | Add `detectSoftFailure()` coverage for `error connecting to api.github.com`. | Locks the GitHub failure classification. |
| `scripts/__tests__/sdlc-runner.test.mjs` | Add or preserve coverage that missing Step 2 branch output without GitHub failure still routes through the existing missing-branch postcondition. | Ensures the targeted GitHub escalation does not weaken the generic no-branch guard. |

### Blast Radius

- **Direct impact**: all `codex exec` subprocesses launched by `scripts/sdlc-runner.mjs`.
- **Indirect impact**: every SDLC runner step (`startCycle`, `startIssue`, `writeSpecs`, `implement`, `simplify`, `verify`, `createPR`, `monitorCI`, `merge`) now runs without Codex sandboxing. This is intentional for the unattended runner contract.
- **Risk level**: Medium. The behavior change is broad, but localized to runner-spawned children. Manual Codex sessions and non-runner skill invocation keep their existing sandbox defaults.

---

## Regression Risk

| Risk | Likelihood | Mitigation |
|------|------------|------------|
| A future edit reintroduces `--full-auto` for some runner step | Medium | Test every `STEP_KEYS` entry through `buildCodexArgs()` and assert the yolo flag is present while `--full-auto` is absent. |
| The yolo flag changes name in a future Codex CLI release | Low | Keep the flag in one argument-builder location and make tests fail clearly when expected args are absent. |
| GitHub access failures appear in `stderr` rather than `stdout` | Medium | If implementation exposes only stdout to `detectSoftFailure()`, pass combined output or extend the call site so text soft-failure detection sees both streams. |
| Non-GitHub no-branch failures stop retrying | Low | Preserve the existing Step 2 missing-branch postcondition and add regression coverage where no GitHub text pattern is present. |
| Unattended behavior regresses because `--full-auto` previously implied automatic approval behavior | Medium | Verify `--dangerously-bypass-approvals-and-sandbox` is still non-interactive, and keep `.codex/unattended-mode`, `--json`, and no-prompt instructions unchanged. |

---

## Alternatives Considered

| Option | Description | Why Not Selected |
|--------|-------------|------------------|
| Keep `--full-auto` and add more environment cleanup | Continue stripping inherited sandbox variables while leaving child sessions sandboxed. | Already insufficient: current help defines `--full-auto` as sandboxed, and the reproduced failure occurs after sandbox environment cleanup. |
| Per-step capability policy | Use yolo only for GitHub-dependent steps and keep other steps sandboxed. | Rejected by product direction for this defect: all runner-spawned child steps should use the yolo approach so automation is not sandboxed unpredictably. |
| Preflight GitHub access only in the parent runner | Probe `gh issue view` before spawning child steps and abort if parent access fails. | Useful as a follow-up, but it does not fix parent/child capability divergence because the parent can already reach GitHub while the child cannot. |
| Retry missing-branch failures fewer times | Detect repeated no-branch outcomes and escalate earlier. | This treats the symptom. The root cause is sandboxed child execution plus missing GitHub failure classification. |

---

## Validation Checklist

Before moving to TASKS phase:

- [x] Root cause is identified with specific code references
- [x] Fix is minimal -- no unrelated refactoring
- [x] Blast radius is assessed
- [x] Regression risks are documented
- [x] Test approach covers the reported failure mode

---

## Change History

| Issue | Date | Summary |
|-------|------|---------|
| #122 | 2026-04-26 | Initial defect design |
