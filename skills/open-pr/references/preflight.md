# Open-PR Preflight Gate

**Consumed by**: `open-pr` Step 1.

Before reading or modifying `VERSION`, `CHANGELOG.md`, or any stack-specific version file, Step 1 must run both checks below in order. Either failure aborts the skill immediately — no version artifacts are touched.

---

## Step 1a: Dirty-Tree Check

Read `../../../references/dirty-tree.md` for the filter algorithm (filter `.claude/sdlc-state.json` and `.claude/unattended-mode` from `git status --porcelain` output, then evaluate the remainder for cleanliness). The inputs to the filter and the expected outcomes are:

- **Command**: `git status --porcelain`
- **Filter out**: lines whose path ends with `.claude/sdlc-state.json` or `.claude/unattended-mode`
- **Filtered output empty**: clean — proceed to Step 1b.
- **Filtered output non-empty**: dirty tree — abort with the messaging in the "Abort messaging" section below.

## Step 1b: Empty-Branch Check

Run:

```bash
git log main..HEAD --oneline
```

Filter out any commit whose subject line matches the pattern `^chore: bump version` (case-insensitive). Count the remaining commits.

- **At least one non-bump commit**: implementation work is present — preflight passes, proceed to the existing Step 1 reads (issue, spec files, git diff).
- **Zero non-bump commits** (empty output or only bump commits): no implementation work — abort with the messaging in the "Abort messaging" section below.

The exact abort string for this condition is:

```
No implementation commits found on this branch — run /write-code before opening a PR.
```

---

## Abort messaging

### Dirty-tree failure

#### Interactive mode

Print and stop:

```
ERROR: Working tree is not clean. Cannot open a PR.

Dirty files:
[paste the filtered git status --porcelain output here]

Please resolve these changes (commit, stash, or discard) before running /open-pr again.
```

#### Unattended mode (`.claude/unattended-mode` exists)

Emit the escalation sentinel and stop — do NOT call `AskUserQuestion`:

```
ESCALATION: open-pr — Working tree is not clean. Dirty files: [filtered git status --porcelain output, space-separated or newline-separated].
```

### Empty-branch failure

#### Interactive mode

Print and stop:

```
No implementation commits found on this branch — run /write-code before opening a PR.
```

#### Unattended mode (`.claude/unattended-mode` exists)

Emit the escalation sentinel and stop — do NOT call `AskUserQuestion`:

```
ESCALATION: open-pr — No implementation commits found on this branch — run /write-code before opening a PR.
```

---

In both failure cases: do NOT read or write `VERSION`, `CHANGELOG.md`, or any stack-specific version file, do NOT invoke `git add`, `git commit`, `git push`, or `gh pr create`.
