# Root Cause Analysis: Fix PR-Dependent Verification Deadlocking Delivery

**Issue**: #171
**Date**: 2026-08-14
**Status**: Approved
**Author**: Rich Nunley

---

## Root Cause

The verification report has one terminal status dimension. `skills/verify-code/references/report-format.md:38` documents only Pass, Partial, and Fail even though verification also uses Incomplete, and it has no machine state that says every local obligation passed while a bounded PR-only obligation remains. Consequently, a legitimate missing check run and a genuine local failure both collapse into non-Pass output.

`skills/open-pr/SKILL.md:45-54` then requires the issue-scope marker, human scope block, `Implementation Status: Pass`, and all-pass steering gates before any delivery preparation or PR creation. Its only post-create workflow, `skills/open-pr/references/ci-monitoring.md:36-74`, assumes an ordinary ready PR already exists and can only poll toward merge or stop. It cannot create a controlled draft, gather the missing evidence, rerun verification, or revalidate a new head after committing the report.

The read-only consumer repeats the same binary assumption. `scripts/sdlc-status.mjs:193-236` parses only Pass, Partial, and Fail and runs freshness checks only for Pass. `scripts/sdlc-status.mjs:910-1008` recommends `open-pr` only for a current Pass report; every other implemented branch routes back to `verify-code`. The three consumers therefore have no shared representation or transition for the state between locally complete implementation and PR-validated delivery.

Existing contracts pin ordinary delivery safety but not this boundary. `scripts/__tests__/open-pr-delivery-contract.test.mjs` asserts staging, versioning, safe rebase/push, and the removed compatibility skill, while status tests cover Pass freshness and generic non-Pass behavior. No deterministic fixture proves that only explicitly qualified PR-only evidence may enter a draft path, that exact head-SHA evidence is captured, or that a report-update push triggers a second final-SHA check.

### Relevant Spec Context

| Spec | Ranking reasons | Constraint carried forward |
|------|-----------------|----------------------------|
| `specs/feature-open-pr-skill/` | Strong match on `skills/open-pr/**`, required checks, mergeability, and delivery ownership | Preserve scope/version/commit/rebase/push preparation and the existing explicit merge path. |
| `specs/feature-verify-code-skill/` | Strong match on verification-report status, steering gates, and report templates | A local failure or incomplete gate must continue to prevent Pass and delivery. |
| `specs/feature-add-lifecycle-status-command-for-active-sdlc-work/` | Strong match on `scripts/sdlc-status.mjs`, report freshness, and next-action inference | Status remains read-only, conservative, schema-versioned, and commit-proven. |

Spec Context:
- activeSpec: `specs/bug-fix-pr-dependent-verification-deadlocking-delivery/`
- relatedSpecs: `specs/feature-open-pr-skill/`, `specs/feature-verify-code-skill/`, `specs/feature-add-lifecycle-status-command-for-active-sdlc-work/`
- metadataOnlyCount: remaining canonical spec directories
- loadedSpecCount: 3 related specs plus the active defect spec
- gaps: none

### Affected Code

| File | Lines | Role |
|------|-------|------|
| `skills/verify-code/SKILL.md` | 42-199 | Aggregates local acceptance, tests, gates, and report output without a qualified PR-only transition. |
| `skills/verify-code/references/report-format.md` | 7-107 | Defines report status, scope marker, GitHub comment, and machine evidence consumed downstream. |
| `skills/verify-code/checklists/report-template.md` | 1-236 | Provides the local report scaffold but has no local-vs-delivery validation split. |
| `skills/open-pr/SKILL.md` | 39-98 | Rejects any non-Pass report before delivery and creates only a normal PR. |
| `skills/open-pr/references/pr-body.md` | 1-125 | Defines ordinary PR content and creation but no draft-validation marker or reuse boundary. |
| `skills/open-pr/references/ci-monitoring.md` | 1-74 | Polls checks only after ordinary creation and proceeds directly toward merge. |
| `skills/status/SKILL.md` | 8-69 | Delegates lifecycle inference without documenting PR-dependent readiness. |
| `scripts/sdlc-status.mjs` | 193-290, 675-728, 888-1100 | Parses report status, collects PR/check state, infers stages, and renders status. |
| `scripts/__tests__/sdlc-status.test.mjs` | 135-220, 415-529 | Pins Pass freshness and lifecycle inference but lacks pending-delivery and draft fixtures. |
| `scripts/__tests__/open-pr-delivery-contract.test.mjs` | 21-60 | Pins ordinary delivery but lacks the controlled draft/reverification/final-SHA path. |
| `README.md` | workflow and skill reference sections | Publicly describes verification and PR delivery without the two-phase boundary. |

### Triggering Conditions

- Every local implementation, active scope, regression, test, and applicable steering-gate obligation is satisfied.
- At least one acceptance criterion requires a named GitHub check run, required-check context, or merge-blocking observation tied to a pull request.
- No pull request exists yet, so that evidence cannot be collected honestly.
- `verify-code` returns a generic non-Pass status and `open-pr` accepts only Pass before it creates a PR.

