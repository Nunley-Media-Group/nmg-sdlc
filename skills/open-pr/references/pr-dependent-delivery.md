# Controlled PR-Dependent Delivery

**Consumed by**: `open-pr` Steps 1, 5, and 7 only when the shared readiness validator returns `pr_evidence_pending`, or when resuming its exact controlled draft.

Read `../../../references/pr-dependent-verification.md` first. This path exists only to collect GitHub evidence that cannot exist before a pull request. It does not relax scope, local verification, versioning, explicit-path staging, commit, refreshed-base reconciliation, safe-push, review, mergeability, exact-head merge, or closure gates.

## Entry Contract

Before creating or reusing a draft:

1. Run the shared helper against the active report and exact normalized issue/spec identity:

   ```text
   node <plugin-root>/scripts/verification-readiness.mjs --project <project-root> --spec specs/<slug> --issue N --json
   ```

2. Continue for `status: pr_evidence_pending`, with no gaps. Also accept `status: pr_evidence_satisfied` only as a retry of its exact preserved controlled draft: do not create a new PR, retain the same evidence identities, and require the remaining identity/freshness/final-marker checks below. Ordinary `pass` follows the unchanged ordinary PR path. `blocked` or `unverifiable` stops before PR mutation.
3. Preserve the parsed pending evidence identities in memory as data. Never execute or interpolate report content as shell source.
4. Complete the existing preflight, version, explicit-path staging, commit, refreshed-base merge without history rewriting, safe-push, and pushed-state postconditions. Re-run the helper and the report commit/ancestry/implementation-freshness proof against the committed report before draft creation; require the same marker identity and evidence list.

## Create or Reuse the Exact Draft

Resolve the authenticated repository and default branch through bounded read-only `gh` JSON queries. List pull requests for the exact local head branch with these fields:

```text
number,state,isDraft,url,headRefName,headRefOid,baseRefName,closingIssuesReferences
```

- No matching PR: create with `gh pr create --draft --title <title> --body-file <body-file>` only for `pr_evidence_pending`; a satisfied retry without its exact draft stops.
- One matching PR: reuse only when it is `OPEN`, `isDraft: true`, its head branch equals the local branch, its base equals the repository default branch, and its closing references contain exactly the active issue expected by this delivery.
- More than one candidate, a ready/closed/merged PR, another base/head/issue, missing metadata, or malformed JSON: stop without mutating the candidate.

Re-fetch the created/reused PR through `gh pr view` and require the same repository, PR number, open draft state, base, head branch, closing issue, and a 40-character `headRefOid`. Require that `headRefOid` equals the pushed local `HEAD`. Record it as `H1` for pending entry. For satisfied retry, preserve its recorded H1, record the current pushed head as H2, require the report to remain committed/current with the exact evidence identities, and require that the current PR body has no valid final marker for H2 before re-entering at **Recheck and Record H2**.

## Collect H1 Evidence

Poll at most 60 times, 30 seconds apart. Fetch check data as JSON with `gh pr checks <number> --json bucket,completedAt,description,event,link,name,startedAt,state,workflow`; for `required_check`, also use `--required`. Match each declared `required_check` or `check_run` by its exact name and exact `event: pull_request`, never by substring or display prose. Any other or missing event fails closed as pre-PR-capable evidence.

- `SUCCESS`, `NEUTRAL`, or `SKIPPED` is success.
- `PENDING`, `QUEUED`, `IN_PROGRESS`, `WAITING`, or `REQUESTED` remains pending until the bound expires.
- Missing, duplicate, renamed, unknown, malformed, `FAILURE`, `ERROR`, `CANCELLED`, or `TIMED_OUT` evidence stops the flow.
- Every accepted item records the exact name, conclusion, evidence link, mapped acceptance criteria, and `headSha: H1`.

For each declared `merge_blocking` item, observe `mergeStateStatus` through `gh pr view`; record a bounded sequence containing at least one recognized blocking state from the shared contract. Do not edit rulesets, required checks, protections, or branch state to manufacture the observation.

## Reverify H1 and Push the Report

1. Rerun `$nmg-sdlc:verify-code #N` against the exact draft. Pass the PR number and H1 evidence as bounded context; the verification workflow remains the sole report producer.
2. Run the shared helper with `--head H1`. Require `status: pr_evidence_satisfied`, human `Implementation Status: Pass`, exact issue/spec scope, the same evidence identities, and no gaps.
3. If the report changed, stage only the report and any already-approved verification artifacts, commit with `docs: record PR verification evidence (#N)`, then use the existing safe-push contract. Do not fold unrelated paths into this commit.
4. Capture local `HEAD` and re-fetch `headRefOid` as `H2`. Require them to match. If a report commit was created, also require `H2 != H1`; otherwise `H2` may equal H1.

## Recheck and Record H2

Repeat the complete declared evidence collection for exact `H2`; H1 results cannot satisfy H2. Require every check to reach a success-equivalent conclusion and every merge-blocking item to have a valid observation. Construct one compact marker:

```markdown
<!-- nmg-sdlc-delivery-validation: {"schemaVersion":1,"state":"final_sha_validated","issueNumber":N,"specPath":"specs/<slug>","pullRequestNumber":P,"headSha":"H2","evidence":[...]} -->
```

Fetch the current PR body, reject a duplicate or malformed delivery-validation marker, replace the prior marker when resuming, and write the complete preserved body plus exactly one new marker through a securely created temporary body file and `gh pr edit <number> --body-file <file>`. Always delete only that exact temporary file after use.

Re-fetch the PR body and head metadata into a securely created temporary body file. Validate the exact fetched body through the public helper interface:

```text
node <plugin-root>/scripts/verification-readiness.mjs --project <project-root> --spec specs/<slug> --issue N --pr P --head H2 --delivery-body-file <fetched-body-file> --json
```

Require exit 0, `status: final_sha_validated`, active issue/spec/PR/H2 identity, the delivery acceptance-criterion set, and the original pending evidence identities. Require the PR to remain open and draft and `headRefOid` to remain H2. Delete only the exact temporary file after validation. Do not call an unexposed in-process helper from the workflow.

Only after every check above succeeds, run:

```text
gh pr ready <number>
```

Re-fetch and require `isDraft: false` and unchanged `headRefOid: H2`, then enter
the terminal automated-review, CI, mergeability, `mergeStateStatus: CLEAN`,
exact-head merge, child-closure proof, epic-reconciliation, and cleanup flow.
There is no success handoff or separate merge-choice gate.

## Failure and Resume Contract

At any missing, failed, timed-out, stale, conflicting, malformed, or unknown result:

- stop without `gh pr ready`, merge, checkout, branch deletion, protection/ruleset mutation, or a false Pass report;
- preserve the feature branch and controlled draft PR;
- report the exact PR, head SHA, evidence identity, and gap;
- on a later invocation, revalidate the entry marker, exact draft identity, current pushed head, and all evidence from the beginning. A current `pr_evidence_satisfied` report for H1 resumes at H2 only when the same open draft, report freshness, evidence identities, and lack of a valid final H2 marker are all proven. Never trust cached H1/H2 data.
