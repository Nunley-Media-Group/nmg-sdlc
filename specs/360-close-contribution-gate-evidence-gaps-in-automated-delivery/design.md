# Root Cause Analysis: Close contribution-gate evidence gaps in automated delivery

**Issue**: #360
**Date**: 2026-09-04
**Status**: Approved
**Author**: NMG
**Related Spec**: specs/125-add-github-actions-contribution-gates-to-project-setup/

---

## Root Cause

`createPullRequest` in `scripts/sdlc-deliver.mjs` writes a three-line body: `Closes #${issue}`, `Spec: ${spec.relative}/`, and `## Verification` with only `\`${spec.relative}/verification-report.md\``. Managed contribution gate v7 (`references/contribution-gate.md`, live `.github/workflows/nmg-sdlc-contribution-gate.yml`) still requires:

- steering alignment (`steeringReferenced`: `\bsteering\b`, `steering/manifest.json`, or `steering/(modules|snippets)/` in current PR+spec text, unless `spec-only`);
- every `relevant` changed path named in tasks.md or verification evidence (`pathMentioned`); `classifyChangedPath` treats `VERSION` and `package.json` as `relevant` (default), while `CHANGELOG.md` is `documentation`;
- specific verification (command+outcome, AC result, path result, or a non-empty changed verification report).

Delivery versioning (`synchronizeVersion` / `publishVersionChanges`) adds those relevant version files after verification, so they are never in spec `tasks.md`. The generated body never mentions `steering` and does not name `VERSION` / `package.json`. Local evaluation does not exist: there is no production export that runs the embedded gate evaluator. The remote job `Validate nmg-sdlc contribution evidence` therefore fails.

`runDeliverUnlocked` classifies that failure as `remediate` / `checks_failed` and emits `NMG_SDLC_REMEDIATION`. `workflows/open-pr/WORKFLOW.md` then requires a non-empty staged git commit; an empty staged diff becomes `--remediation-result human_review`. A pull-request-body-only repair has no tree change, so delivery stops with `reasonCode: human_review` even though no human reviewer requested changes.

No equivalent production body builder or local evaluator exists. Do not fork gate rules; evaluate with the embedded github-script from `references/contribution-gate.md` (same source the exercise tests extract).

### Affected Code

| File | Role |
|------|------|
| `scripts/sdlc-deliver.mjs` | `createPullRequest` (lines 883–895) writes the incomplete body; `writeDeliveryValidation` edits the body without local evaluation; `runDeliverUnlocked` emits remediation for contribution-gate `checks_failed` instead of repairing the body. |
| `workflows/open-pr/WORKFLOW.md` | Empty staged diff → `human_review`. Leave this rule for true code remediations; the controller must intercept body-only contribution evidence so those packets are not emitted. |
| `references/contribution-gate.md` | Canonical v7 evaluator. Must stay byte-identical to the live workflow. Not modified. |
| `scripts/__tests__/exercise-contribution-gate.test.mjs` | Extracts and runs that evaluator. Gate rules stay covered here; do not change them. |
| `scripts/__tests__/sdlc-deliver.test.mjs` | No regression that the created body passes the gate, that incomplete evidence blocks `gh pr create`, or that a body-only gate failure is repaired without `human_review`. |

### Triggering Conditions

- Final delivery diff includes implementation/test paths plus delivery version files classified `relevant`.
- `createPullRequest` uses the three-line body.
- Remote gate is managed version 7.
- The only remediable failure is incomplete PR-body evidence; head SHA is unchanged.
- On-demand remediation requires a non-empty git commit.

These were not caught because delivery tests assert PR create argv and later merge proof, not contribution-gate evaluation of the generated body. Consumer evidence: Nunley-Media-Group/pennyscan issue #133 / PR #146 (do not change pennyscan).

---

## Fix Strategy

### Approach

Add `scripts/contribution-evidence.mjs` (no equivalent production module). Export:

- `evaluateContributionEvidence({ title, body, changedPaths, readText, pathExists })` → `{ ok: boolean, errors: string[] }`
- `buildDeliveryPullRequestBody({ issue, specRelative, changedPaths, verificationReport })` → markdown string

