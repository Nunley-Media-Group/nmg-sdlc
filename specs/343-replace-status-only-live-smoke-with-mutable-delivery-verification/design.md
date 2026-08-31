# Design: Replace status-only live smoke with mutable delivery verification

**Issue**: #343
**Date**: 2026-08-31
**Status**: Approved
**Author**: rnunley-nmg
**Related Spec**: specs/269-fix-project-runtime-loading-under-compiled-omp-host/
---

## Overview

Keep `repository.nmg-sdlc-smoke` registered as an always-required provider. Replace `steering/extensions/nmg-sdlc-smoke.mjs` so it clones the allowlisted consumer repo, fail-closes on policy misses, and spawns exactly one child running this checkout's `scripts/sdlc-execute.mjs run` with the configured issue tokens. Pass only when GitHub observation proves each queued issue `CLOSED` with exactly one merged PR and an observed head SHA. Status JSON is ignored as a pass predicate.

The nmg-sdlc verify worker remains observer/invoker: it is not `runExecute` in-process. Re-entry is blocked with `NMG_SDLC_SMOKE_OWNED=1`. Local clones are deleted only on `passed`. Do not edit `scripts/sdlc-execute.mjs`, `scripts/sdlc-deliver.mjs`, or `scripts/exercise-omp.mjs`. No equivalent factory exists in the current extension (it exports `runSmoke` only); add `createSmokeProvider` for injectable `runCommand` / `mkdtempSync` / `rmSync` / `env`.

---

## Architecture

### Component Diagram

```
verify-code → runSteeringValidations
        │ request { config.issues, identity, projectRoot, signal }
        ▼
steering/extensions/nmg-sdlc-smoke.mjs   (invoker / observer)
        │ preflight: nested env, issues config, Herdr, gh auth
        │ git clone --single-branch (no --depth)
        │ origin allowlist + dirty porcelain
        ▼
child: process.execPath scripts/sdlc-execute.mjs run #n …
        cwd = clone
        env NMG_SDLC_SMOKE_OWNED=1
        ▼
execute + workers inside the smoke clone (unchanged ownership)
        ▼
gh issue view + gh pr list observation → envelope passed|failed|incomplete
```

### Data Flow

```
1. Core calls project.nmg-sdlc-smoke with immutable request (spec 214 envelope).
2. Nested NMG_SDLC_SMOKE_OWNED=1 → failed, no clone.
3. Invalid config.issues → failed, no clone.
4. Missing Herdr OMP env or gh auth status non-zero → failed, no clone.
5. mkdtempSync join(tmpdir(), "nmg-sdlc-smoke-"); git clone --single-branch URL work.
6. Clone launch_failed/cancelled/process_lost/cleanup_failed or nonzero → incomplete; retain dir if created.
7. git remote get-url origin not allowlisted → failed; retain clone.
8. git status --porcelain nonempty → failed; retain clone.
9. Spawn one execute child with #n tokens in config order; cwd=clone; NMG_SDLC_SMOKE_OWNED=1.
10. Execute cancelled/process_lost/launch_failed/cleanup_failed → incomplete; retain clone.
11. Ignore execute exit code and any /sdlc-status JSON. Observe GitHub per issue.
12. All issues CLOSED + exactly one MERGED PR with headRefOid → passed; rmSync clone.
13. Any proof miss → failed; retain clone.
14. rmSync throw after proof → incomplete nmg-sdlc-smoke cleanup_failed.
```

---

## Algorithm

Keep existing `waitForClose`, `terminateOwnedProcessGroup`, `envelope`, `bounded`, and default `runCommand` in `steering/extensions/nmg-sdlc-smoke.mjs`. Replace `runSmoke` with `createSmokeProvider` as below. Do not use `exercise-omp`. Do not call `gh issue create`, `gh api` deletes, or `list-specified`. Cancellation continues to use only this file's `terminateOwnedProcessGroup` on the spawned child.

### `createSmokeProvider`

