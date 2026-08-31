# Design: Replace status-only live smoke with mutable delivery verification

**Issue**: #343
**Date**: 2026-08-31
**Status**: Approved
**Author**: rnunley-nmg
**Related Spec**: specs/269-fix-project-runtime-loading-under-compiled-omp-host/
---

## Overview

Keep `repository.nmg-sdlc-smoke` registered as an always-required provider. Replace `steering/extensions/nmg-sdlc-smoke.mjs` so it fail-closes on policy misses, clones the allowlisted consumer repo without `--depth`, records each queued issue's closing-PR baseline, and spawns exactly one child running this checkout's `scripts/sdlc-execute.mjs run` with the invocation queue. Pass only when this invocation's `.omp/sdlc/smoke-deliveries/<issue>.json` matches a new GitHub `MERGED` closing PR (not in the pre-run baseline) whose `headRefOid` equals the recorded pre-merge SHA, and the issue is `CLOSED`. Status JSON and historical merged PRs are ignored as pass predicates.

The nmg-sdlc verify worker remains observer/invoker: it is not `runExecute` in-process. Re-entry is blocked with `NMG_SDLC_SMOKE_OWNED=1`. Local clones are deleted only on `passed`. Do not change exact-head merge semantics. When `NMG_SDLC_SMOKE_OWNED=1`, `scripts/sdlc-deliver.mjs` writes the smoke-delivery JSON immediately before `gh pr merge`. Add `createSmokeProvider` for injectable `runCommand` / `mkdtempSync` / `readFileSync` / `rmSync` / `env`.

---

## Architecture

### Component Diagram

```
verify-code → runSteeringValidations
        │ request { config.issuesEnv, identity, projectRoot, signal }
        │ env NMG_SDLC_SMOKE_ISSUES
        ▼
steering/extensions/nmg-sdlc-smoke.mjs   (invoker / observer)
        │ preflight: issues config/env, nested env, Herdr, gh auth
        │ git clone --single-branch (no --depth)
        │ origin allowlist + dirty porcelain
        │ gh graphql closing-PR baseline per issue
        ▼
child: process.execPath scripts/sdlc-execute.mjs run #n …
        cwd = clone
        env NMG_SDLC_SMOKE_OWNED=1
        ▼
execute + workers inside the smoke clone
        deliver writes .omp/sdlc/smoke-deliveries/<n>.json before merge
        ▼
read delivery JSON + gh graphql closing PRs
        require new MERGED PR matching recorded headSha → envelope
```

### Data Flow

```
1. Core calls project.nmg-sdlc-smoke with immutable request (spec 214 envelope).
2. Resolve issues from config.issues, or if that key is absent, from env[config.issuesEnv].
3. Invalid/missing queue → failed, no clone.
4. Nested NMG_SDLC_SMOKE_OWNED=1 → failed, no clone.
5. Missing Herdr OMP env or gh auth status non-zero → failed, no clone.
6. mkdtempSync join(tmpdir(), "nmg-sdlc-smoke-"); git clone --single-branch URL work.
7. Clone launch_failed/cancelled/process_lost/cleanup_failed or nonzero → incomplete; retain dir if created.
8. git remote get-url origin not allowlisted → failed; retain clone.
9. git status --porcelain nonempty → failed; retain clone.
10. For each issue, gh graphql closedByPullRequestsReferences baseline; store identity set.
11. Spawn one execute child with #n tokens in queue order; cwd=clone; NMG_SDLC_SMOKE_OWNED=1.
12. Execute cancelled/process_lost/launch_failed/cleanup_failed → incomplete; retain clone.
13. Execute nonzero → failed; retain clone. Do not accept historical GitHub proof.
14. For each issue: read smoke-deliveries JSON; re-query closing PRs; require CLOSED + exactly one new MERGED PR matching recorded pullRequest and headSha.
15. All issues prove → passed; rmSync clone.
16. Any proof miss → failed; retain clone.
17. rmSync throw after proof → incomplete nmg-sdlc-smoke cleanup_failed.
```