`evaluateContributionEvidence` extracts the fenced YAML github-script from `references/contribution-gate.md` the same way `evaluatorSource()` in `scripts/__tests__/exercise-contribution-gate.test.mjs` does (read the contract, take the ` ```yaml ` fence, slice after `script: |`, dedent 12 spaces). Execute that source with `AsyncFunction('github', 'context', 'core', 'Buffer', source)` and local adapters: `github.rest.pulls.listFiles` returns `changedPaths`; `github.rest.repos.getContent` uses `readText` / `pathExists` on the worktree at HEAD; `context.payload.pull_request` is `{ title, body, number: 1, head: { sha: 'local' } }`. Collect `core.error` messages. `ok` is true iff `errors` is empty. Do not reimplement `classifyChangedPath`, `pathMentioned`, `steeringReferenced`, or `hasSpecificVerification`.

`buildDeliveryPullRequestBody` must produce a body the evaluator accepts for a normal implementation PR:

1. `Closes #${issue}`
2. `Spec: ${specRelative}/`
3. A steering sentence that includes `steering/manifest.json` and `steering/modules/` (satisfies `steeringReferenced` without changing any spec file).
4. `## Verification` containing: one command-or-report line with a pass token (use `` `${specRelative}/verification-report.md` — passed ``, plus any command+outcome already visible in `verificationReport` if present), then every `changedPaths` entry on its own line so `pathMentioned` matches each `relevant` path. Listing documentation paths as well is required (simpler than re-classifying) and does not weaken the gate.

Wire `scripts/sdlc-deliver.mjs`:

- After `publishVersionChanges` and before `createPullRequest` or any `gh pr edit --body-file`, compute `changedPaths` with `git diff --name-only ${base}...HEAD` (existing `command` helper; POSIX paths). Build the body. Run `evaluateContributionEvidence` against `issueData.title`, that body, those paths, and worktree `readText`/`pathExists`. If `ok` is false, `fail(context, 'contribution_evidence_incomplete', errors.join('; '))` and do not call `gh pr create` or `gh pr edit`.
- Change `createPullRequest` to take the already-evaluated `body` string and write that file; delete the three-line template.
- `writeDeliveryValidation` must evaluate the concatenated existing-body-plus-marker payload before `gh pr edit`. Failure uses the same `contribution_evidence_incomplete` reason and does not edit.
- In the observe loop, before building `NMG_SDLC_REMEDIATION` for `checks_failed`: if `pr.headRefOid === namespace.runState.delivery.expectedHead`, there are no unresolved bot threads, and every `failingChecks[].name` is exactly `Validate nmg-sdlc contribution evidence` (or the workflow-qualified form `nmg-sdlc contribution gate / Validate nmg-sdlc contribution evidence`), generate and locally evaluate a repaired body. If evaluation passes and the repaired body differs from `observed.pr.body` after the same trailing-whitespace normalization `writeDeliveryValidation` already uses, `gh pr edit --body-file` with that body, then `continue` the observe loop (FR4). Never `git commit` / `git add` on this path. If evaluation fails, or the repaired body equals the current body, `fail(context, 'contribution_evidence_incomplete', ...)` — do not emit remediation and do not write `human_review`.
- Mixed failing checks (gate plus any other name) still emit `NMG_SDLC_REMEDIATION` as today.
- Human threads, `changes_requested`, and pathless bot threads still `fail(..., 'human_review', ...)` before this intercept.

Do not modify `references/contribution-gate.md`, the live workflow, `classifyPrDeliveryState`, exact-head merge, or the open-pr empty-diff `human_review` rule.

### Steering Alignment

This fix aligns with the registered managed steering runtime: delivery remains `scripts/sdlc-deliver.mjs`; the contribution gate remains the sole evidence contract; workers still never ask; body-only metadata repair stays controller-owned so models are prompted only for code changes.

### Changes

| File | Change | Rationale |
|------|--------|-----------|
| `scripts/contribution-evidence.mjs` | Create. Export `evaluateContributionEvidence` and `buildDeliveryPullRequestBody` as specified. | No production evaluator or body builder exists; keep gate rules in the contract file. |
| `scripts/sdlc-deliver.mjs` | Pre-mutation local eval; pass evaluated body into `createPullRequest`; intercept body-only contribution-gate failures with `gh pr edit` and continue observing; new `reasonCode: contribution_evidence_incomplete`. | Closes AC1–AC3 at the mutation boundary. |
| `scripts/__tests__/sdlc-deliver.test.mjs` | Add the four regressions in tasks.md T002. | Locks AC1–AC4 on the live controller. |
| `scripts/__tests__/contribution-evidence.test.mjs` | Create. Assert the body builder plus evaluator pass a VERSION+package.json+script diff and fail when steering and path names are omitted. | Locks FR1/FR2 without going through GitHub. |

### Blast Radius

- **Direct impact**: new evidence module; PR create/edit paths in `runDeliverUnlocked`.
- **Indirect impact**: `/sdlc-open-pr` no longer receives contribution-gate body-only remediation packets; other `checks_failed` packets unchanged. Gate v7 consumers unchanged.
- **Risk level**: Medium — wrong intercept could swallow a real CI failure or skip local eval.

---

## Regression Risk

| Risk | Likelihood | Mitigation |
|------|------------|------------|
| Gate rules accidentally forked | Med | Evaluator executes the embedded contract script; `exercise-contribution-gate` suite must still pass unchanged. |
| Body-only intercept swallows non-gate CI failures | Med | Intercept only when every failing check name is the contribution-gate job and the head is unchanged. |
| Infinite edit loop | Low | Edit only when the generated body differs; otherwise fail `contribution_evidence_incomplete`. |
| True human review becomes auto-repaired | Low | Human / pathless classification remains before the intercept (AC4 tests). |

---

## Alternatives Considered

| Option | Description | Why Not Selected |
|--------|-------------|------------------|
| Teach open-pr to `gh pr edit` on empty staged diff | Would unstick pennyscan-style failures | Leaves incomplete bodies at create time (AC1/AC2 still fail) and weakens empty-diff `human_review` for real no-op “fixes”. |
| Weaken the gate for version files | Would stop unmatched-path failures | Explicitly out of scope; version files are `relevant` by design. |

---

## Validation Checklist

- [x] Root cause is identified with specific code references
- [x] Fix is minimal — no unrelated refactoring
- [x] Blast radius is assessed
- [x] Regression risks are documented with mitigations
- [x] Fix follows existing project patterns (per `structure.md`)

## Change History

| Issue | Date | Summary |
|-------|------|---------|
| #360 | 2026-09-04 | Initial defect report |
