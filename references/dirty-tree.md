# Working-Tree Cleanliness Precondition

**Consumed by**: `start-issue` Step 4, `open-pr` Step 1.

Before any operation that must not carry uncommitted work into a new state (branch creation, PR push, etc.), the working tree must be clean. A dirty tree risks carrying half-finished work into a state where it does not belong. The gate below aborts early so the skill does not produce a record that future work would then have to untangle.

## Check

Run:

```bash
git status --porcelain
```

- **Output empty** (clean tree): proceed with the workflow.
- **Output non-empty** (dirty tree): abort immediately. Do NOT proceed with the operation and do NOT modify repository state.

## Abort messaging

The consuming skill supplies its own context-specific wording. The shapes below define the structure; replace the bracketed placeholders with skill-appropriate text.

Print and stop:

```
ERROR: Working tree is not clean. Cannot proceed with the workflow.

Dirty files:
[paste the git status --porcelain output here]

Please resolve these changes (commit, stash, or discard) before running [skill invocation] again.
```

Exit without proceeding to the next step or any subsequent step.
