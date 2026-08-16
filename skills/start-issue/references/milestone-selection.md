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
| No viable milestones | Start with 10 open issues across the repository. |
| One viable milestone | Start with 10 open issues from that milestone. |
| Multiple viable milestones | Present up to five milestones through `request_user_input`; treat free-form `Other` text as an explicit milestone title to verify. |

## Bounded Candidate Window

Use these constants for automatic discovery:

```text
PRESENTATION_TARGET = 4
INITIAL_LIMIT = 10
LIMIT_INCREMENT = 10
MAX_LIMIT = 100
```

Fetch candidate Project status together with the existing issue metadata:

```bash
gh issue list -s open -L "$limit" --json number,title,labels,projectItems
gh issue list -s open -m "<milestone>" -L "$limit" --json number,title,labels,projectItems
```

Do not filter on coordination or suitability labels in the issue-list query.
Step 1a proves roles from complete relationship evidence, excludes confirmed
epics, and owns dependency, deliverable, and Project-completion filtering after
each candidate window is fetched. A label-only exclusion is not authoritative.

If the `projectItems` shape is unavailable because GitHub Project metadata cannot be read, retry the same issue query once without `projectItems`. If that retry succeeds, continue without automatic Project-completion exclusion and emit exactly:

```text
WARNING: GitHub Project status unavailable; automatic discovery cannot exclude Done items.
```

If the retry also fails, stop with the GitHub diagnostic. Project visibility is not a new hard prerequisite for ordinary issue discovery.

### Project-Completion Predicate

For each candidate, collect non-empty `projectItems[].status.name` values. Classify the candidate as `projectCompleted = true` only when at least one readable status exists and every readable status equals `Done` case-insensitively.

- No project items, no readable statuses, or unavailable Project metadata do not prove completion.
- Mixed statuses such as `Done` plus `Backlog` do not prove completion.
- Apply this predicate only to automatic discovery. An explicit command argument or manual issue-number entry remains selectable.

### Expansion Loop

Start with `limit = INITIAL_LIMIT`. Evaluate issues in the order returned by
`gh issue list`. Run role classification first. Remove confirmed epics before
the `PRESENTATION_TARGET` count, then remove dependency-blocked candidates and
unblocked `projectCompleted` candidates from the automatic shortlist. Count
epics, blocked issues, and Done issues separately; an epic never enters either
of the latter groups, and a candidate that is both blocked and Project-completed
counts as blocked only.

If fewer than `PRESENTATION_TARGET` executable candidates remain after all three filters,
expand by `LIMIT_INCREMENT` and repeat the issue fetch plus Step 1a evaluation from fresh evidence.
The expanded fetch supersedes the prior result;
do not append stale partial classifications. Evaluate the expanded ordered prefix only until `PRESENTATION_TARGET` verified selectable candidates have been found.
Metadata may be fetched in a bounded batch for
later records, but a trailing record is not an evaluated candidate and cannot
fail selection, affect ordering, or enter filtered counts after the target is
satisfied.

This prefix boundary does not weaken fail-closed behavior. Any inconsistent, ambiguous, unverifiable, incompletely paged, or malformed issue encountered before the target is satisfied still stops selection with its exact evidence. Only trailing issues that are unnecessary for the displayed shortlist remain uninspected.

Stop expanding when any condition is true:

1. at least `PRESENTATION_TARGET` candidates remain;
2. the issue query returns fewer records than `limit`, proving the selected scope is exhausted;
3. a selected milestone's live `open_issues` count is no greater than the returned record count; or
4. `MAX_LIMIT` has been inspected.

At the bound, continue with every verified selectable candidate found plus the manual-entry option. Never treat an uninspected or trailing issue as ready, blocked, Done, invalid, ordered, or included in the filtered counts.

## Empty Result

If the selected scope has no open issues, report `No open issues found in {scope}.` and stop before branch creation. Do not silently switch to a different milestone after the user has selected one.

Each bounded candidate window is the input to Step 1a role and dependency
resolution. After the expansion loop settles, Step 1a emits
`Excluded E coordination-only epics from automatic discovery.`,
`Filtered N blocked issues from selection.`, and
`Excluded M open issues already marked Done from automatic discovery.` even
when any count is zero.
