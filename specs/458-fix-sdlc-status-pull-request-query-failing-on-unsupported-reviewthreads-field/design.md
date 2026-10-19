# Root Cause Analysis: Fix sdlc-status pull-request query failing on unsupported reviewThreads field

**Issue**: #458
**Date**: 2026-10-18
**Status**: Approved
**Author**: NMG
**Related Spec**: specs/145-add-lifecycle-status-command-for-active-sdlc-work/

## Root Cause

`collectGithub()` in `scripts/sdlc-status.mjs` reads the branch pull request with `gh pr view --json number,state,isDraft,headRefName,headRefOid,baseRefName,mergeStateStatus,closingIssuesReferences,reviewThreads`. `reviewThreads` is not a `gh pr view` JSON field: gh 2.97.0 writes `Unknown JSON field: "reviewThreads"` and the available-field list to stderr and exits 1. Status never reads `reviewThreads` from the response.

The result handling has only an `if (prRes.ok)` branch, and the enclosing `catch` is a silent `// non fatal`. A failed query therefore leaves `pullRequest: null` with no gap, which is indistinguishable from a branch that has no pull request.

`scripts/sdlc-execute.mjs` reads `pullRequest` through `statusEvidence()` → `collectEvidence()`. When PR-only evidence is required, its verify green checks require `pullRequest.state === 'OPEN'`, `pullRequest.isDraft === true`, and `pullRequest.headRefOid` equal to the current head. With `pullRequest` always `null`, verify never turns green and keeps failing with `pr_evidence_pending`.

The `gh pr view` stub in `scripts/__tests__/sdlc-execute.test.mjs` answers every field list, and the only `collectEvidence` fixture in `scripts/__tests__/sdlc-status.test.mjs` fails every `gh` call, so no test rejected the unsupported field.

## Affected Code

| File | Symbol / Area | Role |
|------|---------------|------|
| `scripts/sdlc-status.mjs` | `collectGithub`, `// PR from branch` block | Requests the unsupported `reviewThreads` field and drops every query failure silently |
| `scripts/sdlc-execute.mjs` | `statusEvidence`, verify `green` checks | Consumes `pullRequest`; unchanged |
| `scripts/__tests__/sdlc-execute.test.mjs` | `fixture()` `run` stub, `pr view` branch | Accepts any field list |
| `scripts/__tests__/sdlc-status.test.mjs` | `collectEvidence` coverage | No fixture returns a `gh pr view` response |

## Fix Strategy

Add a module-level constant next to `CLOSING_PULL_REQUEST_FIELDS` in `scripts/sdlc-status.mjs`:

```js
const NO_BRANCH_PULL_REQUEST = /^no pull requests found for branch /m;
```

Replace the `// PR from branch` block in `collectGithub` with the same shape as the issue fetch above it:

```js
  // PR from branch
  try {
    const prRes = adapters.run('gh', ['pr', 'view', '--json', 'number,state,isDraft,headRefName,headRefOid,baseRefName,mergeStateStatus,closingIssuesReferences'], { cwd: projectRoot });
    if (prRes.ok) {
      const p = JSON.parse(prRes.stdout);
      if (p && p.headRefName === branch) {
        result.pullRequest = {
          number: p.number,
          state: p.state,
          isDraft: p.isDraft,
          headRefOid: p.headRefOid,
          baseRefName: p.baseRefName,
          mergeStateStatus: p.mergeStateStatus,
          checks: 'unknown',
          closing: (p.closingIssuesReferences || []).map((c) => c.number),
        };
      }
    } else if (!NO_BRANCH_PULL_REQUEST.test(commandFailure(prRes))) {
      gaps.push(`pull request fetch failed: ${boundedMessage(commandFailure(prRes))}`);
    }
  } catch (e) {
    gaps.push(`pull request parse failed: ${boundedMessage(e.message)}`);
  }
  return result;
```

- `commandFailure` (stderr, else stdout, else `exit <status>`, trimmed) and `boundedMessage` (whitespace collapsed to one line; longer than 240 characters → first 237 characters plus `...`) are the existing helpers used by the issue fetch.
- The `m` flag matches the gh message at the start of any stderr line.
- A successful response that is JSON `null` or whose `headRefName` differs from the current branch still leaves `pullRequest` `null` without a gap.

### Strict `gh pr view` test stubs

Both `scripts/__tests__/sdlc-status.test.mjs` and `scripts/__tests__/sdlc-execute.test.mjs` define, at module level (test files are self-contained; Jest treats every `.mjs` under `scripts/__tests__/` as a suite, so no shared helper file is added there):

```js
const GH_PR_VIEW_JSON_FIELDS = new Set(`additions assignees author autoMergeRequest baseRefName baseRefOid body
  changedFiles closed closedAt closingIssuesReferences comments commits createdAt deletions files fullDatabaseId
  headRefName headRefOid headRepository headRepositoryOwner id isCrossRepository isDraft labels latestReviews
  maintainerCanModify mergeCommit mergeStateStatus mergeable mergedAt mergedBy milestone number potentialMergeCommit
  projectCards projectItems reactionGroups reviewDecision reviewRequests reviews state statusCheckRollup title
  updatedAt url`.split(/\s+/));

function ghPrViewUnknownField(args) {
  const index = args.indexOf('--json');
  if (index === -1) return null;
  const unknown = String(args[index + 1] ?? '').split(',').find((field) => !GH_PR_VIEW_JSON_FIELDS.has(field));
  if (unknown === undefined) return null;
  return `Unknown JSON field: "${unknown}"\nAvailable fields:\n${[...GH_PR_VIEW_JSON_FIELDS].map((field) => `  ${field}`).join('\n')}\n`;
}
```