```javascript
export function createSmokeProvider({
  runCommand = defaultRunCommand,
  mkdtempSync = fsMkdtempSync,
  rmSync = fsRmSync,
  env = process.env,
} = {}) {
  return async function runSmoke(request) { /* algorithm */ };
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

Use `process.execPath` (this file already does; verify-steering runs under Node, so this is Node — do not hardcode `node` and do not change execute).

### Config

`request.config.issues` must be a nonempty array of unique positive safe integers (`Number.isSafeInteger(n) && n > 0`). Missing `issues`, non-array, empty array, non-integers, `<= 0`, duplicates, or string identities such as `"30"` are invalid.

Invalid → `envelope("failed", "nmg-sdlc-smoke issues config invalid", identity)` with `evidence: []`. No temp dir, no clone, no execute.

Production `steering/manifest.json` validation `repository.nmg-sdlc-smoke` becomes:

```json
{
  "id": "repository.nmg-sdlc-smoke",
  "provider": "project.nmg-sdlc-smoke",
  "required": true,
  "when": { "kind": "always" },
  "config": { "issues": [30] }
}
```

Leave `required` and `when` unchanged. Do not add `timeoutMs`. Extension `validateConfig` for non-builtin providers only requires a non-array object, so `{ "issues": [30] }` is legal.

### Nested ownership

If `env.NMG_SDLC_SMOKE_OWNED === "1"` → `envelope("failed", "nmg-sdlc-smoke nested ownership", identity)` with empty evidence. No clone, no execute. Check this before config? Check nested first, then config, then Herdr, then auth — so nested tests never clone even with bad config. Order: nested → config → Herdr → auth → mkdtemp/clone.

### Herdr and GitHub auth

Herdr miss when `env.HERDR_ENV !== "1"` or `!env.HERDR_SOCKET_PATH` or `!env.HERDR_PANE_ID` → `failed`, summary `nmg-sdlc-smoke missing Herdr OMP context`, no clone.

Then `runCommand("gh", ["auth", "status"], { env, signal: request.signal })`. Nonzero status or `reasonCode` other than the incomplete set below → `failed`, summary `nmg-sdlc-smoke missing GitHub auth`, no clone. If that call returns `cancelled` | `process_lost` | `launch_failed` | `cleanup_failed` → `incomplete` with that reason in the summary (`nmg-sdlc-smoke GitHub auth ${reasonCode}`), no clone.

### Clone

`const work = mkdtempSync(join(tmpdir(), "nmg-sdlc-smoke-"))`.

`runCommand("git", ["clone", "--single-branch", "https://github.com/Nunley-Media-Group/nmg-sdlc-smoke.git", work], { signal: request.signal })`.

Do not pass `--depth`.

Clone `reasonCode` in `{ cancelled, process_lost, launch_failed, cleanup_failed }` or nonzero status → `incomplete`, summary `nmg-sdlc-smoke clone ${reasonCode ?? "exited " + status}`, evidence one `kind: "command"` item with summary `git clone https://github.com/Nunley-Media-Group/nmg-sdlc-smoke.git`, `artifact: work`. Do not `rmSync`.

### Origin allowlist

`runCommand("git", ["remote", "get-url", "origin"], { cwd: work, signal: request.signal })`.

Normalize stdout: trim, strip trailing `/`, strip trailing `.git`. Allow only:

- `https://github.com/Nunley-Media-Group/nmg-sdlc-smoke`
- `git@github.com:Nunley-Media-Group/nmg-sdlc-smoke`

Anything else, including forks and empty stdout → `failed`, summary `nmg-sdlc-smoke origin is not allowlisted`, `artifact: work`. Do not `rmSync`. Incomplete reasonCodes on this git command → `incomplete`, retain clone.

### Dirty clone

`runCommand("git", ["status", "--porcelain"], { cwd: work, signal: request.signal })`. If stdout trim is nonempty → `failed`, summary `nmg-sdlc-smoke checkout is dirty`, `artifact: work`. Do not `rmSync`. Do not special-case `.omp/sdlc` untrack here (that exception lives in execute, out of scope).

### Execute child

Exactly one spawn:

- program: `process.execPath`
- args: `[join(request.projectRoot, "scripts", "sdlc-execute.mjs"), "run", ...issues.map((n) => `#${n}`)]`
- cwd: `work`
- env: `{ ...env, NMG_SDLC_SMOKE_OWNED: "1" }`
- signal: `request.signal`

Never argv `list-specified`, never empty `run` (that is the picker / `defaultBacklog`). Never `gh issue create`.

Execute `reasonCode` in `{ cancelled, process_lost, launch_failed, cleanup_failed }` → `incomplete`, summary `nmg-sdlc-smoke execute ${reasonCode}`, evidence includes clone artifact path. Retain clone.

Do not treat execute status `0` as pass. Do not parse stdout for `/sdlc-status` or `nextAction.command`. If stdout contains `Run /sdlc-write-spec`, still run observation (proof will fail → `failed`).

### Observation (pass predicate)

For each `n` in `config.issues` order, cwd `work`, inherited `env`:

1. `gh issue view ${n} --json url,state`
2. Parse JSON. Require `String(state).toUpperCase() === "CLOSED"` and nonempty string `url`.
3. `gh pr list --search linked:issue-${n} --state merged --json url,state,headRefOid`
4. Parse JSON array. Require `length === 1`, `String(prs[0].state).toUpperCase() === "MERGED"`, nonempty string `headRefOid`, nonempty string `url`.

Evidence item per proven issue:

