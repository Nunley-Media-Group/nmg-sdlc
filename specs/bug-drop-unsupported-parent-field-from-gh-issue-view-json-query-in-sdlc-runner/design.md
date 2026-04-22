# Root Cause Analysis: Drop unsupported `parent` field from `gh issue view` JSON query in sdlc-runner

**Issue**: #91
**Date**: 2026-04-21
**Status**: Draft
**Author**: Rich Nunley

---

## Root Cause

`selectNextIssueFromMilestone` in `scripts/sdlc-runner.mjs` requests `parent` as one of the fields in its `gh issue view --json` call:

```js
const raw = ghRunner(
  `issue view ${n} --json number,state,body,parent,closedByPullRequestsReferences`
);
```

The `parent` field is **not** in `gh`'s supported JSON field list for issues on currently-shipping releases (confirmed on `gh` 2.86.0). When requested, `gh` rejects the command up front with `Unknown JSON field: "parent"` and a list of supported fields (assignees, author, body, closed, …, url) — it never returns JSON. The surrounding `try/catch` block treats this as a generic fetch failure, logs `Warning: could not fetch issue #{n} details:`, stores a fallback stub in `details`, and adds the issue number to `fetchFailed`.

Because every candidate is requested the same way, every candidate fails the same way. The later loop at ~line 1608 turns each entry in `fetchFailed` into `blockedIssues.push({ issue: n, blockers: [], reason: 'fetch-failed' })`, `ready` stays empty, and `selectNextIssueFromMilestone` returns `{ issue: null, … }`. The caller interprets "null issue + every candidate in `blockedIssues`" as `FAILURE LOOP DETECTED: all issues blocked` (line 1404) and exits non-zero before any SDLC work begins.

The guard that consumes `parent` one section later is already tolerant of the field being absent:

```js
if (d.parent && typeof d.parent.number === 'number' && d.parent.number !== n) {
  deps.add(d.parent.number);
}
```

So removing `parent` from the `--json` list is safe — the guard treats absent/undefined `parent` as "no parent link," which is exactly the current intended behaviour on `gh` versions that do not expose the field.

### Affected Code

| File | Lines | Role |
|------|-------|------|
| `scripts/sdlc-runner.mjs` | 1579 | Command string that requests `parent` in the `--json` field list — the only site that needs to change. |
| `scripts/sdlc-runner.mjs` | 1584 | Fallback stub inserted on fetch failure; shape includes `parent: null`. Safe to leave — the downstream guard treats absent and `null` identically. |
| `scripts/sdlc-runner.mjs` | 1597–1599 | Parent-link dep-resolution guard; already null-safe, no change needed. |

### Triggering Conditions

- The installed `gh` CLI does not expose `parent` on `gh issue view --json`. This covers `gh` 2.86.0 and earlier stable releases (the `parent` field was gated behind sub-issue preview support that has shipped in only a narrow range of `gh` builds).
- `scripts/sdlc-runner.mjs` runs against a milestone with at least one candidate issue — i.e., a real SDLC cycle, not a no-op early-exit.
- The bug wasn't caught before because the runner unit tests (`scripts/__tests__/select-next-issue-from-milestone.test.mjs`) inject a mock `ghRunner` that always accepts `parent` and returns a synthetic JSON payload. The mock never exercises the real `gh` CLI's field-name validation, so the incompatibility stayed invisible to CI.

---

## Fix Strategy

### Approach

Delete `parent,` from the `--json` field list at `scripts/sdlc-runner.mjs:1579`. Nothing else changes. The existing `if (d.parent && typeof d.parent.number === 'number' …)` guard continues to work — on current `gh` the response no longer carries `parent`, so `d.parent` is `undefined` and the guard short-circuits exactly as it does on today's failure path. If a future `gh` reintroduces `parent` under a supported name we can add it back behind a capability probe (tracked as an out-of-scope follow-up).

This is the minimal correct fix: it addresses the root cause (an unsupported field is being requested), leaves body cross-ref resolution (`Depends on: #N` / `Blocks: #N`) untouched, and preserves every other field the surrounding code reads.

### Changes