The set is the 46-field list gh 2.97.0 prints for `gh pr view --json <unknown>`.

Execute fixture (`fixture()` `run`, `pr view` branch): first, when `ghPrViewUnknownField(args)` returns a message, return `{ status: 1, stdout: '', stderr: message }`. The no-pull-request response `result('', 1)` becomes `{ status: 1, stdout: '', stderr: 'no pull requests found for branch "42-example"\n' }`. The draft and merged responses are unchanged.

Status fixture: a new `describe('sdlc-status branch pull-request evidence')` after the existing `describe` uses a local `statusFixture(prView)` that:

1. Creates a temporary git repository (`git init -b main`, user config, commit `README.md`), then `git checkout -b 42-example`.
2. Writes `specs/42-example/{requirements.md,design.md,feature.gherkin}` as `**Issue**: #42\n**Status**: Approved\n\n` and `tasks.md` as that header plus `### T001: Update helper\n`, and writes `src/helper.mjs` as `export const helper = true;\n`.
3. Computes `scope = inspectIssueSpecScope({ projectRoot: project, specPath: 'specs/42-example', issueNumber: 42 })` (import from `../issue-spec-scope.mjs`) and writes `specs/42-example/verification-report.md` as `# Verification Report\n\n### Implementation Status: Pass\n\n<!-- nmg-sdlc-issue-scope: ${JSON.stringify({ issueNumber: 42, specPath: 'specs/42-example', status: scope.status, delivery: scope.delivery, regression: scope.regression })} -->\n` (the same report shape as the execute fixture's `passGate()`).
4. Commits everything and records `head = git rev-parse HEAD`.
5. Returns `{ project, head, run }`, where `run` executes non-`gh` commands with `spawnSync` (returning `{ ok, status, stdout, stderr }` like the existing `collectEvidence` test) and answers `gh` with `ok = (value) => ({ ok: true, status: 0, stdout: typeof value === 'string' ? value : JSON.stringify(value), stderr: '' })`:
   - `repo` with `--jq` → `ok('main\n')`; other `repo` → `ok({ nameWithOwner: 'example/status' })`
   - `issue view` → `ok({ number: 42, title: 'Example', state: 'OPEN', body: '', labels: [], projectItems: { nodes: [] } })`
   - `api` whose args include an entry ending in `/dependencies/blocked_by` → `ok([])`; other `api` → `ok({ id: 4242, number: 42, state: 'OPEN', repository: 'example/status' })`
   - `pr view` → `{ ok: false, status: 1, stdout: '', stderr: message }` when `ghPrViewUnknownField(args)` returns a message, otherwise `prView(args, head)`
   - anything else throws `unexpected gh <args>`

A local `statusJson(fixture)` calls `runCli(['--project', fixture.project, '--json'], { adapters: { run: fixture.run }, stdout: { write(chunk) { out += chunk; } }, stderr: { write() {} } })`, expects exit code 0, and returns `JSON.parse(out)`. Each test removes its project in `finally` with `fs.rmSync(project, { recursive: true, force: true })`.

## Changes

| File | Change | Behavioral reason |
|------|--------|-------------------|
| `scripts/sdlc-status.mjs` | Drop `reviewThreads` from the `gh pr view` field list; report non-no-PR failures and parse failures as bounded gaps | AC1, AC2, AC3, AC4, FR1, FR2, FR3 |
| `scripts/__tests__/sdlc-execute.test.mjs` | Strict `pr view` field validation and the real no-PR message in the fixture stub | AC2, FR4 |
| `scripts/__tests__/sdlc-status.test.mjs` | Strict-stub `collectEvidence` fixture; draft-PR, failure-gap, and no-PR tests | AC1, AC3, AC4, FR4 |

## Blast Radius

- `collectEvidence().gaps` and the `/sdlc-status` `gaps` output (JSON and the text `Gaps:` line) gain at most one `pull request …` entry, only when the query fails for a reason other than no pull request. `inferLifecycle` never branches on `gaps`, so stage and next action are unchanged whenever `pullRequest` is unchanged.
- Branches with a pull request now report a non-null `pullRequest`, so `/sdlc-status` reaches its existing `review`, `delivery-validation-pending`, and `complete` branches, and `scripts/sdlc-execute.mjs` verify green checks observe the draft pull request. `sdlc-execute.mjs` reads `pullRequest` and `verification`, never status `gaps`; it needs no change.
- The existing `offline fixture` `collectEvidence` test now also records `pull request fetch failed: offline fixture`; it asserts no gaps and is unchanged.
- Other `gh pr view` callers are unchanged.

## Alternatives Considered

| Option | Decision | Reason |
|--------|----------|--------|
| Remove `reviewThreads` and report non-no-PR failures as gaps, mirroring the issue fetch | Selected | Fixes the rejected query and makes future query failures visible using existing helpers |
| Read review threads through GraphQL in status | Rejected | Status never consumes review-thread data; delivery already reads threads in `scripts/sdlc-deliver.mjs` |
| Only remove `reviewThreads` and keep the silent catch | Rejected | Any later field or transport failure would again look like a branch without a pull request (AC3) |

## Change History

| Issue | Date | Summary |
|-------|------|---------|
| #458 | 2026-10-18 | Initial defect design |
