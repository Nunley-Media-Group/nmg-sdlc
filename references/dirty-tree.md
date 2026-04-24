# Working-Tree Cleanliness Precondition

**Consumed by**: `start-issue` Step 4, `open-pr` Step 1.

Before any operation that must not carry uncommitted work into a new state (branch creation, PR push, etc.), the working tree must be clean. A dirty tree risks carrying half-finished work into a state where it does not belong — and the SDLC runner cannot auto-recover from that state. The gate below aborts early so the skill does not produce a record that future work would then have to untangle.

## Check

Run:

```bash
git status --porcelain
```

Filter SDLC-runner artifacts from the output before evaluating cleanliness. Remove any lines whose file path ends with `.codex/sdlc-state.json` or `.codex/unattended-mode` — these are runtime artifacts managed by the SDLC runner (they flicker in and out of the working tree during an unattended run) and are not real user-authored dirt.

- **Filtered output empty** (clean tree): proceed with the workflow.
- **Filtered output non-empty** (dirty tree): abort immediately. Do NOT proceed with the operation, do NOT modify any repository state.

## Abort messaging

The consuming skill supplies its own context-specific wording. The shapes below define the structure; replace the bracketed placeholders with skill-appropriate text.

### Interactive mode

Print and stop:

```
ERROR: Working tree is not clean. Cannot proceed with the workflow.

Dirty files:
[paste the filtered git status --porcelain output here]

Please resolve these changes (commit, stash, or discard) before running [skill invocation] again.
```

### Unattended mode (`.codex/unattended-mode` exists)

Frame as an escalation reason for the runner and stop:

```
[Skill-specific diagnostic]. Working tree is not clean.

Dirty files:
[paste the filtered git status --porcelain output here]

Resolve these changes before retrying. Done. Awaiting orchestrator.
```

Exit without proceeding to the next step or any subsequent steps — the runner surfaces the escalation to the human operator, who must clear the working tree before retrying.
