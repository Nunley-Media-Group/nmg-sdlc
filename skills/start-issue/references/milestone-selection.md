# Milestone Selection and Issue Fetching

**Consumed by**: `start-issue` Step 1 (when no issue number was supplied as an argument).

Step 1 of `$nmg-sdlc:start-issue` produces the candidate issue set that Step 1a then orders and filters. Milestone selection is deterministic — the same repo state always yields the same candidates — and it adapts to interactive vs. unattended mode through explicit branches rather than hidden defaults so the runner can predict the skill's behaviour exactly.

## Fetch viable milestones

Fetch milestones that have at least one open issue, sorted alphabetically:

```bash
gh api repos/{owner}/{repo}/milestones --jq '[.[] | select(.open_issues > 0) | {title: .title, open_issues: .open_issues}] | sort_by(.title)'
```

If this call fails (network error, auth failure, no milestones endpoint), treat the result as zero viable milestones and fall back to all open issues. The failure is recoverable — milestones are an organisational aid, not a prerequisite.

## Select milestone and fetch issues

Apply deterministic selection based on the number of viable milestones returned above.

### Zero viable milestones

Fall back to all open issues:

```bash
# Interactive mode:
gh issue list -s open -L 10 --json number,title,labels
# Unattended mode:
gh issue list -s open --label automatable -L 10 --json number,title,labels
```

### One viable milestone

Auto-select it and fetch its issues:

```bash
# Interactive mode:
gh issue list -s open -m "<milestone>" -L 10 --json number,title,labels
# Unattended mode:
gh issue list -s open -m "<milestone>" --label automatable -L 10 --json number,title,labels
```

### Multiple viable milestones

- **Interactive mode**: present the filtered milestone list via `request_user_input` gate (option label: milestone title; description: "N open issues"), then fetch issues from the selected milestone. A free-form `Other` answer is treated as an explicit milestone title to verify before fetching issues.
- **Unattended mode**: select the first milestone alphabetically and fetch its issues with `--label automatable`. Do not call `request_user_input`, do not ask for a milestone choice, and do not emit text asking the user to reply.

## Unattended-mode empty-result handling

After fetching issues in unattended mode, if the result is an empty array (`[]`), run a diagnostic before giving up — the point is to distinguish "no work exists" from "work exists but nobody tagged it automatable" because the remediation differs.

1. **Diagnostic query** — count total open issues in the same scope, **without** the `--label automatable` filter. Match the scope of the original query:

   - Original query was milestone-scoped (`-m "<milestone>"`):
     ```bash
     gh issue list -s open -m "<milestone>" --json number --jq 'length'
     ```
   - Original query was repo-wide (no milestone):
     ```bash
     gh issue list -s open --json number --jq 'length'
     ```

2. **Output based on the total open count:**

   - **Total open > 0**:
     ```
     No automatable issues found (N open issues exist without the automatable label).
     Consider adding the automatable label to issues that should be picked up automatically.
     Done. Awaiting orchestrator.
     ```
   - **Total open = 0**:
     ```
     No automatable issues found. 0 open issues in scope.
     Done. Awaiting orchestrator.
     ```

3. Exit immediately — do NOT create a branch, do NOT fall back to non-automatable issues. The `automatable` label is the opt-in signal for runner-driven pickup; falling back to issues without it would silently violate the invariant that unattended mode never processes human-judgement-required work.

## Output

The (possibly empty) candidate set is the input to Step 1a's dependency resolution. Step 1a runs even when the candidate set has a single issue — the session-note line (`Filtered N blocked issues from selection.`) is emitted unconditionally for observability.