```javascript
{
  kind: "command",
  summary: `smoke #${n} ${issueUrl} ${prUrl} ${headRefOid} MERGED CLOSED`,
  artifact: issueUrl,
}
```

If every issue proves: `envelope("passed", "nmg-sdlc-smoke delivered merged closed", identity, evidence)`, then `rmSync(work, { recursive: true, force: true })`. If `rmSync` throws → `incomplete`, summary `nmg-sdlc-smoke cleanup_failed`, same evidence plus `artifact: work` if still needed; do not claim `passed`.

If any issue fails proof, including gh nonzero, malformed JSON, wrong state, zero PRs, or more than one merged PR: `failed`, summary `nmg-sdlc-smoke delivery proof missing`, evidence may include partial proven rows plus `{ kind: "command", summary: "retained smoke clone", artifact: work }`. Do not `rmSync`.

Unexpected throw in `runSmoke` → `incomplete` with `error.message`; do not `rmSync` if `work` exists.

There is no `finally { rmSync }` — that is the current bug relative to AC5.

### Incomplete vs failed

| Outcome | status | retain clone |
|---------|--------|--------------|
| nested env | failed | no clone |
| invalid issues config | failed | no clone |
| missing Herdr | failed | no clone |
| gh auth failed (nonzero) | failed | no clone |
| origin not allowlisted | failed | yes |
| dirty porcelain | failed | yes |
| delivery proof missing (including execute 0 + `Run /sdlc-write-spec`, status-JSON-only stub) | failed | yes |
| clone/auth/origin/dirty/execute `cancelled` `process_lost` `launch_failed` `cleanup_failed` | incomplete | yes if dir exists |
| `rmSync` throw after proof | incomplete | yes if still present |

Never return `skipped` or `not_applicable` (core would coerce those to incomplete anyway).

---

## API / Interface Changes

### New Endpoints / Methods

| Endpoint / Method | Type | Auth | Purpose |
|-------------------|------|------|---------|
| `createSmokeProvider(deps?)` | export function | No | Injectable provider factory for tests and frozen extension handler |
| `extension.providers["project.nmg-sdlc-smoke"]` | async (request) → envelope | No | Existing provider id; new behavior |
| `repository.nmg-sdlc-smoke` config | manifest JSON | No | `{ "issues": [30] }` |

### Request / Response Schemas

#### Provider result

**Input:** core request from spec 214 (`schemaVersion`, `validationId`, `projectRoot`, `config`, `identity`, plus `signal`). `config.issues` as above.

**Output (success):** spec 214 envelope with `status: "passed"`, nonempty `evidence` (core rejects passed + empty evidence), identity equal to request identity.

**Errors:**

| Code / Type | Condition |
|-------------|-----------|
| `failed` | policy miss or missing delivery proof |
| `incomplete` | clone/network/cancel/process-loss/cleanup_failed |
| `steering_result_invalid` | core, if passed evidence empty or identity mismatch — provider must not trigger this |

---

## Database / Storage Changes

None. Temp dirs under `os.tmpdir()` only. No schema, no migration.

---

## State Management

No app state. Process env `NMG_SDLC_SMOKE_OWNED=1` on the execute child only. Provider reads that key from injected `env` to refuse re-entry.

---

## UI Components

None. Steering validation provider; no screens.

---

## Alternatives Considered

| Option | Description | Pros | Cons | Decision |
|--------|-------------|------|------|----------|
| **A: Keep status JSON pass** | Continue `exercise-omp /sdlc-status --json` | Cheap | Never proves delivery | Rejected — issue AC1 |
| **B: In-process `runExecute`** | Import execute into the provider | One process | Makes verify the smoke controller; nests ownership | Rejected — AC4 |
| **C: Child `sdlc-execute.mjs run` + GitHub observation** | Invoker/observer + proof | Reuses ownership; fail-closed proof | Live mutations on allowlisted repo | **Selected** |

---

## Security Considerations

- [x] **Authentication**: `gh auth status` must succeed before clone
- [x] **Authorization**: origin allowlist exact `Nunley-Media-Group/nmg-sdlc-smoke`; no other remotes
- [x] **Input Validation**: `config.issues` unique positive safe integers only
- [x] **Data Sanitization**: issue numbers interpolated only as `#${n}` / `linked:issue-${n}` from validated integers
- [x] **Sensitive Data**: inherit process env; do not log tokens; bounded stdout/stderr via existing `bounded`

---

## Performance Considerations

- [x] **Caching**: none; each verify clones
- [x] **Pagination**: `gh pr list` must return exactly one merged linked PR; extra rows fail
- [x] **Lazy Loading**: n/a
- [x] **Indexing**: n/a
- Full clone (no `--depth`) so execute history/merge is not shallow-broken

