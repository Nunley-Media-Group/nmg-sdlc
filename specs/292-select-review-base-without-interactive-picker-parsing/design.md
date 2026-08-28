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

The remediation exposed a second lifecycle defect in `startReviewAgainstBase()`. `defaultHerdr.agentPrompt()` already invokes `herdr agent prompt ... --wait`, so status 0 means the host review settled. The helper nevertheless called `waitForWorkerSettlement()`, which required a new future `working` transition after completion. A correctly settled review could therefore become `review_failed` and have its owned pane closed before the workflow handoff prompt ran.

Three fresh controller-owned review workers exposed a third lifecycle defect. The controller sent a waited host-review prompt and expected to send `review-main` as a second prompt after Herdr detected settlement. On the affected Herdr surface, the first prompt returned `agent_prompt_stalled` after about 13 seconds while OMP visibly continued, but detection omitted both the pasted prompt and `Working`. `startReviewAgainstBase()` therefore returned false, execute recorded `review_failed`, and pane cleanup closed the active worker before any artifact or handoff could be written. Agent state and narrow detection text are not authoritative review-completion evidence.

Verification exposed a fourth defect outside the review controller. The installed OMP plugin is locally linked, so Node receives the symlinked script path in `process.argv[1]` while `import.meta.url` identifies the real source file. The direct URL and lexical path equality guards in `sdlc-verify-steering.mjs`, `sdlc-steering.mjs`, and equivalent supported CLIs therefore classify a real CLI invocation as an import and silently skip `main()`.

### Affected Code

| File | Lines / Symbols | Role |
|------|-----------------|------|
| `scripts/sdlc-execute.mjs` | `reviewBranchSelection` | Rejects a remote-only default branch |
| `scripts/sdlc-execute.mjs` | review picker parsers, `completeInteractiveReview`, review call sites | Parses terminal presentation and sends picker keys |
| `scripts/__tests__/sdlc-execute.test.mjs` | review menu fixtures and picker-shape cases | Encodes interactive parser behavior |
| `workflows/review-main/WORKFLOW.md` | preceding-review precondition | Says the host `/review` ran interactively |
| `README.md` | execute review lifecycle | Describes two host `/review` passes |
| `scripts/sdlc-verify-steering.mjs`, `scripts/sdlc-steering.mjs`, equivalent `scripts/*.mjs` entry guards | Direct URL or lexical path equality | Silently skips linked-plugin CLI invocations |

### Triggering Conditions

- The GitHub default branch has only a remote-tracking ref in the clone.
- The branch picker wraps or truncates labels in a narrow pane.
- Execute depends on picker text rather than exact Git refs.

---

## Fix Strategy

### Approach

Replace `reviewBranchSelection()` with `resolveReviewBase(cwd, run)`. Read the default branch through the existing GitHub helper. Check `refs/heads/<name>` using `git show-ref --verify --quiet`; if present return `<name>`. Otherwise check `refs/remotes/origin/<name>` and return `origin/<name>`. If neither exact ref exists, return null. Every subprocess call uses an explicit argument array. Do not list all branches or select a fallback.

Replace `completeInteractiveReview()` and the later two-prompt `startReviewAgainstBase()` sequence with one controller-owned review protocol prompt. The prompt runs the PR-style merge-base host review in the sibling `--kind omp` worker and includes `review-main` artifact/handoff finalization. Normal, retained, and remediation paths resolve the base before constructing this prompt. No review work runs through generic task agents in the controller/main pane.

After submission, a direct non-stall prompt failure returns `review_failed`. An `agent_prompt_stalled` result may still use the existing exact-pasted one-Enter recovery, but missing/narrow detection never proves failure. The controller observes the canonical handoff while the exact owned worker name and pane remain registered. A validated passed handoff must name an existing non-empty canonical review artifact. Worker disappearance without a handoff, malformed evidence, or failed finalization fails closed. A valid handoff is authoritative and does not require an idle state or second future working transition.