---

## Fix Strategy

### Approach

Introduce one shared, deterministic verification-readiness contract rather than adding a prose exception to `open-pr`. A new zero-dependency helper validates the report's existing issue-scope marker together with one bounded `nmg-sdlc-pr-readiness` JSON marker. The marker has schema version 1 and exact states `pr_evidence_pending` or `pr_evidence_satisfied`; unknown keys, duplicate markers, invalid scope, incomplete local evidence, failed/incomplete gates, or unknown evidence kinds fail closed.

The pending state may contain only the allowlisted GitHub-only kinds `required_check`, `check_run`, and `merge_blocking`. Each check item names the exact evidence, records `event: pull_request` provenance, and maps delivery acceptance criteria; merge-blocking evidence is intrinsically PR-only. The satisfied state additionally records the observed 40-character head SHA, conclusion, evidence URL, and kind-specific merge-state observations. Marker arrays and strings are bounded, identifiers must belong to the active delivery slice, and no command, arbitrary exception name, deferred-work flag, push-capable event, or unknown event is accepted.

`verify-code` remains the producer. When all local obligations pass and only valid PR-only evidence is unavailable, it emits human status `PR Evidence Pending`, the exact marker, and a separate local-pass/delivery-pending summary. After a draft exists, it gathers evidence for the exact draft head and may emit Pass plus `pr_evidence_satisfied`. Generic Partial, Incomplete, and Fail reports never receive a qualifying marker.

`open-pr` gains a conditional two-phase path. Ordinary current Pass evidence follows the existing path unchanged. Valid pending evidence still runs the complete existing delivery preparation, then creates or reuses an exact matching draft PR, captures exact-head evidence, reruns verification, commits and safely pushes any report update, rechecks all required evidence for the resulting final head, records a final-delivery marker in the PR body without changing the head, and only then runs `gh pr ready`. Any gap stops with the draft and branch preserved. After readiness, the current automated-review, CI, `mergeStateStatus == CLEAN`, merge-choice, and cleanup gates retain ownership.

`status` imports the same helper, applies existing commit-proven freshness to both Pass and valid pending reports, collects draft/head metadata, and exposes a conservative `delivery-validation-pending` stage. It lists `local verification` as complete and `PR evidence` as missing, recommends `open-pr`, and never upgrades the state from generic prose.

### Machine-Readable Contract

```markdown
### Implementation Status: PR Evidence Pending

<!-- nmg-sdlc-pr-readiness: {"schemaVersion":1,"state":"pr_evidence_pending","issueNumber":171,"specPath":"specs/bug-fix-pr-dependent-verification-deadlocking-delivery","local":{"acceptanceCriteria":["AC1"],"functionalRequirements":["FR1"],"tasks":["T001"],"scenarios":["SCN001"],"regression":{"acceptanceCriteria":[],"functionalRequirements":[],"scenarios":[]},"tests":"pass","steeringGates":"pass"},"pendingEvidence":[{"kind":"required_check","name":"nmg-sdlc-contribution-gate","event":"pull_request","acceptanceCriteria":["AC6"]}]} -->
```

The example is structural only. The producer must emit the exact normalized active delivery and regression identifiers rather than the abbreviated arrays above.

### Controlled Draft State Transitions

```text
ordinary current Pass ───────────────────────────────▶ ordinary PR creation

valid pr_evidence_pending
  └─ existing scope/version/commit/rebase/push gates
       └─ create or reuse exact draft PR at H1
            └─ collect allowlisted PR evidence for H1
                 └─ rerun verify-code → Pass / satisfied marker for H1
                      └─ commit + safe-push report update → H2
                           └─ recheck required evidence for exact H2
                                └─ record final H2 evidence in PR body
                                     └─ gh pr ready
                                          └─ existing review/CI/CLEAN/merge gates

any mismatch, absence, failure, cancellation, timeout, stale SHA, or malformed marker
  └─ stop; preserve feature branch + draft PR; no ready/merge/delete/protection mutation
```

### Changes

