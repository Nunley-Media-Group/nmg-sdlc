# Verification Report: Pasted nmg-sdlc command text is sent to the model instead of running the command

**Date**: 2026-11-09
**Issue**: #541
**Reviewer**: Claude (nmg-sdlc architecture-reviewer, execute verify stage)
**Scope**: Implementation verification against spec
**Verification head**: 0b5b47cc2c4b4990a752aeeee8ae8a4a2c46de11

---

## Executive Summary

| Category | Score (1-5) |
|----------|-------------|
| Spec Compliance | 5 |
| Architecture (SOLID) | 4 |
| Security | 5 |
| Performance | 5 |
| Testability | 5 |
| Error Handling | 4 |
| **Overall** | 4.7 |

### Implementation Status: Pass
**Total Issues**: 2 (both Low, informational; no fix required)

The fix moves the per-command `command.run` body into one module-level `runInteractive($, name, args)` and calls it from both the `command.run` hook and a new branch of the `prompt.submit` hook. A person-originated (`composer`/`bridge`, not `isMeta`) prompt with no engine-parsed `command` whose trimmed text begins with a registered interactive command name now runs that command through the same gates and is dropped with the command's own answer text (or `NMG SDLC: running /<name>.`). Every other prompt follows the unchanged `next(e)` path. Both registered steering gates passed at the verification head, including the live smoke delivery of nmg-sdlc-smoke #296.

---

## Issue Scope

- Active issue: #541
- Spec: `specs/541-run-an-nmg-sdlc-command-whose-text-arrives-as-a-pasted-prompt-instead-of-sending-it-to-the-model-as-plain-text`
- Manifest: `implicit single issue`
- Resolver status: `implicit_single_issue`
- Delivery: AC [AC1, AC2, AC3]; FR [FR1, FR2, FR3, FR4]; tasks [T001, T002]; scenarios [SCN001, SCN002, SCN003]
- Regression: AC []; FR []; scenarios []

<!-- nmg-sdlc-issue-scope: {"issueNumber":541,"specPath":"specs/541-run-an-nmg-sdlc-command-whose-text-arrives-as-a-pasted-prompt-instead-of-sending-it-to-the-model-as-plain-text","status":"implicit_single_issue","delivery":{"acceptanceCriteria":["AC1","AC2","AC3"],"functionalRequirements":["FR1","FR2","FR3","FR4"],"tasks":["T001","T002"],"scenarios":["SCN001","SCN002","SCN003"]},"regression":{"acceptanceCriteria":[],"functionalRequirements":[],"scenarios":[]}} -->

## Delivery Validation

- Local verification: Pass
- PR evidence: Not required

---

## Deterministic Steering Artifact and Ceiling

`sdlc-verify-steering.mjs --project . --issue 541 --base main --controller-run-id be2e91ad-aa3d-4e0c-a1a8-7e4c234af8ce` exited 0 and wrote `.nmg-sdlc/verification/541.json`:

- Identity: head `0b5b47cc2c4b4990a752aeeee8ae8a4a2c46de11`, tree clean, spec hash `sha256:3d0b4d32…`, steering hash `sha256:dc2b05c4…`
- Ceiling: none
- Coverage: declared 2, recorded 2, complete true, no missing/duplicate/unknown results

---

## Acceptance Criteria Verification

| AC | Description | Status | Evidence |
|----|-------------|--------|----------|
| AC1 | A pasted multi-line `/sdlc-draft-issue` runs as the command, not sent to the model | Pass | `hooks/register.ts` `prompt.submit` hook calls `parseInteractiveSlash(e.text)` then `runInteractive` and returns `{ drop }`; tests `a pasted multi-line /sdlc-draft-issue runs the command and never reaches the model` and `a bridge prompt with leading blank lines runs the command the same way` assert render args `--args 'Fix X\nline two\nline three'`, `plans == ['/plan']`, and only the workflow prompt reaches the engine. Live TUI bracketed-paste probe also entered plan mode with the full multi-line `$ARGUMENTS` |
| AC2 | Typed commands, plugin/`isMeta` prompts and non-matching text pass through; model-override clearing kept | Pass | Hook returns `next(e)` for non-person or `isMeta` prompts, when `e.command` is set, and when the parser returns `null`; `modelOverride = null` still runs for every person prompt. Tests `typed, plugin, isMeta and non-matching prompts reach the engine unchanged, with no render` (covers `/sdlc-unknown x`, mid-text mention, `/sdlc-draft-issuex y`) and `a composer prompt that is not a pasted command still ends an active model override` |
| AC3 | Headless pasted interactive command gets the typed `Run /<name> in the TUI.` refusal with no render | Pass | `runInteractive` returns the shared headless refusal; the hook drops with `result.text`. Test `a pasted interactive command in a headless session gets the typed refusal, with no render and no prompt` asserts `{ drop: 'Run /sdlc-draft-issue in the TUI.' }`, no render, no `/plan`, no prompt |

