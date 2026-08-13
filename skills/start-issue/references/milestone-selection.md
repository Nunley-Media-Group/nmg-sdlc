# Milestone Selection and Issue Fetching

**Consumed by**: `start-issue` Step 1 when no issue number was supplied.

## Fetch Viable Milestones

Fetch milestones with at least one open issue, sorted alphabetically:

```bash
gh api 'repos/{owner}/{repo}/milestones?state=open&sort=due_on&direction=asc' \
  --jq '[.[] | select(.open_issues > 0)] | sort_by(.title)'
```

If milestone discovery fails, stop with the GitHub diagnostic rather than silently broadening scope.

## Choose Scope

| Result | Action |
|--------|--------|
| No viable milestones | Fetch up to 10 open issues across the repository. |
| One viable milestone | Fetch up to 10 open issues from that milestone. |
| Multiple viable milestones | Present up to five milestones through `request_user_input`; treat free-form `Other` text as an explicit milestone title to verify. |

Use these issue queries:

```bash
gh issue list -s open -L 10 --json number,title,labels
gh issue list -s open -m "<milestone>" -L 10 --json number,title,labels
```

Do not filter on coordination or suitability labels. Step 1a owns dependency filtering after the candidate set is fetched.

## Empty Result

If the selected scope has no open issues, report `No open issues found in {scope}.` and stop before branch creation. Do not silently switch to a different milestone after the user has selected one.

The resulting candidate set is the input to Step 1a dependency resolution. Step 1a emits `Filtered N blocked issues from selection.` even when `N` is zero.