| File | Change | Rationale |
|------|--------|-----------|
| `references/pr-dependent-verification.md` | Create through `$skill-creator`; define shared marker schema, allowed evidence, result states, bounds, freshness, and consumer behavior. | Gives all three lifecycle consumers one fail-closed contract instead of duplicated prose. |
| `scripts/verification-readiness.mjs` | Create a zero-dependency parser/validator with a JSON CLI and reusable exports. | Makes marker classification deterministic and fixture-testable. |
| `skills/verify-code/SKILL.md`, `skills/verify-code/references/report-format.md`, `skills/verify-code/checklists/report-template.md` | Route through `$skill-creator`; add pending/satisfied production, local-vs-delivery summaries, and exact PR evidence capture. | Lets verification describe the truthful intermediate state and later produce Pass evidence. |
| `skills/open-pr/SKILL.md`, `skills/open-pr/references/pr-body.md`, `skills/open-pr/references/ci-monitoring.md`, `skills/open-pr/references/pr-dependent-delivery.md` | Route through `$skill-creator`; validate pending readiness, create/reuse the controlled draft, reverify, push, final-SHA check, record evidence, and mark ready. | Breaks the deadlock without relaxing ordinary delivery or merge safety. |
| `skills/status/SKILL.md`, `scripts/sdlc-status.mjs` | Route the skill edit through `$skill-creator`; import the helper, collect draft/head fields, infer/render the pending-delivery stage. | Keeps diagnostic output consistent and read-only. |
| `scripts/__tests__/verification-readiness.test.mjs`, `scripts/__tests__/sdlc-status.test.mjs`, `scripts/__tests__/open-pr-delivery-contract.test.mjs`, `scripts/__tests__/exercise-pr-dependent-delivery.test.mjs` | Add marker validation, status inference, ordinary-path preservation, draft flow, final-SHA, and failure-preservation coverage. | Proves the exact deadlock and every required regression boundary deterministically. |
| `README.md`, `scripts/skill-inventory.baseline.json` | Document the controlled transition and refresh inventory only for intentional contract drift. | Keeps public workflow and packaged surface truthful. |

### Blast Radius

- **Direct impact**: verification-report generation, one shared parser, open-pr creation/monitoring, lifecycle status inference, and their deterministic tests.
- **Indirect impact**: consumer projects may observe the additive `delivery-validation-pending` status stage and draft PR metadata; ordinary Pass delivery remains unchanged.
- **Unchanged paths**: issue selection, branch creation, specification, implementation, scope resolution, version classification, safe rebase/push, CodeRabbit thread cleanup, final merge choice, and repository protection configuration.
- **Risk level**: Medium. The flow adds remote state transitions, but every transition has exact identity/head checks and a preservation-first failure path.

---

## Regression Risk

| Risk | Likelihood | Mitigation |
|------|------------|------------|
| Generic Partial or failed local work is accepted as draft-ready. | Low after validation | Require the exact marker, exact scope, complete local identifier sets, `tests: pass`, `steeringGates: pass`, allowlisted evidence kinds, and no failed/incomplete human gate rows. |
| Evidence from an earlier head makes a later pushed commit ready. | Medium without two checkpoints | Pin H1 during reverification, then independently require all named checks and final-delivery evidence for H2 before `gh pr ready`. |
| An unrelated or pre-existing PR is reused. | Low | Require open draft state, exact repository/base/head branch, active issue closing reference, and exact pending marker before reuse. |
| A failed validation deletes work or advances review state. | Low | Every failure path forbids ready, merge, checkout, branch deletion, and protection changes; preserve the draft and feature branch. |
| Ordinary Pass delivery regresses into draft mode. | Low | Keep the no-marker Pass path unchanged and pin it with companion fixtures and existing open-pr contracts. |
| Status reports full verification too early. | Low | Add a distinct stage/artifact vocabulary and use the shared validator plus existing commit freshness checks. |
| Prompt contracts drift between three consumers. | Medium | Centralize the schema and result table in one shared reference/helper and add static consumer-import/pointer tests. |

---

## Alternatives Considered

| Option | Description | Why Not Selected |
|--------|-------------|------------------|
| Accept any Partial report in `open-pr` | Relax the precondition and create a PR. | Conflates genuine local failures with PR-only evidence and violates fail-closed delivery. |
| Let users manually create a PR outside the workflow | Preserve existing contracts and document a workaround. | Breaks lifecycle traceability, safe preparation ownership, and deterministic recovery. |
| Create a normal ready PR immediately | Open a PR and collect evidence in the existing monitoring step. | Exposes unverified work to review/merge automation before the missing acceptance evidence is satisfied. |
| Keep the readiness state only in prose | Add a named report heading without a parser. | Lets arbitrary text bypass delivery and guarantees consumer drift. |
| Use a controlled draft plus shared machine contract | Separate local completeness from delivery validation and advance only on exact evidence. | Selected because it breaks the cycle while preserving every existing safety boundary. |

---

## Change History

| Issue | Date | Summary |
|-------|------|---------|
| #171 | 2026-08-14 | Initial defect design |

---

## Validation Checklist

- [x] Root cause identifies the three inconsistent consumers and the missing transition
- [x] Fix uses one deterministic machine contract rather than a prose exception
- [x] Qualifying evidence kinds, bounds, scope checks, local-pass requirements, and failure states are explicit
- [x] Controlled draft creation preserves existing delivery preparation and ordinary Pass behavior
- [x] H1 reverification and H2 final-SHA checks prevent stale evidence from advancing readiness
- [x] Review, mergeability, CLEAN-state, merge-choice, and failure-preservation boundaries remain owned by existing stages
- [x] Related spec context is bounded to the three directly affected feature contracts
- [x] Skill-bundled changes are explicitly routed through `$skill-creator`
