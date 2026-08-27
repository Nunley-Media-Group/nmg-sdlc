# Exercise Testing for Plugin Changes (v3)

Detailed procedures for exercise verification when plugin changes (WORKFLOW.md or agent files) detected. These steps only apply when such changes are in the diff.

## 5b: Scaffold Disposable Test Project

Create a minimal test project for exercising the changed skill:

1. Create temp directory:
   Use node or bash to mkdir in /tmp nmg-sdlc-exercise-...

2. Write minimal steering + sample code + package.json etc so the skill under test has context.

3. git init and initial commit.

## 5c: Exercise Changed Skill

Determine the first changed skill from the diff.

For GitHub-integrated skills, append the dry-run instructions (unchanged):
> IMPORTANT: This is a dry-run exercise. Do NOT execute any `gh` commands that create, modify, or delete GitHub resources. Instead, output the exact command and arguments you WOULD run...

**Step 5c-i: Run via omp harness (replaces codex exec)**

Load this repository as an extension (`--extension src/extension.ts --plugin-dir <repo> --add-dir <repo>`). Do not pass `--load` — that flag does not exist.

`omp --print /sdlc-NAME` works for **automated** commands (`/sdlc-status`, `/sdlc-execute`, `/sdlc-verify-code`, `/sdlc-open-pr`) because those are file commands under `commands/*.md`. Print expands them as the initial prompt. Requires `--plugin-dir <nmg-sdlc-root>` (or an installed plugin). Do not `registerCommand` those names — an extension handler wins and print drops `sendUserMessage`.

Interactive `/sdlc-*` are TUI-only. Print/RPC `registerCommand` fails closed.

From the disposable project directory:

```bash
# Automated (print expands commands/*.md)
omp --print --no-session --no-extensions --no-skills \
  --plugin-dir /path/to/this/nmg-sdlc \
  --add-dir /path/to/this/nmg-sdlc \
  "/sdlc-CHANGED_SKILL_NAME [args]"

# Or the RPC harness (also expands file commands when --plugin-dir is set)
node <plugin-root>/scripts/exercise-omp.mjs \
  --cwd . \
  -- /sdlc-CHANGED_SKILL_NAME [args]
```

For dry-run GitHub skills: put the skill invocation first after `--`, then the dry-run instructions as additional prompt text only if the command is not a registered slash command. Prefer appending dry-run constraints in a follow-up RPC prompt, or include them after `$ARGUMENTS` in the workflow. Capture stdout+stderr to exercise-output.txt.

Interactive `/sdlc-*` commands enter native `/plan` only in the TUI (input rewrite). Print/RPC `registerCommand` for those names fails closed (`Run /sdlc-<command> in the TUI.`). Record that limitation when exercising draft-issue / write-spec / onboard / upgrade / run-retro.

If the omp harness is unavailable, record "omp harness not available for exercise" and degrade gracefully (still evaluate any local artifacts produced).

**Cancellation and error rules**: wait without a wall-clock deadline while the child remains alive. On explicit cancellation or confirmed process loss, capture partial output and classify that terminal state. Capture non-zero output for later evaluation as a finding.

## 5d: Evaluate Exercise Output

Same as before: load ACs from requirements, search output + test fs for evidence of each AC, assign Pass/Fail/Partial, record supporting lines/paths.

Exercise findings feed into report and fix loop.

## 5e: Cleanup

Always rm -rf the temp project dir.

## Notes for OMP/Herdr

The exercise exercises the published /sdlc- surface with the exact same skill text that Herdr workers will receive. Keep the dry-run and state-based termination contract identical.
