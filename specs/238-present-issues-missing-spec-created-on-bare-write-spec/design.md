# Design: Bare write-spec missing-spec picker

**Issue**: #238
**Date**: 2026-08-23
**Status**: Approved
**Author**: NMG

---

## Root Cause

`workflows/write-spec/WORKFLOW.md` validates `$ARGUMENTS` before any discovery. Empty text fails `^#?\d+$`, prints usage, and stops. The only shortlist calls `publish-approved-spec.mjs candidates` after publication; that helper filters approved spec packages, not the exact `spec-created` label.

## Fix

Add a separate read-only `missing-spec-created` subcommand to `scripts/publish-approved-spec.mjs` and route only trimmed-empty initial arguments through it. Do not overload `candidates`: the bare picker and post-publication loop intentionally implement different sets, stop labels, and finish behavior.

## Helper contract

Command:

```text
node scripts/publish-approved-spec.mjs missing-spec-created
```

The helper runs GitHub issue listing with explicit argv:

```text
gh issue list --state open --limit 100 --json number,title,labels
```

It parses the complete JSON array and validates every row before filtering. A valid row has a positive safe-integer `number`, non-empty string `title`, and `labels` array whose entries are strings or objects with string `name`. Use the existing `issueHasSpecCreatedLabel` helper so matching remains exact and case-sensitive.

Exclude rows for which `issueHasSpecCreatedLabel` is true. Sort the rest by ascending number, deduplicate by number, and retain the first title for a duplicate. Return the complete filtered set; the workflow, not the helper, limits authored options to three.

Success:

```json
{
  "ok": true,
  "issues": [
    { "number": 3, "title": "Third" },
    { "number": 9, "title": "Ninth" }
  ]
}
```

A non-zero `gh` result, malformed JSON, non-array root, invalid row, or invalid label shape exits non-zero with:

```json
{ "ok": false, "reasonCode": "issues_unreadable" }
```

No partial set is returned. The subcommand accepts no extra arguments; extras fail `invalid_arguments`.

The 100-row limit matches the existing publication candidate helper and is part of this defect's bounded shortlist source. Expanding repository-wide pagination is separate scope.

## Workflow control flow

Replace the initial argument gate with:

1. Trim `$ARGUMENTS`.
2. If non-empty:
   - require `^#?\d+$` exactly;
   - invalid prints `Usage: /sdlc-write-spec #N` and stops;
   - valid sets N and proceeds directly to existing initial Discovery without the bare picker.
3. If empty:
   - invoke `missing-spec-created` and require exit 0 plus complete valid JSON;
   - on failure print `reasonCode` or helper output and stop;
   - if `issues` is empty print `No open issues missing spec-created.` and stop;
   - otherwise ask once with at most the first three issue rows and `Finished — stop without writing a spec`, recommended first.
4. Listed choice sets N.
5. Automatic Other must match `^#?([1-9]\d*)$`; invalid input re-asks the same bare picker without re-listing GitHub.
6. Finished returns immediately. It does not initialize publication output, call Discovery, or print the continue-loop finish text.
7. A selected N enters the current initial Discovery path. `published[]` still starts empty.

This picker is an initial-input selector, not the Continue loop. It does not consume the per-issue Interview ask budget.

## Unchanged contracts

- Initial approved/closed and open-package Discovery behavior
- Interview maximum and first-spec `xd://propose`
- Approved prepare/write/commit-push/merge behavior
- `candidates [--published N ...]` implementation and approved-package filtering
- Continue-loop label `Finished — stop writing specs`
- Continue-loop final `Published specs:` and `Next step:` output
- Headless/print TUI fail-closed behavior supplied by the extension

## Testing

Extend `scripts/__tests__/publish-approved-spec.test.mjs` with:

- exact-label exclusion for string and object label shapes
- case sensitivity (`Spec-Created` remains a missing-label issue)
- open issue sorting, deduplication, and success shape
- empty success array
- malformed root/row/labels and failed `gh` as `issues_unreadable`
- extra subcommand arguments as `invalid_arguments`
- proof that `candidates` behavior is unchanged

Update `scripts/__tests__/interactive-plan-contract.test.mjs` and exercise fixtures to assert:

- empty initial args call `missing-spec-created` before ask
- first authored options are up to three sorted issue chips plus exact bare Finished wording
- no prior usage or enter-number option
- automatic Other parsing/re-ask contract
- bare Finished has no publication/execute output
- empty list exact message and no ask
- helper failure stops
- explicit numeric args bypass the bare picker
- invalid non-empty args preserve exact usage
- post-publish `candidates` and Finished wording remain present

No production command Markdown regeneration is required unless the workflow renderer's drift checks show a byte change; `/sdlc-write-spec` is an interactive registry-backed workflow.

## Change History

| Issue | Date | Summary |
|-------|------|---------|
| #238 | 2026-08-23 | Initial defect report |