---

## Task Completion

| Task | Description | Status | Notes |
|------|-------------|--------|-------|
| T001 | Run a pasted interactive command through the shared command path | Complete | `runInteractive` extracted; `command.run` delegates; `parseInteractiveSlash` imported from `../src/host-events.mjs`; no Node built-ins imported into `hooks/register.ts` |
| T002 | Add regression tests for pasted commands | Complete | Six new tests in `hooks/register.test.ts` under `pasted interactive commands`, plus an extra `/sdlc-execute` paste case; `claude plugin test .` 54/54 pass; `cd scripts && npm test` passes |

---

## Architecture Assessment

### SOLID Compliance

| Principle | Score (1-5) | Notes |
|-----------|-------------|-------|
| Single Responsibility | 4 | `runInteractive` owns one command's gates and workflow start; the hook only routes. `hooks/register.ts` remains a large (830-line) module, a pre-existing condition not worsened |
| Open/Closed | 5 | New commands added to `INTERACTIVE_COMMANDS` are recognized for paste automatically through the shared parser regex |
| Liskov Substitution | 5 | Typed and pasted paths produce the same `CommandRunResult` values |
| Interface Segregation | 5 | Function takes only `$`, name, and args |
| Dependency Inversion | 4 | Uses the injected engine `$` throughout; module-level mutable state (`interactive`, `modelOverride`, `headlessRun`) is pre-existing |

### Layer Separation

Classification stays in the Node-free `src/host-events.mjs` (`parseInteractiveSlash`, reused unchanged). The hooks module imports no Node built-ins, matching the Hooks Module boundary in technical steering.

### Dependency Flow

`hooks/register.ts` → `src/host-events.mjs` only. Rendering still runs as a child process through `scripts/sdlc-render-prompt.mjs` with an argument array.

---

## Security Assessment

- [x] Authentication: N/A (no auth surface)
- [x] Authorization: Only person-originated (`composer`/`bridge`) non-`isMeta` prompts can trigger the paste path; plugin-origin, `sdk` and `task-notification` prompts cannot. The `/sdlc-execute` model gate and headless refusal still apply because the shared path is used
- [x] Input validation: Anchored regex over registered names only, requiring end of text or whitespace after the name (rejects `/sdlc-draft-issuex`, mid-text mentions, unknown names)
- [x] Injection prevention: Pasted arguments reach the renderer as a single argument-array element (`['--args', args]`), never shell source
- [x] Data protection: N/A

---

## Performance Assessment

- [x] Async patterns: The hook awaits only for matching prompts; non-matching prompts call `next(e)` immediately. `/plan` and the workflow submit stay deferred through `$.clock.after`
- [x] Caching: N/A
- [x] Resource management: Render keeps its existing `RENDER_TIMEOUT_MS` bound
- [x] Query optimization: N/A

---

## Test Coverage

### BDD Scenarios

| Acceptance Criterion | Has Scenario | Has Steps | Passes |
|---------------------|-------------|-----------|--------|
| AC1 | Yes (SCN001) | Yes (`hooks/register.test.ts`) | Yes |
| AC2 | Yes (SCN002) | Yes (`hooks/register.test.ts`) | Yes |
| AC3 | Yes (SCN003) | Yes (`hooks/register.test.ts`) | Yes |

### Coverage Summary

- Feature files: 3 scenarios (`feature.gherkin`, file target `hooks/register.test.ts`)
- Step definitions: Implemented as hooks-module tests
- Unit tests: `claude plugin test .` exit 0, 54 pass / 0 fail (6 new pasted-command tests)
- Contract tests: `cd scripts && npm test -- --runInBand` exit 0, 60 suites passed (1 skipped), 1297 tests passed, 2 skipped
- `git diff --check main...HEAD`: exit 0

---

## Exercise Test Results

| Field | Value |
|-------|-------|
| **Skill Exercised** | `/sdlc-draft-issue` (pasted, interactive TUI) |
| **Test Project** | Disposable clone of `Nunley-Media-Group/nmg-sdlc-smoke` in the session scratchpad (removed after capture) |
| **Exercise Method** | `claude --plugin-dir <this checkout>` in a detached tmux session; multi-line text delivered with `tmux paste-buffer -p` (bracketed paste) |
| **Interactive gate handling** | Interrupted with Esc once plan mode and the rendered workflow appeared; no issue was filed |

### Captured Output Summary

The pasted text `/sdlc-draft-issue Pasted probe for nmg-sdlc #541 (do not file)` plus two further lines produced plan mode (`plan mode on`) and the rendered draft-issue workflow ending with `$ARGUMENTS:` followed by all three pasted lines. Afterward, `gh issue list` showed no new smoke issue.

### AC Evaluation