---

## Algorithm

Keep existing `waitForClose`, `terminateOwnedProcessGroup`, `envelope`, `bounded`, and default `runCommand` in `steering/extensions/nmg-sdlc-smoke.mjs`. Replace `runSmoke` with `createSmokeProvider` as below. Do not use `exercise-omp`. Do not call `gh issue create`, `gh api` deletes, or `list-specified`. Cancellation continues to use only this file's `terminateOwnedProcessGroup` on the spawned child.

### `createSmokeProvider`

```javascript
export function createSmokeProvider({
  runCommand = defaultRunCommand,
  mkdtempSync = fsMkdtempSync,
  readFileSync = fsReadFileSync,
  rmSync = fsRmSync,
  env = process.env,
} = {}) {
  return async function smokeProvider(request) { /* algorithm */ };
}

export const extension = Object.freeze({
  schemaVersion: 1,
  id: "project.nmg-sdlc-smoke",
  providers: Object.freeze({
    "project.nmg-sdlc-smoke": createSmokeProvider(),
  }),
});
```

`defaultRunCommand` is the file's current `runCommand`. Tests import `createSmokeProvider` and inject fakes. Runtime load still requires frozen `export const extension` (spec 214 / `src/sdlc-steering-runtime.mjs`).

Use `process.execPath` (this file already does; verify-steering runs under Node — do not hardcode `node` and do not change execute CLI).

### Config

Resolve the queue with `configuredIssues(request.config, env)`:

1. If `Object.hasOwn(config ?? {}, "issues")`, use `config.issues` (must be a nonempty array of unique positive safe integers: `Number.isSafeInteger(n) && n > 0`). String identities such as `"30"` are invalid.
2. Else require `typeof config.issuesEnv === "string"` and nonempty. Read `String(env[config.issuesEnv] ?? "").trim()`. Empty/missing → invalid. Split on `/[\s,]+/`. Every token must match `/^#?[1-9]\d*$/`. Map by stripping a leading `#` then `Number(...)`. Result must still be unique positive safe integers.

Invalid → `envelope("failed", "nmg-sdlc-smoke issues config invalid", identity)` with empty evidence. No temp dir, no clone, no execute.

Production `steering/manifest.json` validation `repository.nmg-sdlc-smoke` becomes:

```json
{
  "id": "repository.nmg-sdlc-smoke",
  "provider": "project.nmg-sdlc-smoke",
  "required": true,
  "when": { "kind": "always" },
  "config": { "issuesEnv": "NMG_SDLC_SMOKE_ISSUES" }
}
```

Leave `required` and `when` unchanged. Do not add `timeoutMs`. Do not ship `config.issues`. Extension `validateConfig` for non-builtin providers only requires a non-array object, so `{ "issuesEnv": "NMG_SDLC_SMOKE_ISSUES" }` is legal.

### Nested ownership

After a valid queue: if `env.NMG_SDLC_SMOKE_OWNED === "1"` → `envelope("failed", "nmg-sdlc-smoke nested execution blocked", identity)` with empty evidence. No clone, no execute.

Order: config/env queue → nested → Herdr → auth → mkdtemp/clone.

### Herdr and GitHub auth

Herdr miss when `env.HERDR_ENV !== "1"` or empty/missing `HERDR_SOCKET_PATH` or `HERDR_PANE_ID` → `failed`, summary `nmg-sdlc-smoke Herdr environment missing`, no clone.

Then `runCommand("gh", ["auth", "status"], { env, signal: request.signal })`. Nonzero status → `failed`, summary `nmg-sdlc-smoke GitHub auth unavailable`, no clone. If that call returns `cancelled` | `process_lost` | `launch_failed` | `cleanup_failed` → `incomplete`, summary `nmg-sdlc-smoke GitHub auth ${reasonCode}`, no clone.

### Clone

