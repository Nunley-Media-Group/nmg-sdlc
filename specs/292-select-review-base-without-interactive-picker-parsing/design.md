# Root Cause Analysis: Select review base without interactive picker parsing

**Issue**: #292
**Date**: 2026-08-27
**Status**: Approved
**Author**: NMG
**Related Spec**: specs/291-enforce-one-controller-writer-and-close-stale-workers/
---

## Root Cause

`reviewBranchSelection()` in `scripts/sdlc-execute.mjs` reads the GitHub default branch and then accepts it only when the exact short name appears in `git branch -a --format=%(refname:short)`. A standard fresh clone may expose only `origin/main`, so a valid default branch is rejected before review starts.

For accepted local branches, `completeInteractiveReview()` submits `/review`, observes terminal-rendered mode and branch pickers, parses their text, calculates arrow-key navigation, and sends keys through Herdr. The parser depends on complete unwrapped labels and footer structure. Narrow panes and long branch names alter presentation without changing repository state, so presentation parsing incorrectly controls lifecycle correctness.

The installed OMP `/review` branch mode itself uses UI selectors and has no explicit base-ref argument. Therefore execute cannot make branch selection deterministic by changing slash-command arguments; it must resolve the ref from Git/GitHub evidence and submit the existing repository review request directly with that base.

### Affected Code

| File | Lines / Symbols | Role |
|------|-----------------|------|
| `scripts/sdlc-execute.mjs` | `reviewBranchSelection` | Rejects a remote-only default branch |
| `scripts/sdlc-execute.mjs` | review picker parsers, `completeInteractiveReview`, review call sites | Parses terminal presentation and sends picker keys |
| `scripts/__tests__/sdlc-execute.test.mjs` | review menu fixtures and picker-shape cases | Encodes interactive parser behavior |
| `workflows/review-main/WORKFLOW.md` | preceding-review precondition | Says the host `/review` ran interactively |
| `README.md` | execute review lifecycle | Describes two host `/review` passes |

### Triggering Conditions

- The GitHub default branch has only a remote-tracking ref in the clone.
- The branch picker wraps or truncates labels in a narrow pane.
- Execute depends on picker text rather than exact Git refs.

---

## Fix Strategy

### Approach

Replace `reviewBranchSelection()` with `resolveReviewBase(cwd, run)`. Read the default branch through the existing GitHub helper. Check `refs/heads/<name>` using `git show-ref --verify --quiet`; if present return `<name>`. Otherwise check `refs/remotes/origin/<name>` and return `origin/<name>`. If neither exact ref exists, return null. Every subprocess call uses an explicit argument array. Do not list all branches or select a fallback.

Replace `completeInteractiveReview()` and its rendered-screen parser/key-navigation helpers with `startReviewAgainstBase(herdr, agentName, baseRef)`. It submits the repository's existing review request contract directly, adding only the resolved base ref and PR-style merge-base comparison instruction. It waits for the worker to enter working state and settle using the existing unbounded Herdr waits. It never submits `/review`, reads picker presentation, or sends picker keys. New, remediation, and retained review call sites use the same helper. Review findings, three-reviewer file assignment, scoring, persistence through `review-main`, and handoff validation remain unchanged.

Update `workflows/review-main/WORKFLOW.md` so its precondition refers to the immediately preceding controller-started review against the resolved base rather than an interactive `/review`. This workflow-bundled edit must follow `skill://skill-creator`. Update README wording to describe deterministic reviews against the GitHub default ref.

### Interface Contracts

| Interface | Contract |
|-----------|----------|
| `resolveReviewBase(cwd, run)` | Returns exact local default name, exact `origin/<default>`, or null; never another branch |
| `startReviewAgainstBase(herdr, agentName, baseRef)` | Starts the existing review request directly and waits; no picker interaction |
| `review-main` precondition | Persists the immediately preceding controller-started review response |

### Changes

| File | Change | Rationale |
|------|--------|-----------|
| `scripts/sdlc-execute.mjs` | Exact local/remote ref resolution; deterministic review start; delete picker parsing/navigation | Removes both root causes |
| `scripts/__tests__/sdlc-execute.test.mjs` | Replace picker-shape fixtures with local, remote-only, width-independent, retained, remediation, and missing-ref cases | Proves AC1–AC3 |
| `workflows/review-main/WORKFLOW.md` | Align preceding-review wording with noninteractive controller start | Keeps executable contract truthful |
| `scripts/__tests__/sdlc-prompt-snippets.test.mjs` | Update workflow prompt synchronization assertion if affected | Protects bundled prompt provenance |
| `README.md` | Document deterministic GitHub-default review base | Public workflow behavior changed |

### Blast Radius

- **Direct impact**: review1/review2 start, retained review recovery, review remediation, review test fixtures.
- **Indirect impact**: `review-main` prompt provenance and public execute documentation.
- **Risk level**: Medium — review orchestration changes, but handoff validation and downstream fix steps do not.

---

## Regression Risk

| Risk | Likelihood | Mitigation |
|------|------------|------------|
| Local default branch stops working | Low | Prefer exact local ref and cover it separately from remote-only resolution |
| Remote name differs from `origin` | Low | Requirement is specifically `origin/<default>`; do not guess other remotes |
| Review prompt settles without a handoff | Med | Preserve existing settlement observation and review-main prompt/handoff validation |
| Retained or remediation reviews still use old UI path | Med | Route every review start call site through one helper and assert no `/review` prompt/send-keys |
| Deleted parser removal affects non-review prompt recovery | Low | Delete only review-picker helpers; preserve generic prompt-stall detection |

---

## Alternatives Considered

| Option | Description | Why Not Selected |
|--------|-------------|------------------|
| Add `origin/main` to picker candidates | Continue interactive selection | Terminal rendering and send-key sequencing remain correctness dependencies |
| Create a local default branch | Mutate refs before review | Unnecessary repository mutation and can conflict with user branch state |
| Invoke `/review <base>` | Treat base as slash-command argument | Installed OMP uses non-PR arguments as review focus and still opens UI branch selection |
| Parse ANSI/width-aware picker output | Make presentation parser more complex | UI layout is not an authoritative repository contract |

---

## Validation Checklist

Before moving to TASKS phase:

- [x] Root cause is identified with specific code references
- [x] Fix removes presentation parsing rather than patching it
- [x] Blast radius is assessed
- [x] Regression risks are documented with mitigations
- [x] Fix follows existing project patterns (per `structure.md`)
