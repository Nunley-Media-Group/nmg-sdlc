# Exercise Testing for Plugin Changes (v4)

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

**Step 5c-i: Run via the Claude Code harness**

Load this repository as the plugin with `claude -p --plugin-dir <repo> --add-dir <repo>`. Claude Code has no `--cwd` flag: run from the disposable project directory.

`claude -p "/sdlc-NAME"` works for **automated** commands (`/sdlc-status`, `/sdlc-execute`, `/sdlc-verify-code`, `/sdlc-open-pr`) because those are plugin command files under `commands/*.md`, which Claude Code expands under `-p` as the initial prompt. Requires `--plugin-dir <nmg-sdlc-root>` (or an installed plugin). Do not register those names in the hooks module; the command files own them.

Interactive `/sdlc-*` commands are TUI-only. Without a UI (`claude -p`, the SDK) the nmg-sdlc hooks module answers `Run /sdlc-<command> in the TUI.` and exits 2.

From the disposable project directory:

```bash
# Automated (-p expands commands/*.md)
claude -p --plugin-dir /path/to/this/nmg-sdlc \
  --add-dir /path/to/this/nmg-sdlc \
  "/sdlc-CHANGED_SKILL_NAME [args]"

# Or the stream-json harness (claude -p --plugin-dir <repo> --input-format stream-json --output-format stream-json --verbose)
node <plugin-root>/scripts/exercise-claude.mjs \
  --cwd . \
  -- /sdlc-CHANGED_SKILL_NAME [args]
```

For dry-run GitHub skills: put the skill invocation first after `--`, then the dry-run instructions as additional prompt text only if the command is not a registered slash command. Otherwise include them after `$ARGUMENTS` in the command text (automated command files receive the remaining text as `$ARGUMENTS`). Capture stdout+stderr to exercise-output.txt.

Interactive `/sdlc-*` commands enter native plan mode only in the TUI, where the hooks module runs `/plan` and submits the workflow. Under `claude -p` they fail closed (`Run /sdlc-<command> in the TUI.`, exit 2; the harness reports reason `interactive_only`). Record that limitation when exercising draft-issue / write-spec / onboard / upgrade / steering / run-retro. A TUI exercise can run hands-off in a Herdr pane started with `NMG_SDLC_AUTOPILOT=1`, where the hooks module approves every `ExitPlanMode` and answers every `AskUserQuestion` with its `(Recommended)` option.

If the Claude Code harness is unavailable, record "claude harness not available for exercise" and degrade gracefully (still evaluate any local artifacts produced).

**Cancellation and error rules**: wait without a wall-clock deadline while the child remains alive. On explicit cancellation or confirmed process loss, capture partial output and classify that terminal state. Capture non-zero output for later evaluation as a finding.

## 5d: Evaluate Exercise Output

Same as before: load ACs from requirements, search output + test fs for evidence of each AC, assign Pass/Fail/Partial, record supporting lines/paths.

Exercise findings feed into report and fix loop.

## 5e: Cleanup

Always rm -rf the temp project dir.

## Notes for Claude Code/Herdr

The exercise exercises the published /sdlc- surface with the exact same skill text that Herdr workers will receive. Keep the dry-run and state-based termination contract identical.