`const work = mkdtempSync(join(tmpdir(), "nmg-sdlc-smoke-"))`.

`runCommand("git", ["clone", "--single-branch", "https://github.com/Nunley-Media-Group/nmg-sdlc-smoke.git", work], { env, signal: request.signal })`.

Do not pass `--depth`.

Clone `reasonCode` in `{ cancelled, process_lost, launch_failed, cleanup_failed }` or nonzero status → `incomplete`, summary `nmg-sdlc-smoke clone ${reasonCode ?? "exited " + status}`, include clone command evidence and `retained smoke clone` with `artifact: work`. Do not `rmSync`.

### Origin allowlist

`runCommand("git", ["remote", "get-url", "origin"], { cwd: work, env, signal: request.signal })`.

Allow only exact:

- `https://github.com/Nunley-Media-Group/nmg-sdlc-smoke.git`
- `https://github.com/Nunley-Media-Group/nmg-sdlc-smoke`
- `git@github.com:Nunley-Media-Group/nmg-sdlc-smoke.git`

Anything else, including forks and empty stdout → `failed`, summary `nmg-sdlc-smoke origin not allowlisted`, retain clone. Incomplete reasonCodes on this git command → `incomplete`, retain clone.

### Dirty clone

`runCommand("git", ["status", "--porcelain"], { cwd: work, env, signal: request.signal })`. If stdout trim is nonempty or status nonzero → `failed`, summary `nmg-sdlc-smoke clone dirty`, retain clone. Do not special-case `.omp/sdlc` untrack here.

### Closing-PR baseline

For each `n` in queue order, cwd `work`:

```text
gh api graphql -f query=<CLOSING_PRS_QUERY> -F owner=Nunley-Media-Group -F name=nmg-sdlc-smoke -F number=<n>
```

Query (exact):

```
query($owner:String!,$name:String!,$number:Int!){
  repository(owner:$owner,name:$name){
    issue(number:$number){
      state
      url
      closedByPullRequestsReferences(first:100){
        nodes{number url state headRefOid}
        pageInfo{hasNextPage}
      }
    }
  }
}
```

Parse `data.repository.issue`. Require `pageInfo.hasNextPage === false`. Store `Set` of `${pr.number}:${pr.url}` for nodes. Environmental failure → `incomplete` `nmg-sdlc-smoke baseline ${reasonCode}`. Unparseable / missing issue / pagination incomplete → `failed` `nmg-sdlc-smoke issue #<n> baseline unavailable`. Retain clone. Do not execute yet.

### Execute child

Exactly one spawn:

- program: `process.execPath`
- args: `[join(request.projectRoot, "scripts", "sdlc-execute.mjs"), "run", ...issues.map((n) => `#${n}`)]`
- cwd: `work`
- env: `{ ...env, NMG_SDLC_SMOKE_OWNED: "1" }`
- signal: `request.signal`

Never argv `list-specified`, never empty `run`. Never `gh issue create`.

Execute `reasonCode` in `{ cancelled, process_lost, launch_failed, cleanup_failed }` → `incomplete`, summary `nmg-sdlc-smoke execute ${reasonCode}`, retain clone.

If `execute.status !== 0` → `failed`, summary `nmg-sdlc-smoke execute exited ${status}`, retain clone. Do not read delivery files. Do not accept historical GitHub proof.

Do not parse stdout for `/sdlc-status` or `nextAction.command`.

### Current-run proof (pass predicate)

For each `n` in queue order:

1. Read `join(work, ".omp", "sdlc", "smoke-deliveries", `${n}.json`)` via injected `readFileSync`. Require JSON `{ schemaVersion: 1, issue: n, pullRequest: positive safe integer, headSha: 40-hex, recordedBeforeMerge: true }`. Else `failed` `nmg-sdlc-smoke issue #<n> missing invocation delivery proof`.
2. Re-run the same graphql closing-PR query. Environmental → `incomplete`. Issue `state` must be exactly `"CLOSED"` with nonempty string `url`; else `failed` `nmg-sdlc-smoke issue #<n> is not CLOSED`.
3. Filter closing PRs whose `${number}:${url}` is not in the pre-run baseline. Among those, require exactly one whose `number === delivery.pullRequest`, `state === "MERGED"`, nonempty `url`, and `String(headRefOid).toLowerCase() === delivery.headSha.toLowerCase()`. Else `failed` `nmg-sdlc-smoke issue #<n> missing new exact-head merged PR proof`.