| File | Change | Rationale |
|------|--------|-----------|
| `scripts/sdlc-runner.mjs` (line 1579) | Change `--json number,state,body,parent,closedByPullRequestsReferences` to `--json number,state,body,closedByPullRequestsReferences`. | Removes the unsupported field name from the request so `gh` returns a valid JSON payload; the downstream guard already handles the now-absent `parent` as a no-parent-link signal. |
| `scripts/__tests__/select-next-issue-from-milestone.test.mjs` | Add a regression test that (a) asserts the issued `issue view` command does NOT contain `parent`, and (b) uses a mock `ghRunner` that rejects any `--json` query containing `parent` (mimicking `gh` 2.86.0) to prove the runner no longer emits it. | Locks in the fix so a future refactor that re-adds `parent` to the field list is caught at CI, without requiring a real `gh` binary in the test environment. |

### Blast Radius

- **Direct impact**: `selectNextIssueFromMilestone` — one command string is shortened; one fallback stub retains a `parent: null` key that is never read when `d.parent` is absent (harmless).
- **Indirect impact**: Callers of `selectNextIssueFromMilestone` (`selectNextReadyIssue`, `runStep`, `FAILURE LOOP DETECTED` sentinel path) — all consume the same `{ issue, blockedIssues }` shape; nothing downstream inspects `parent`.
- **Parent-link dep blocking**: On `gh` versions without `parent`, behaviour is unchanged relative to the current intent — body cross-refs (`Depends on:` / `Blocks:`) remain the in-scope dep signal, and parent-link resolution naturally degrades to "no link available." On `gh` versions that do expose `parent` (none currently shipping), parent-link blocking is temporarily disabled until a capability probe is added; this is accepted as out-of-scope per the issue.
- **Risk level**: **Low** — one field removed from one command string; the code path that consumes the field is already null-safe.

---

## Regression Risk

| Risk | Likelihood | Mitigation |
|------|------------|------------|
| A future refactor re-adds `parent` to the `--json` list | Medium (the field is named in the adjacent doc comment on line 1534 and in the fallback stub on line 1584, both of which invite re-introduction) | Regression test asserts the emitted command string excludes `parent`, AND uses a mock `ghRunner` that throws on `parent` in the query — both fail fast if the field is re-added. |
| Parent-link dep blocking silently becomes a no-op on `gh` versions that do expose `parent` | Low (no currently-shipping `gh` version exposes it) | Explicitly listed in Out of Scope as a follow-up; the capability probe or GraphQL fallback will restore the behaviour. |
| Existing body-cross-ref dep resolution regresses | Very Low | AC3 covers this; the unchanged code path still reads `body` from the same response. |
| The `parent: null` key left in the fallback stub confuses future readers | Low | The key is inert — `d.parent` is falsy, the guard short-circuits. Leaving it in avoids a second edit to the stub and preserves diff minimality. |

---

## Alternatives Considered

| Option | Description | Why Not Selected |
|--------|-------------|------------------|
| Capability probe at startup | Run `gh issue view <any-issue> --json parent` once, cache whether the field is supported, and include it in the query only when supported. | Adds a network round-trip, a cached state variable, and a branch in the command builder — significant for what is essentially a field-list one-liner. Issue explicitly marks this as a follow-up enhancement. |
| GraphQL `subIssuesOf` / REST fallback | Replace the REST-style `gh issue view --json parent` path with a GraphQL query that resolves sub-issue parents. | Parent-link dep blocking currently yields zero active links in the in-tree milestones (all issues are leaf), so the fallback would add code without behavioural upside. Also flagged by the issue as a separate follow-up. |
| Remove parent-link dep blocking entirely | Delete the `if (d.parent && …)` guard too. | Leaves the door closed for future `gh` versions that do expose `parent` under a supported name — needlessly destructive. The guard is already free (no runtime cost when `d.parent` is absent). |

---

## Validation Checklist

Before moving to TASKS phase:

- [x] Root cause is identified with specific code references (`scripts/sdlc-runner.mjs:1579`)
- [x] Fix is minimal — no unrelated refactoring, no capability-probe scope creep
- [x] Blast radius is assessed (one command string, one call site, null-safe downstream guard)
- [x] Regression risks are documented with mitigations (regression test locks in the field-list shape)
- [x] Fix follows existing project patterns (per `structure.md` — zero-dep Node.js, cross-platform string change)