Update `workflows/review-main/WORKFLOW.md` so one prompt performs both the host review and finalization. This workflow-bundled edit must follow `skill://skill-creator`. Update README wording to describe handoff-driven deterministic reviews.

Use the existing shared `isCliEntry(import.meta.url)` helper for every supported script CLI guard. The helper returns false when `process.argv[1]` is absent, resolves both paths through `realpathSync` when available, and retains lexical equality only as a fallback for paths that cannot be canonicalized. Imported-module behavior and each CLI's existing `main()` body remain unchanged.

### Interface Contracts

| Interface | Contract |
|-----------|----------|
| `resolveReviewBase(cwd, run)` | Returns exact local default name, exact `origin/<default>`, or null; never another branch |
| `reviewProtocolPrompt(baseRef, finalizationPrompt)` | Produces one sibling-worker prompt containing exact-base host review and artifact/handoff finalization |
| `submitReviewProtocol(...)` | Preserves one-Enter pasted recovery, then waits for a valid review handoff or exact worker disappearance without state/detection guesses |
| `review-main` | Runs the host review and persists its artifact and controller-owned handoff before stopping |
| `isCliEntry(import.meta.url)` | Returns true only when canonical real paths identify the invoked script; returns false for absent argv or unrelated imports |

### Changes

| File | Change | Rationale |
|------|--------|-----------|
| `scripts/sdlc-execute.mjs` | Exact local/remote ref resolution; one review/finalization prompt; owned-worker presence and artifact-aware handoff observation | Removes picker, second-transition, and skipped-detection failures |
| `scripts/__tests__/sdlc-execute.test.mjs` | Cover local, remote-only, retained, remediation, stalled/narrow detection, artifact variants, and hard failures | Proves the complete controller protocol |
| `workflows/review-main/WORKFLOW.md` | Run host review and finalization in one sibling prompt | Makes artifact/handoff creation independent of a second prompt |
| `scripts/__tests__/sdlc-prompt-snippets.test.mjs` | Keep workflow prompt synchronization assertions current | Protects bundled prompt provenance |
| `README.md` | Document one-prompt, handoff-driven GitHub-default reviews | Keeps public behavior accurate |
| Supported guarded `scripts/*.mjs` CLIs | Replace direct URL/lexical equality with shared canonical-real-path entry detection | Prevents silent no-op execution from locally linked OMP installs |
| `scripts/__tests__/sdlc-verification-runtime.test.mjs` | Execute both steering CLIs through a temporary package symlink and import both without execution | Reproduces the installed-path mismatch and proves output/artifact plus import invariants |

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
| Review prompt returns without a handoff | Med | Keep observing the exact owned worker until an artifact-backed handoff or confirmed disappearance |
| Retained or remediation reviews still use the old two-prompt path | Med | Route every review path through the single protocol prompt and assert no `/review` or second prompt |
| Successful `agentPrompt --wait` lacks finalization evidence | Med | Require the canonical handoff even after status 0; never infer completion from prompt status |
| Non-stall failure enters prompt recovery | Med | Guard one-Enter recovery behind `isPromptStalled`; assert true failure performs no recovery |
| Stalled prompt detection omits active work | High | Ignore idle/working guesses for review lifecycle; observe the owned worker and canonical handoff |
| Passed handoff omits durable review output | Med | Require the canonical non-empty review artifact named by the passed handoff |
| Worker exits before finalization | Med | Treat exact worker disappearance without a valid handoff as `process_lost` |
| Deleted parser removal affects non-review prompt recovery | Low | Delete only review-picker helpers; preserve generic prompt-stall detection |
| Linked install silently skips another supported CLI | Med | Audit all script entry guards and route every equivalent raw comparison through the shared helper |
| Imported steering module runs unexpectedly | Low | Treat absent argv as non-entry and import both affected modules in a child process before CLI execution |

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