Evidence item per proven issue:

```javascript
{
  kind: "github",
  summary: `issue #${n} ${issueUrl} CLOSED; PR ${prUrl} MERGED at ${delivery.headSha}`,
  artifact: prUrl,
}
```

If every issue proves: `envelope("passed", `nmg-sdlc-smoke delivered ${issues.map((n) => `#${n}`).join(", ")}`, identity, evidence)`, then `rmSync(work, { recursive: true, force: true })`. If `rmSync` throws → `incomplete`, summary `nmg-sdlc-smoke cleanup_failed`; do not claim `passed`.

If any issue fails proof: retain clone; include `{ kind: "artifact", summary: "retained smoke clone", artifact: work }`. Do not `rmSync`.

Unexpected throw → `incomplete` with `error.message`; retain clone if `work` exists.

There is no `finally { rmSync }`.

### Deliver writer (current-run SHA)

In `scripts/sdlc-deliver.mjs`, immediately before `gh pr merge ... --squash --match-head-commit <head>`, when `env.NMG_SDLC_SMOKE_OWNED === "1"`:

Write `cwd/.omp/sdlc/smoke-deliveries/<issue>.json`:

```json
{
  "schemaVersion": 1,
  "issue": <issueNumber>,
  "pullRequest": <pr number>,
  "headSha": "<expectedHead>",
  "recordedBeforeMerge": true
}
```

If `NMG_SDLC_SMOKE_OWNED` is not `"1"`, do not write. Do not change merge flags, required-check policy, or issue-close behavior.

### Incomplete vs failed

| Outcome | status | retain clone |
|---------|--------|--------------|
| invalid issues config / missing env | failed | no clone |
| nested env | failed | no clone |
| missing Herdr | failed | no clone |
| gh auth failed (nonzero) | failed | no clone |
| origin not allowlisted | failed | yes |
| dirty porcelain | failed | yes |
| baseline unavailable | failed | yes |
| execute nonzero | failed | yes |
| missing invocation delivery proof | failed | yes |
| missing new exact-head merged PR (historical only) | failed | yes |
| status-JSON-only stub | failed | yes |
| clone/auth/origin/dirty/execute/baseline/proof `cancelled` `process_lost` `launch_failed` `cleanup_failed` | incomplete | yes if dir exists |
| `rmSync` throw after proof | incomplete | yes if still present |

Never return `skipped` or `not_applicable`.

---

## API / Interface Changes

### New Endpoints / Methods

| Endpoint / Method | Type | Auth | Purpose |
|-------------------|------|------|---------|
| `createSmokeProvider(deps?)` | export function | No | Injectable provider factory |
| `extension.providers["project.nmg-sdlc-smoke"]` | async (request) → envelope | No | Existing provider id; new behavior |
| `repository.nmg-sdlc-smoke` config | manifest JSON | No | `{ "issuesEnv": "NMG_SDLC_SMOKE_ISSUES" }` |
| `writeSmokeDeliveryProof` | deliver helper | No | Pre-merge JSON when `NMG_SDLC_SMOKE_OWNED=1` |

### Request / Response Schemas

**Input:** spec 214 request plus `config.issuesEnv` or `config.issues`, `signal`. Env `NMG_SDLC_SMOKE_ISSUES` when using `issuesEnv`.

**Output (success):** spec 214 envelope `status: "passed"`, nonempty `evidence` including per-issue `kind: "github"` rows, identity equal to request identity.

**Errors:**

| Code / Type | Condition |
|-------------|-----------|
| `failed` | policy miss, execute nonzero, or missing current-run proof |
| `incomplete` | clone/network/cancel/process-loss/cleanup_failed |
| `steering_result_invalid` | core, if passed evidence empty — provider must not trigger this |

---

## Database / Storage Changes

None. Temp dirs under `os.tmpdir()`. Smoke-delivery JSON is local clone evidence only.

---

## State Management

No app state. Process env `NMG_SDLC_SMOKE_OWNED=1` on the execute child only. Provider reads that key from injected `env` to refuse re-entry. Queue comes from `NMG_SDLC_SMOKE_ISSUES` in production.

---

## UI Components

None.

---

## Alternatives Considered

| Option | Description | Pros | Cons | Decision |
|--------|-------------|------|------|----------|
| **A: Keep status JSON pass** | Continue `exercise-omp /sdlc-status --json` | Cheap | Never proves delivery | Rejected — issue AC1 |
| **B: Hard-code `config.issues: [30]`** | Reuse one delivered smoke issue | Stable number | Violates fresh-queue / non-reuse; verification Fail | Rejected — AC2 / verification |
| **C: Env queue + baseline + current-run proof** | `issuesEnv` + graphql baseline + smoke-deliveries JSON | Invocation-scoped; no reuse | Live mutations on allowlisted repo | **Selected** |

---

## Security Considerations

- [x] **Authentication**: `gh auth status` must succeed before clone
- [x] **Authorization**: origin allowlist exact `Nunley-Media-Group/nmg-sdlc-smoke`; no other remotes
- [x] **Input Validation**: queue unique positive safe integers only; env tokens `/^#?[1-9]\d*$/`
- [x] **Data Sanitization**: issue numbers interpolated only from validated integers
- [x] **Sensitive Data**: inherit process env; do not log tokens; bounded stdout/stderr via existing `bounded`

---

## Performance Considerations

- [x] **Caching**: none; each verify clones
- [x] **Pagination**: `closedByPullRequestsReferences(first:100)` with `hasNextPage === false` required
- [x] **Lazy Loading**: n/a
- [x] **Indexing**: n/a
- Full clone (no `--depth`) so execute history/merge is not shallow-broken

---

## Testing Strategy

| Layer | Type | Coverage |
|-------|------|----------|
| Provider | Jest unit with injected `runCommand`/`mkdtempSync`/`readFileSync`/`rmSync`/`env` | scripts/__tests__/nmg-sdlc-smoke.test.mjs |
| Feature | Gherkin @SCN001–@SCN006 | this package; Jest is executable evidence |
| Execute merge flags | unchanged except smoke-delivery JSON write | |

---

## Steering snippet replacements (T002)

Replace these exact **main** strings. Do not rewrite unrelated steering.

**Product** `steering/snippets/project-product.md` Live smoke integrity **Target** cell, currently `Every verify exercises `/sdlc-status --json` against `Nunley-Media-Group/nmg-sdlc-smoke` with this checkout loaded`, becomes exactly:

`Every verify executes the configured explicit issue queue against `Nunley-Media-Group/nmg-sdlc-smoke` and passes only with exact-head merged-PR and closed-issue evidence`

**Tech** `steering/snippets/project-tech.md`:

Consumer-project smoke table row (Method | Location), currently `Clone `Nunley-Media-Group/nmg-sdlc-smoke` and exercise `/sdlc-status --json` with this checkout loaded | Steering validation `repository.nmg-sdlc-smoke``, becomes exactly:

`Clone `Nunley-Media-Group/nmg-sdlc-smoke` and run this checkout's execute controller for the configured explicit issue queue | Steering validation `repository.nmg-sdlc-smoke``

Read-only sentence, currently `The live smoke clone of `nmg-sdlc-smoke` is read-only for this gate: do not create issues, branches, PRs, or comments in that repository from verify.`, becomes exactly:

`The live smoke gate may mutate only `Nunley-Media-Group/nmg-sdlc-smoke`, and only through `scripts/sdlc-execute.mjs run` and its normal workflow-owned workers; the provider never performs ad-hoc GitHub writes. Before each verification, provision one or more fresh issues with approved specs through the smoke repository's normal `/sdlc-draft-issue` and `/sdlc-write-spec` workflows, then set their explicit numbers in `NMG_SDLC_SMOKE_ISSUES`. Delivered issues are terminal and must not be reused.`

Evidence-boundary bullet, currently `- A passed `repository.nmg-sdlc-smoke` result proves this checkout still answers `/sdlc-status --json` against the live smoke project.`, becomes exactly:

`- A passed `repository.nmg-sdlc-smoke` result proves that this invocation recorded each configured issue's linked-PR baseline, observed the delivery head SHA before merge, and then observed a linked PR outside that baseline whose `headRefOid` exactly matches that SHA in GitHub `MERGED` state with the issue `CLOSED`.`

Live smoke project gate Action | Pass Criteria, currently clone + `exercise-omp` `/sdlc-status --json` and `Exit 0; stdout JSON includes nextAction.command starting with `/sdlc-``, becomes exactly:

Action: `Provision fresh smoke issues and approved specs through normal workflow ownership; set the explicit queue in `NMG_SDLC_SMOKE_ISSUES`; clone `https://github.com/Nunley-Media-Group/nmg-sdlc-smoke.git` without shallow history; record each configured issue's exact closing-PR baseline; then run `node <plugin-root>/scripts/sdlc-execute.mjs run #N [...]` once for the configured issues in order, with cwd set to the clone and `NMG_SDLC_SMOKE_OWNED=1`; read each workflow-recorded pre-merge delivery proof before accepting controller success`

Pass Criteria: `Execute exits zero; for every configured issue, an exact closing PR outside the pre-run baseline is GitHub `MERGED`, its number and `headRefOid` exactly equal the invocation's pre-merge delivery proof, and the issue is GitHub `CLOSED`; pre-existing merged PRs and status JSON cannot pass`

Condition-evaluation sentence, currently `Clone, `omp`, or network failure on the live smoke gate is `Incomplete`, not an implicit pass. A completed exercise that lacks `/sdlc-` `nextAction.command` is `Fail`.`, becomes exactly:

`Clone, cancellation, process-loss, launch, or cleanup failure on the live smoke gate is `Incomplete`; policy failures or missing delivery proof are `Fail`, and `/sdlc-status --json` output is never pass evidence.`

Add these rows to the tech Environment Variables table (Required When Applicable):

| `NMG_SDLC_SMOKE_OWNED` | Must be `1` only while the verification-owned controller mutates `Nunley-Media-Group/nmg-sdlc-smoke`; it authorizes no other repository or mutation path |
| `NMG_SDLC_SMOKE_ISSUES` | Fresh, explicit comma- or whitespace-separated smoke issue numbers with approved specs; required by the always-on mutable smoke gate and never reused after delivery |

Snippets must no longer say the smoke clone is read-only, that status JSON is sufficient to pass, or that production config is a hard-coded issue list.

---

## Risks & Mitigations

| Risk | Likelihood | Impact | Mitigation |
|------|------------|--------|------------|
| Env queue missing on verify | High | High | Fail closed `issues config invalid`; never invent identities |
| Reusing a delivered issue | High | High | Baseline + current-run JSON; historical PRs cannot pass |
| Nested verify re-enters this gate | Med | High | `NMG_SDLC_SMOKE_OWNED=1` fail closed before clone |
| Shallow clone breaks merge history | Med | High | No `--depth` |

---

## Open Questions

- None.

---

## Change History

| Issue | Date | Summary |
|-------|------|---------|
| #343 | 2026-08-31 | Initial feature spec |
| #343 | 2026-08-31 | Spec revised before delivery |
| #343 | 2026-08-31 | Spec revised to env-backed fresh queue after verification |
