# Live GitHub Smoke Evidence: Issue #213

**Date**: 2026-08-24
**Repository**: `Nunley-Media-Group/nmg-sdlc-smoke-20260820001416`
**Repository URL**: https://github.com/Nunley-Media-Group/nmg-sdlc-smoke-20260820001416
**Visibility / access**: private; authenticated viewer had `ADMIN`
**Disposable clone**: `/tmp/nmg-sdlc-smoke-213.aIcW5B/repo`
**Intended extension under test**: `/Volumes/Fast Brick/source/repos/nmg-sdlc`; the failed manual TUI commands loaded the plugin resources with `--plugin-dir`/`--add-dir` but omitted the required explicit `--extension .../src/extension.ts` while also passing `--no-extensions`

## Required lifecycle gate

Required: two distinct live issues, each covering `/sdlc-draft-issue` → `/sdlc-write-spec`, followed by one `/sdlc-execute` invocation that processes both issues through merged PRs and closed issues.

Result: **Fail — no lifecycle completed.** The first `/sdlc-draft-issue` could not reach the native plan approval boundary. Because draft created no issue, there were no valid issue numbers for `/sdlc-write-spec` or the required two-issue `/sdlc-execute` run. Verification stopped the mutation chain rather than fabricating downstream evidence.

## Attempt 1: initial TUI input without the extension factory

Process: `smoke-draft-a`

Invocation:

```text
omp --no-extensions --no-skills \
  --plugin-dir /Volumes/Fast Brick/source/repos/nmg-sdlc \
  --add-dir /Volumes/Fast Brick/source/repos/nmg-sdlc \
  --auto-approve --max-time 1800 \
  "/sdlc-draft-issue Add a repository smoke marker file SMOKE_LIFECYCLE_A.md ..."
```

Observed:

- The command used `--no-extensions` and did not add `--extension /Volumes/Fast Brick/source/repos/nmg-sdlc/src/extension.ts`; therefore the branch extension factory and its `input` rewrite were not loaded.
- The raw `/sdlc-draft-issue ...` text was persisted as the first user message with no preceding `mode_change` entry. The model then located workflow resources through `--plugin-dir`/`--add-dir`, which made the run look superficially like an extension exercise.
- The workflow completed classification and milestone asks and produced a validated local issue-plan payload, but `xd://propose` correctly rejected it because native plan mode had never been entered.
- The workflow explicitly reported that no GitHub issue was created, and the TUI process was stopped after the fail-closed result.

## Attempt 2: slash command typed into a TUI without the extension factory

Process: `smoke-draft-a2`

Observed:

- A blank live OMP TUI was launched with plugin resources but without the branch extension factory.
- `/sdlc-draft-issue ...` was typed through PTY input. The saved session proves it remained the literal first user message and contains no `mode_change` entry.
- Built-in `ask` completed the enhancement, `v3`, and exact `lifecycle-a-213\n` decisions only because the model manually followed the discoverable workflow resources.
- The generated local plan failed at `xd://propose` because native plan mode was not active. No GitHub issue was created.

## Attempt 3: explicit native `/plan` with plugin resources but no extension factory

Process: `smoke-draft-a3`

Observed:

- A fresh TUI entered native plan mode with `/plan`.
- `/sdlc-draft-issue ...` was then typed without the extension factory that rewrites the command to its registry-rendered workflow body.
- The raw slash text did not exercise `rewriteInteractiveInput`; the stalled model turn is not evidence of a product native-plan defect.
- The process was stopped; no GitHub mutation had occurred.

## Root-cause diagnosis and corrected reproduction

The failed verification was a harness false negative, not a defect in the #213 registry or native-plan integration:

1. Every failed manual TUI command combined `--no-extensions` with `--plugin-dir` and omitted the explicit `--extension <repo>/src/extension.ts` required by `workflows/verify-code/references/exercise-testing.md`.
2. The attempt-2 session transcript begins with the literal `/sdlc-draft-issue ...` user message and has no `mode_change`, proving `src/extension.ts` did not run.
3. A corrected ordered diagnostic loaded `src/extension.ts` explicitly. A pre-transform input trace saw `/sdlc-draft-issue ...`; a post-transform trace saw `/plan\n\n# Draft Issue...`; the persisted session then recorded `{\"type\":\"mode_change\",\"mode\":\"plan\"}` followed by the `plan-mode-context` message.
4. The repository harness already uses the correct flags. `scripts/exercise-omp.mjs` passes both `--no-extensions` and explicit `--extension <repo>/src/extension.ts`. The remediation centralizes that argv construction in an exported function and adds a regression assertion so future verification code cannot silently test plugin resources without the extension factory.

The required two-issue live lifecycle remains incomplete, so the failed verify handoff remains failed. The corrected reproduction only establishes that the recorded native-plan diagnosis was wrong; it does not substitute for the authoritative convergence gate.

## Supplemental command exercises

These diagnostics do not satisfy the required lifecycle gate:

- Full repository Jest suite after remediation: exit 0; 43 suites passed, 1 skipped; 513 tests passed, 2 skipped.
- Plugin-surface validator: exit 0; `Plugin surface validation passed: repository`.
- `git diff --check main...HEAD`: exit 0 with no output.
- `exercise-omp ... -- /sdlc-status`: exit 0 with no captured output.
- `exercise-omp ... -- /sdlc-write-spec`: exit 1 after the 300-second bound with `timeout waiting for agent_end` and `Run /sdlc-write-spec in the TUI.`; diagnostic only, not live mutation evidence.

## GitHub identifiers and state

No smoke resources were created by this verification run.

Pre-existing issue identifiers observed before and after the attempt: `#1`, `#3`, `#9` (all closed).

Pre-existing pull-request identifiers observed before and after the attempt: `#2`, `#4`, `#5`, `#6`, `#7`, `#8`, `#10` (all merged).

New issue identifiers: **none**.

New pull-request identifiers: **none**.

Required two issue identifiers: **not produced**.

Required two delivery PR identifiers: **not produced**.

## Cleanup state

- Remote cleanup: no resources required deletion or closure because no issue, branch, or PR was created.
- Local Git state before cleanup: `main...origin/main` with no tracked or untracked changes.
- TUI processes `smoke-draft-a`, `smoke-draft-a2`, and `smoke-draft-a3` were stopped.
- Disposable clone `/tmp/nmg-sdlc-smoke-213.aIcW5B` was removed after all harness processes exited; a path check returned `Path not found`.
