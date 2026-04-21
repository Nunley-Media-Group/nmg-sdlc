# Working-Tree Cleanliness Precondition

**Consumed by**: `start-issue` Step 4 (before branch creation).

Before any branch operation, the working tree must be clean. `gh issue develop` checks out a new branch atop whatever is in the index, so a dirty tree risks carrying half-finished work into a freshly-linked feature branch where it does not belong — and the SDLC runner cannot auto-recover from that state. The gate below aborts early so the skill does not produce a branch-and-commit record that future work would then have to untangle.

## Check

Run:

```bash
git status --porcelain
```

Filter SDLC-runner artifacts from the output before evaluating cleanliness. Remove any lines whose file path ends with `.claude/sdlc-state.json` or `.claude/unattended-mode` — these are runtime artifacts managed by the SDLC runner (they flicker in and out of the working tree during an unattended run) and are not real user-authored dirt.

- **Filtered output empty** (clean tree): proceed to branch creation.
- **Filtered output non-empty** (dirty tree): abort immediately. Do NOT call `gh issue develop`, do NOT update issue status, do NOT modify anything.

## Abort messaging

### Interactive mode

Print and stop:

```
ERROR: Working tree is not clean. Cannot create feature branch.

Dirty files:
[paste the filtered git status --porcelain output here]

Please resolve these changes (commit, stash, or discard) before running /start-issue again.
```

### Unattended mode (`.claude/unattended-mode` exists)

Frame as an escalation reason for the runner and stop:

```
Working tree is not clean. Cannot create feature branch.

Dirty files:
[paste the filtered git status --porcelain output here]

Resolve these changes before retrying. Done. Awaiting orchestrator.
```

Exit without proceeding to branch creation or any subsequent steps — the runner surfaces the escalation to the human operator, who must clear the working tree before retrying.
