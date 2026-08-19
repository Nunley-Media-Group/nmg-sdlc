# Exercise Testing for Plugin Changes (v3)

Detailed procedures for exercise verification when plugin changes (SKILL.md or agent files) detected. These steps only apply when such changes are in the diff.

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

From the disposable project directory, use:
```bash
omp --print --no-session \
  --load /path/to/this/nmg-sdlc/repo  \
  -- " /skill:CHANGED_SKILL_NAME [args] "
```
(Adjust --load / extension load mechanism for the OMP session to bring in the skills/ from the nmg-sdlc source under test.)

For dry-run GitHub skills: the prompt to the harness is the skill invocation first, followed by the dry-run instructions block.

Use a 5-minute (300s) timeout on the omp invocation. Capture stdout+stderr to exercise-output.txt .

If the omp harness or equivalent is unavailable in the env, record "omp harness not available for exercise" and degrade gracefully (still evaluate any local artifacts produced).

**Timeout and error rules preserved**: 5 min bound. On timeout capture partial output. Non-zero capture error output for later evaluation as finding.

## 5d: Evaluate Exercise Output

Same as before: load ACs from requirements, search output + test fs for evidence of each AC, assign Pass/Fail/Partial, record supporting lines/paths.

Exercise findings feed into report and fix loop.

## 5e: Cleanup

Always rm -rf the temp project dir.

## Notes for OMP/Herdr

The exercise exercises the published /skill: surface with the exact same skill text that Herdr workers will receive. Keep dry-run and timeout contract identical to prior.
