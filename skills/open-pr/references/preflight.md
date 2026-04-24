# Open-PR Preflight Gate

**Consumed by**: `open-pr` Step 1.

Before reading the issue, spec files, or `VERSION` / `CHANGELOG.md`, Step 1 must run the three checks below in order. Any failure aborts the skill immediately — no PR is created. `$nmg-sdlc:open-pr` no longer owns version-artifact writes (that moved to `$nmg-sdlc:commit-push`), so "no version artifacts are touched" is automatic; the checks below still exist because they guard PR creation against avoidable corruption of the pipeline handoff.

---

## Step 1a: Dirty-Tree Check

Read `../../../references/dirty-tree.md` when Step 1a runs — the reference covers the filter algorithm (remove lines whose path ends with `.codex/sdlc-state.json` or `.codex/unattended-mode` from `git status --porcelain` output, then evaluate the remainder for cleanliness) and the generic abort-message shapes. The inputs to the filter and the expected outcomes are:

- **Command**: `git status --porcelain`
- **Filter out**: lines whose path ends with `.codex/sdlc-state.json` or `.codex/unattended-mode`
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
No implementation commits found on this branch — run $nmg-sdlc:write-code before opening a PR.
```

## Step 1c: Ancestry Check

Verify `$nmg-sdlc:commit-push` has already reconciled local with `origin/main` before PR creation:

```bash
git fetch origin main
git merge-base --is-ancestor origin/main HEAD
```

- **Exit 0**: local contains every commit in `origin/main` — proceed to Step 1's existing reads (issue, spec files, git diff).
- **Non-zero**: local is behind `origin/main` — abort. `$nmg-sdlc:commit-push` owns the rebase; `$nmg-sdlc:open-pr` must not rewrite history.

### Divergence abort

Print the exact sentinel line on stdout and exit non-zero (both interactive and unattended — the SDLC runner reads the sentinel via `bounceContext`):

```
DIVERGED: re-run commit-push to reconcile before creating PR
```

Do NOT rebase, do NOT amend, do NOT `git push`, and do NOT pass `--force` or `--force-with-lease` to any push. The sentinel is parsed by the runner to bounce control back to `$nmg-sdlc:commit-push` (step 7 in the pipeline), which owns the rebase-and-push envelope.

---

## Abort messaging

### Dirty-tree failure

#### Interactive mode

Print and stop:

```
ERROR: Working tree is not clean. Cannot open a PR.

Dirty files:
[paste the filtered git status --porcelain output here]

Please resolve these changes (commit, stash, or discard) before running $nmg-sdlc:open-pr again.
```

#### Unattended mode (`.codex/unattended-mode` exists)

Emit the escalation sentinel and stop — do NOT present a Codex interactive gate. `$nmg-sdlc:open-pr` uses the single-line `ESCALATION:` sentinel shape rather than the multi-line shape shown in `../../../references/dirty-tree.md`; the SDLC runner matches escalations on the `ESCALATION:` prefix, so the single-line shape is what the runner consumes:

```
ESCALATION: open-pr — Working tree is not clean. Dirty files: [filtered git status --porcelain output, space-separated or newline-separated].
```

### Empty-branch failure

#### Interactive mode

Print the exact abort string from Step 1b above and stop.

#### Unattended mode (`.codex/unattended-mode` exists)

Emit the escalation sentinel and stop — do NOT present a Codex interactive gate:

```
ESCALATION: open-pr — No implementation commits found on this branch — run $nmg-sdlc:write-code before opening a PR.
```

---

In all failure cases: do NOT invoke `git add`, `git commit`, `git push`, or `gh pr create`. `$nmg-sdlc:open-pr` never writes to `VERSION`, `CHANGELOG.md`, or any stack-specific version file — those writes belong to `$nmg-sdlc:commit-push`.
