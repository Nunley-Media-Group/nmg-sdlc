---
name: sdlc-verify-code
description: "Verify implementation against the approved spec"
---


# Verify Code

Inline architecture and acceptance review by the architecture-reviewer agent. No user questions. No extra task delegation for the review itself.

## Spec and Context Load

1. Resolve N from arg or current branch name (^\d+-).

2. A leftover `spike` label is not a skip or fail reason. Verify the approved `specs/{N}-{slug}/` package.

3. Resolve spec dir: glob "specs/", first dir whose basename starts with "N-" (leading number match).

   Read frontmatter **Issue**: #N and **Status**: Approved from requirements.md design.md tasks.md feature.gherkin (as applicable).

   Any mismatch or missing Approved → failed handoff reasonCode:"spec_not_approved" intervention:true step:"verify"

4. Load and validate `steering/manifest.json` and its registered modules/snippets/extensions. `steering_manifest_missing` or any invalid runtime is an `Incomplete` ceiling. Do not fall back to `steering/product.md`, `steering/tech.md`, or `steering/structure.md`.

5. Read the verification report template from references/report-format.md and checklists/* for the architecture areas.

Before running verification, modifying code, or generating a report, bind the durable verify owner:

```bash
node "${NMG_SDLC_PLUGIN_ROOT}/scripts/sdlc-safe-recoveries.mjs" bind --issue N --step verify --spec specs/N-SLUG [--controller-run-id R]
```

Use the exact worker-header controller run id; omit it only for standalone work. Require `NMG_SDLC_PUBLICATION` with `passed:true`. Owner or scope failure is intervention and stops before work. The lease is only a mutex: fresh leases and sessions reuse the existing incomplete project/issue/branch/verify owner, and standalone verification never creates execute `run.json`.

When a report already exists, after binding the verify owner and before publication-only finalization, invoke the bounded recovery classifier once:

```bash
node "${NMG_SDLC_PLUGIN_ROOT}/scripts/sdlc-recover-verification.mjs" --issue N --spec specs/N-SLUG [--controller-run-id R]
```

Use the exact worker-header controller run id, or omit it for standalone verification. Parse JSON even on nonzero exit. `{recover:true,kind:"changed_head_failed_report"}` is a one-use authorization after a clean published issue-owned repair changes the HEAD of a prior Fail/Partial report and matching artifact; the classifier archives their exact original bytes and consumes the A-to-B recheck before validation. `{recover:true}` without that kind is the existing same-head external-only Incomplete recheck. Both authorize one registered gate at the current HEAD; neither is a passing result.

If recovery is not authorized, run Finalize Verification once without changing report bytes or reposting its issue comment, then stop. `not_applicable` permits ordinary publication-only recovery only when current report/artifact still match current HEAD. An already consumed changed-head recheck, stale/unsafe evidence, or a new failed gate remains an intervention; do not redispatch the same repair or replay a gate. An Incomplete report with an exact-head required `builtin.command` failure remains mixed actionable evidence under the original finalizer contract.

After authorized recovery, run the registered steering gate once for that exact issue/spec/HEAD and owner. Read its fresh canonical artifact. If coverage is not complete or any applicable required validation is not passed, preserve the archived old evidence and the new failure, run Finalize Verification once for an intervention-bearing handoff, and stop. Only complete, all-required-pass fresh evidence permits the normal acceptance review, accurate replacement report, and normal finalizer. Never call this classifier a second time in the same invocation.

## Deterministic Steering Gate

Before prose review, run:

```bash
node "${NMG_SDLC_PLUGIN_ROOT}/scripts/sdlc-verify-steering.mjs" --project . --issue N --spec specs/N-SLUG --base main [--controller-run-id R]
```

When the worker header provides a non-empty controller run id, replace the bracketed option with `--controller-run-id R` using that exact value. Omit the option only for standalone verification.

Read `.omp/sdlc/verification/N.json`. The same runner is mandatory for interactive and execute verification. Use its `coverage` summary to distinguish zero declarations from missing evidence: `declared: 0`, `recorded: 0`, and `complete: true` is a complete gate with no project-specific validations, while `complete: false` means declared results are missing, duplicated, or unknown and caps overall status at `Incomplete`. A required `failed` result caps status at `Fail`; required `incomplete`, runtime/provider/config errors, crashes, explicit cancellation, confirmed process loss, malformed output, stale identities, or applicable provider self-skips cap it at `Incomplete`. `Pass` and `PR Evidence Pending` are forbidden unless coverage is complete and every applicable required result passed. Never infer success from elapsed time.

## Run Reviews Inline

- Acceptance: for each AC in requirements (delivery slice), locate code, mark Pass/Fail/Partial/Incomplete. Use grep/read/edit as needed for evidence.

- Tasks: confirm listed tasks produced the files/changes expected.

- Architecture (inline, this is the architecture-reviewer):
  Load each checklist:
  - solid-principles.md
  - security.md
  - performance.md
  - testability.md
  - error-handling.md
  Score 1-5, note findings. Average reported.

- Test / BDD: run the test command from tech.md (or relevant subset). For plugin changes (detect via git diff on workflows/ and agents/):
  Use updated exercise instructions (see exercise-testing.md): from a disposable project run `node "${NMG_SDLC_PLUGIN_ROOT}/scripts/exercise-omp.mjs" --cwd <project> -- /sdlc-NAME [args]` with this extension loaded by the harness. Do not use `omp --print --load`. Preserve the prior dry-run contract and use state-based termination without a wall-clock deadline. Record output vs ACs.

- PR-only obligations: if present use the readiness rules from references (PR Evidence Pending allowed only when all local pass).

  Fix findings where safe and local: apply the smallest fix, resolving and reading `skill://skill-creator` before any skill-bundled edit. Re-run affected verification after fixes. Unfixable findings remain in the report.

## Generate and Persist Report

Use references/report-format.md + checklists/report-template.md to build:

specs/N-SLUG/verification-report.md

With sections: executive summary, deterministic steering artifact and ceiling, AC checklist with evidence, architecture scores + findings, test results, real smoke lifecycle evidence when required, fixes, remaining issues, overall status (Pass | PR Evidence Pending | Partial | Fail | Incomplete)

Write the file using write tool or node cat.

Then:
```bash
gh issue comment N --body "$(cat specs/N-SLUG/verification-report.md | head -c 20000)"
```

## Finalize Verification

The controller owns report publication and the verify handoff. Never write handoff JSON, commit, or push directly.

Run:

```bash
node "${NMG_SDLC_PLUGIN_ROOT}/scripts/sdlc-finalize-verification.mjs" --issue N --spec specs/N-SLUG [--controller-run-id R]
```

When the worker header provides a non-empty controller run id, replace the bracketed option with `--controller-run-id R` using that exact value. Omit the option only for standalone verification.

The finalizer keeps the normal dirty-report commit and first push flow. It reconciles a failed first push before emitting a terminal handoff: exact upstream equality acknowledges a landed push; a proven clean-ahead known commit consumes `stage_publication` once before one non-force recovery push. A publication-only reinvoke uses the same proof and owner without another commit. Remote identity, known subject, report-only scope, and clean-tree proof are mandatory. A new report, head, lease, or session cannot replenish that allowance. Never manually replay a failed recovery push.

Print the controller's `NMG_SDLC_HANDOFF:` line unchanged and stop. A passed handoff exists only after the exact report is published, the branch is synchronized, and the non-runtime worktree is clean. Fail or Partial `implementation_non_pass`, and a safe report with locally unverifiable readiness, write `status: failed` with `intervention: false`; they do not advance to delivery and may enter bounded `rN-verify` repair.

For mixed `Incomplete` evidence, the finalizer trusts only exact-head canonical artifact results. At least one required applicable failed `builtin.command` result writes `status: failed`, `intervention: false`, `next: implement`, and includes the report plus artifact paths. Execute consumes one durable `actionable_verification_resume`, reruns this publication-only finalization, rewinds to standard implement authority, then reruns both reviews/fixes and verification. Required project-provider failures without explicit repairability and every `incomplete` result remain external evidence; once local failures are fixed, they stop for intervention rather than looping.

`spec_not_approved`, `verification_publish_failed`, lease failure, missing/unsafe report or artifact, incomplete-only evidence, and non-recoverable external-only failure remain intervention. Never rewrite a controller handoff to change classification or bypass live scope, evidence, ownership, publication, or remediation bounds.