---

## Testing Strategy

| Layer | Type | Coverage |
|-------|------|----------|
| Provider | Jest unit with injected `runCommand`/`mkdtempSync`/`rmSync`/`env` | scripts/__tests__/nmg-sdlc-smoke.test.mjs |
| Feature | Gherkin @SCN001–@SCN006 | this package; Jest is executable evidence |
| Execute / deliver | unchanged | out of scope |

---

## Steering snippet replacements (T002)

Replace these exact current strings. Do not rewrite unrelated steering.

**Product** `steering/snippets/project-product.md` Live smoke integrity **Target** cell, currently `Every verify exercises `/sdlc-status --json` against `Nunley-Media-Group/nmg-sdlc-smoke` with this checkout loaded`, becomes exactly:

`Every verify runs a controlled mutable delivery smoke against Nunley-Media-Group/nmg-sdlc-smoke that proves the configured issue queue reached exact-head merge and GitHub CLOSED`

**Tech** `steering/snippets/project-tech.md`:

Consumer-project smoke table row (Method | Location), currently `Clone `Nunley-Media-Group/nmg-sdlc-smoke` and exercise `/sdlc-status --json` with this checkout loaded | Steering validation `repository.nmg-sdlc-smoke``, becomes exactly:

`Clone Nunley-Media-Group/nmg-sdlc-smoke and prove the configured queue was delivered, merged at exact head, and closed | Steering validation repository.nmg-sdlc-smoke`

Read-only sentence, currently `The live smoke clone of `nmg-sdlc-smoke` is read-only for this gate: do not create issues, branches, PRs, or comments in that repository from verify.`, becomes exactly:

`The live smoke gate may mutate Nunley-Media-Group/nmg-sdlc-smoke only through this checkout's scripts/sdlc-execute.mjs run against a local clone; the nmg-sdlc verify worker is invoker/observer only and must not delete remote GitHub artifacts.`

Evidence-boundary bullet, currently `- A passed `repository.nmg-sdlc-smoke` result proves this checkout still answers `/sdlc-status --json` against the live smoke project.`, becomes exactly:

`- A passed `repository.nmg-sdlc-smoke` result proves every configured smoke issue reached exact-head merge and GitHub CLOSED, with issue URL, PR URL, observed head SHA, MERGED, and CLOSED evidence.`

Live smoke project gate Action | Pass Criteria, currently clone + `exercise-omp` `/sdlc-status --json` and `Exit 0; stdout JSON includes nextAction.command starting with `/sdlc-``, becomes exactly:

Action: `Clone https://github.com/Nunley-Media-Group/nmg-sdlc-smoke.git with --single-branch and no --depth; fail closed on missing GitHub auth, missing Herdr OMP context, dirty clone, non-allowlisted origin, nested NMG_SDLC_SMOKE_OWNED=1, or invalid/missing config.issues; spawn exactly one child process.execPath scripts/sdlc-execute.mjs run #<n>... with cwd=clone and NMG_SDLC_SMOKE_OWNED=1; observe GitHub CLOSED plus exactly one merged PR headRefOid per queued issue`

Pass Criteria: `passed with nonempty per-issue evidence containing issue URL, PR URL, observed head SHA, MERGED, and CLOSED; /sdlc-status --json is not a pass predicate`

Condition-evaluation sentence, currently `Clone, `omp`, or network failure on the live smoke gate is `Incomplete`, not an implicit pass. A completed exercise that lacks `/sdlc-` `nextAction.command` is `Fail`.`, becomes exactly:

`Clone, network, cancel, or process-loss on the live smoke gate is Incomplete, not an implicit pass. Missing GitHub auth, missing Herdr OMP context, dirty clone, non-allowlisted origin, invalid issue config, nested ownership, or missing delivered/merged/closed proof is Fail. Status JSON cannot pass.`

Snippets must no longer say the smoke clone is read-only or that status JSON is sufficient to pass.

---

## Risks & Mitigations

| Risk | Likelihood | Impact | Mitigation |
|------|------------|--------|------------|
| Live execute mutates smoke issue #30 on every verify | High | Med | Allowlist + explicit queue; leave GitHub artifacts; no remote deletes |
| Nested verify inside smoke execute re-enters this gate | Med | High | `NMG_SDLC_SMOKE_OWNED=1` fail closed before clone |
| Shallow clone breaks merge history | Med | High | No `--depth` |
| Treating execute 0 as pass when spec missing | High | High | Observation-only pass; write-spec stdout is not pass |

---

## Open Questions

- None.

---

## Change History

| Issue | Date | Summary |
|-------|------|---------|
| #343 | 2026-08-31 | Initial feature spec |
| #343 | 2026-08-31 | Spec revised before delivery |
