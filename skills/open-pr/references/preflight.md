# Open-PR Preflight Gate

**Consumed by**: `open-pr` Step 1.

Before reading or modifying `VERSION`, `CHANGELOG.md`, or any stack-specific version file, Step 1 must run both checks below in order. Either failure aborts the skill immediately — no version artifacts are touched.

---

## Step 1a: Dirty-Tree Check

Read `../../../references/dirty-tree.md` when Step 1a runs — the reference covers the filter algorithm (remove lines whose path ends with `.claude/sdlc-state.json` or `.claude/unattended-mode` from `git status --porcelain` output, then evaluate the remainder for cleanliness) and the generic abort-message shapes. The inputs to the filter and the expected outcomes are:

- **Command**: `git status --porcelain`
- **Filter out**: lines whose path ends with `.claude/sdlc-state.json` or `.claude/unattended-mode`
- **Filtered output empty**: clean — proceed to Step 1b.
- **Filtered output non-empty**: dirty tree — abort with the messaging in the "Abort messaging" section below.

## Step 1b: Empty-Branch Check

Run the commit-subject-only log (so the filter anchors against the subject, not the leading short-SHA that `--oneline` emits):

```bash
git log main..HEAD --format=%s
```

Count subjects that do NOT match the case-insensitive regex `^chore: bump version` — e.g., pipe through `grep -ivE '^chore: bump version'` and count lines.

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

Emit the escalation sentinel and stop — do NOT call `AskUserQuestion`. `/open-pr` uses the single-line `ESCALATION:` sentinel shape rather than the multi-line shape shown in `../../../references/dirty-tree.md`; the SDLC runner matches escalations on the `ESCALATION:` prefix, so the single-line shape is what the runner consumes:

```
ESCALATION: open-pr — Working tree is not clean. Dirty files: [filtered git status --porcelain output, space-separated or newline-separated].
```

### Empty-branch failure

#### Interactive mode

Print the exact abort string from Step 1b above and stop.

#### Unattended mode (`.claude/unattended-mode` exists)

Emit the escalation sentinel and stop — do NOT call `AskUserQuestion`:

```
ESCALATION: open-pr — No implementation commits found on this branch — run /write-code before opening a PR.
```

---

In both failure cases: do NOT read or write `VERSION`, `CHANGELOG.md`, or any stack-specific version file, do NOT invoke `git add`, `git commit`, `git push`, or `gh pr create`.
