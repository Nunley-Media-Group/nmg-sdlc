# Root Cause Analysis: Accept REST dependency repository objects

**Issue**: #245
**Date**: 2026-08-24
**Status**: Approved
**Author**: NMG
**Related Spec**: specs/236-adopt-github-blocked-by-as-the-only-issue-dependency-type/

---

## Root Cause

`scripts/issue-dependencies.mjs` `normalizeIssue` resolves repository identity as:

```js
raw?.repository?.nameWithOwner ?? raw?.repository ?? repositoryFromUrl(raw?.repository_url) ?? repository
```

GitHub REST blocked-by records supply `repository` as an object with `full_name` and no `nameWithOwner`. The object is truthy, so nullish coalescing selects it before `repository_url`. `recordRepository !== repository` then compares that object to the selected `owner/repo` string and throws `IssueDependencyError` with `reasonCode: dependency_dangling` when `dependency: true`.

Issue view for the same blocker can succeed (`repository: null` plus a matching `repository_url`). Upgrade detection and post-apply detection call `readDependencyGraph` → `readBlockedBy` → `normalizeIssue`, so valid same-repository official edges abort discovery.

Existing fixtures in `scripts/__tests__/issue-dependencies.test.mjs` and `scripts/__tests__/sdlc-upgrade.test.mjs` only set `repository_url` and never an expanded REST `repository` object.

### Affected Code

| File | Lines | Role |
|------|-------|------|
| `scripts/issue-dependencies.mjs` | `repositoryFromUrl`, `normalizeIssue` | Identity extraction and same-repo comparison used by `readIssue`, `readBlockedBy`, and `readDependencyGraph` |
| `scripts/sdlc-upgrade.mjs` | `detectIssueDependencyUpgrade`, `applyUpgrade` post-detect | Calls `readDependencyGraph` on listing plus blocked-by payloads; maps thrown errors to `postDetectError` |

### Triggering Conditions

- Official blocked-by REST payload includes `repository` as an object without `nameWithOwner`
- Record otherwise has valid `id`, `number`, and `OPEN`/`CLOSED` state
- Selected repository string matches `repository.full_name` and/or `repository_url`
- Current tests never emit that REST object shape

---

## Fix Strategy

### Approach

Add one private helper next to `repositoryFromUrl` and use it as the only identity source in `normalizeIssue`. Extract a string identity; never return or compare a repository object. Keep existing reason codes, `dependency` flag behavior, and selected-repository fallback.

Insert this exact helper after `repositoryFromUrl`:

```js
function repositoryIdentity(raw) {
  const repo = raw?.repository;
  if (typeof repo === 'string') return repo;
  if (repo && typeof repo === 'object') {
    if (typeof repo.nameWithOwner === 'string') return repo.nameWithOwner;
    if (typeof repo.full_name === 'string') return repo.full_name;
  }
  return repositoryFromUrl(raw?.repository_url);
}
```

Replace the four-operand identity expression in `normalizeIssue` with:

```js
const recordRepository = repositoryIdentity(raw) ?? repository;
```

Precedence is therefore: string `repository`, then `repository.nameWithOwner`, then `repository.full_name`, then `repository_url`, then the selected-repository argument. An object without string `nameWithOwner` or `full_name` falls through to `repository_url`. Do not export `repositoryIdentity` or `normalizeIssue`. Do not change `IssueDependencyError`, pagination, writes, cycle detection, or upgrade item ids.

### Changes

| File | Change | Rationale |
|------|--------|-----------|
| `scripts/issue-dependencies.mjs` | Add `repositoryIdentity`; compare only its string (or fallback) to the selected repository | Fixes the object-vs-string comparison at the single normalization site |
| `scripts/__tests__/issue-dependencies.test.mjs` | Add REST-object, GraphQL, string, URL, and cross-repo regressions through `readBlockedBy` / `readDependencyGraph` | FR5; proves the bug and preserved shapes |
| `scripts/__tests__/sdlc-upgrade.test.mjs` | Extend `dependencyRun` so blocked-by payloads can carry `repository: { full_name }`; add detect + post-apply regressions | FR6; AC5/AC6 |

### Blast Radius

- **Direct impact**: `normalizeIssue` callers — `readIssue`, `readBlockedBy`, `readDependencyGraph({ allIssues })`
- **Indirect impact**: execute, start, status, draft, and upgrade paths that share `scripts/issue-dependencies.mjs`
- **Risk level**: Low — identity still requires exact string equality with the selected repository; reason codes unchanged

---

## Regression Risk

| Risk | Likelihood | Mitigation |
|------|------------|------------|
| Cross-repo blockers start being accepted | Low | AC4 tests for object, GraphQL, string, and URL identities that resolve to another `owner/repo` |
| GraphQL `nameWithOwner` no longer wins | Low | AC2 test uses `{ nameWithOwner }` and still accepts the selected repo |
| Genuine dangling targets are swallowed | Low | Existing dangling/malformed tests stay; do not catch or remap `dependency_dangling` |
| Listing payloads with expanded `repository` still fail | Low | Same helper is used for `allIssues` normalization |

---

## Alternatives Considered

| Option | Description | Why Not Selected |
|--------|-------------|------------------|
| Skip repository comparison when `repository` is an object | Accept any object-shaped repository | Weakens FR4; would accept cross-repo objects |
| Catch `dependency_dangling` in upgrade detect | Hide the throw at the detector | Violates FR8; leaves execute/start/status broken |
| Special-case known issue numbers or PennyScan | Narrow workaround | Violates FR7 |

---

## Validation Checklist

- [ ] Root cause is identified with specific code references
- [ ] Fix is minimal — no unrelated refactoring
- [ ] Blast radius is assessed
- [ ] Regression risks are documented with mitigations
- [ ] Fix follows existing project patterns (per `structure.md`)