| AC | Description | Verdict | Evidence |
|----|-------------|---------|----------|
| AC1 | Pasted multi-line command runs as the command | Pass | Plan mode on; workflow rendered with full multi-line arguments |

### Notes

The changed surface is `hooks/register.ts` (no `workflows/` or `agents/` change), so `exercise-claude.mjs` (`claude -p`) does not apply; `claude -p` parses a leading slash command itself. The live probe shows the person-visible outcome but cannot tell whether the engine routed that paste through `command.run` or `prompt.submit`. The deterministic hooks-module tests prove the `prompt.submit` path.

---

## Steering Doc Verification Gates

| Gate | Status | Evidence |
|------|--------|----------|
| `repository.tests` (builtin.command, required) | Pass | `npm test -- --runInBand` in `scripts/` exited 0 at head `0b5b47cc` |
| `repository.nmg-sdlc-smoke` (project provider, required) | Pass | `nmg-sdlc-smoke delivered #296`: closing-PR baseline recorded, `/sdlc-execute #296` run headless (session `96b1c9ed-cc51-4398-aaf6-aafac0136971`), issue #296 CLOSED, PR #298 MERGED at `dc857a44fd011187e51abbe05d97451a6905aa4e` |
| Claude Code hooks tests | Pass | `claude plugin test .` exit 0, 54/54 |
| Git hygiene | Pass | `git diff --check main...HEAD` exit 0 |
| Skill inventory / plugin surface / skill-creator | Not applicable | No workflow, reference, agent or command file changed |

**Gate Summary**: 2/2 registered gates passed, 0 failed, 0 incomplete

### Smoke Provisioning

`NMG_SDLC_SMOKE_ISSUES` was unset and the recorded issue #293 was CLOSED, so a fresh issue was provisioned per `steering/snippets/project-smoke.md`. A tmux-hosted `claude --plugin-dir <this checkout>` session ran the real `/sdlc-draft-issue <provision.need>`, which created #296 "Add greeting_shake_128 library helper" (Enhancement, v3). It then ran `/sdlc-write-spec #296`, which merged spec PR #297, applied `spec-created`, and ended on `Finished`. The tmux session and clone were removed and `.nmg-sdlc/smoke/provisioned.json` records issue 296. One draft attempt was made.

---

## Fixes Applied

| Severity | Category | Location | Original Issue | Fix Applied | Routing |
|----------|----------|----------|----------------|-------------|---------|
| — | — | — | None required | — | — |

## Remaining Issues

### Critical Issues
None.

### High Priority
None.

### Medium Priority
None.

### Low Priority

| Field | Value |
|-------|-------|
| **Severity** | Low |
| **Category** | Error Handling |
| **Location** | `hooks/register.ts` `prompt.submit` hook |
| **Issue** | A drop carries only text, so a pasted headless refusal does not surface the typed command's `exitCode: 2` |
| **Impact** | None for the specified behavior: AC3 requires the same refusal text with nothing rendered, and a headless `claude -p` prompt that starts with a slash is parsed by the engine and takes the typed `command.run` path with its exit code |
| **Reason Not Fixed** | Within approved scope; the design selects `{ drop: result.text }` |

| Field | Value |
|-------|-------|
| **Severity** | Low |
| **Category** | Architecture |
| **Location** | `hooks/register.ts` (830 lines) |
| **Issue** | The module exceeds the 500-line "god file" heuristic |
| **Impact** | Pre-existing; this change shortens the hook body by moving it into one named function |
| **Reason Not Fixed** | Out of scope for this defect |

---

## Positive Observations

- One shared gate path (`runInteractive`) removes the risk of typed and pasted commands drifting apart.
- Reuses the existing Node-free `parseInteractiveSlash`, so recognition matches the exercise runner and its tests.
- Tests assert the negative cases precisely: unknown name, mid-text mention, name prefix, typed, plugin-origin and `isMeta`.

---

## Recommendations Summary

### Before PR (Must)
- [x] None outstanding

### Short Term (Should)
- None

### Long Term (Could)
- [ ] Consider splitting `hooks/register.ts` by concern (interactive commands, execute supervision, write-spec continuation) if it keeps growing

---

## Files Reviewed

| File | Issues | Notes |
|------|--------|-------|
| `hooks/register.ts` | 2 (Low) | `runInteractive` extraction and `prompt.submit` paste branch |
| `hooks/register.test.ts` | 0 | Six new pasted-command tests |
| `src/host-events.mjs` | 0 | `parseInteractiveSlash` reused unchanged |
| `CHANGELOG.md`, `VERSION`, `package.json`, `.claude-plugin/plugin.json` | 0 | 4.10.1 synchronized; changelog bullet ends with `(#541)` |

---

## Recommendation

**Ready for PR**

All three acceptance criteria, four functional requirements, both tasks and all three scenarios are satisfied with deterministic test evidence plus a live TUI paste probe. Both registered steering gates, including the live smoke delivery, passed at the verification head.
