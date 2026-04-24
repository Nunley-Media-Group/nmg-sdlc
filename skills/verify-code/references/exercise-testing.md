# Exercise Testing for Plugin Changes

Detailed procedures for Steps 5b–5e of the verification workflow. These steps only apply when plugin changes (SKILL.md or agent files) are detected in the diff.

---

## 5b: Scaffold Disposable Test Project

Create a minimal test project for exercising the changed skill:

1. **Create temp directory** using `Bash`:
   ```bash
   node -e "const p = require('path').join(require('os').tmpdir(), 'nmg-sdlc-test-' + Date.now()); require('fs').mkdirSync(p, {recursive:true}); console.log(p)"
   ```
   Record the output path — this is `{test-project-path}`.

2. **Write scaffold files** using the Codex editing tool:

   - `{test-project-path}/steering/product.md` — `"Test Project. One persona: Developer."`
   - `{test-project-path}/steering/tech.md` — `"Stack: Node.js. Test: manual verification."`
   - `{test-project-path}/steering/structure.md` — `"Flat layout: src/ + tests/"`
   - `{test-project-path}/src/index.js` — `console.log("hello")`
   - `{test-project-path}/README.md` — `"Test project for nmg-sdlc exercise verification"`
   - `{test-project-path}/.gitignore` — `node_modules/`
   - `{test-project-path}/package.json` — `{ "name": "test-project", "version": "1.0.0" }`

3. **Initialize git** using `Bash`:
   ```bash
   git init {test-project-path} && git -C {test-project-path} add -A && git -C {test-project-path} commit -m "initial"
   ```

## 5c: Exercise Changed Skill

Determine which skill(s) changed from the diff in 5a. Exercise the **first changed skill** (one skill per exercise run).

Identify whether the changed skill is **GitHub-integrated** (i.e., it creates GitHub resources — `draft-issue`, `open-pr`, `start-issue`). If so, append the dry-run instructions after the skill invocation in the exercise prompt.

**Dry-run instructions** (for GitHub-integrated skills only — append AFTER the skill invocation):
> IMPORTANT: This is a dry-run exercise. Do NOT execute any `gh` commands that create, modify, or delete GitHub resources. Instead, output the exact command and arguments you WOULD run, along with the content (title, body, labels) you WOULD use. Proceed through the full workflow, generating all artifacts as text output.

**Step 5c-i: Run `codex exec`**

Check if the `codex` CLI is available using `Bash`:
```bash
which codex
```

If unavailable, skip exercise testing and record `codex CLI not found`.

The `{exercise-prompt}` is:
- **Non-GitHub-integrated skills**: `"/{skill-name} [appropriate args based on the skill's documented argument shape]"`
- **GitHub-integrated skills (dry-run)**: `"/{skill-name} [args]\n\nIMPORTANT: {dry-run-instructions}"` — skill invocation first, dry-run instructions appended after
The `{output-file}` is `{test-project-path}/exercise-output.txt`.

Run with a shell command and a 5-minute timeout:
```bash
codex exec \
  --cd {test-project-path} \
  --full-auto \
  "{exercise-prompt}" > {output-file} 2>&1
```

This exercises the non-interactive path. Record this limitation for the report when the changed skill normally asks for user input.

**Timeout**: Use a 5-minute command timeout. If a timeout occurs, capture whatever output was produced before the timeout and report it as a graceful degradation in the Exercise Test Results section.

**Exercise errors**: If the exercise subprocess exits with a non-zero status, capture the error output. Report it as a finding and continue with evaluation of whatever output was captured.

## 5d: Evaluate Exercise Output

Read the captured output file (`{output-file}`) and the test project filesystem:

1. **Load acceptance criteria** from `requirements.md`
2. **For each AC**, search the captured output and test project filesystem for evidence:
   - **File-creating skills**: Check if expected files were created in the test project (use file discovery)
   - **GitHub-integrated skills** (dry-run): Check if the generated `gh` commands and content match what the AC expects
   - **General**: Look for output messages that indicate the AC's expected behavior occurred
3. **Assign verdict** for each AC:
   - **Pass** — clear evidence the criterion was satisfied
   - **Fail** — contradictory evidence or expected output missing
   - **Partial** — some evidence but incomplete
4. **Record evidence** — the specific output line, file path, or observation supporting the verdict

Exercise findings (any Fail or Partial verdicts) are treated as findings for Step 6 (Fix Findings), just like any other verification finding.

## 5e: Cleanup

Delete the test project directory using `Bash`, regardless of whether the exercise succeeded or failed:

```bash
rm -rf {test-project-path}
```

This must run even if earlier sub-steps encountered errors. After cleanup, proceed to Step 6.
