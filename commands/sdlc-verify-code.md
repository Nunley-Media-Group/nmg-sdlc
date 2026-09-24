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
node "<plugin-root>/scripts/sdlc-safe-recoveries.mjs" bind --issue N --step verify --spec specs/N-SLUG [--controller-run-id R]
```

Use the exact worker-header controller run id; omit it only for standalone work. Require `NMG_SDLC_PUBLICATION` with `passed:true`. Owner or scope failure is intervention and stops before work. The lease is only a mutex: fresh leases and sessions reuse the existing incomplete project/issue/branch/verify owner, and standalone verification never creates execute `run.json`.

When a report already exists, after binding the verify owner and before publication-only finalization, invoke the bounded recovery classifier once:

```bash
node "<plugin-root>/scripts/sdlc-recover-verification.mjs" --issue N --spec specs/N-SLUG [--controller-run-id R]
```

Use the exact worker-header controller run id, or omit it for standalone verification. Parse its JSON even on nonzero exit. Only `{recover:true}` authorizes this invocation to proceed to the deterministic steering gate below. The classifier consumes one `external_verification_recheck` under the existing incomplete verify owner before returning: the previous report must be valid Incomplete, the bounded canonical artifact must match issue, Approved singular spec, registered identity and HEAD with complete coverage, and all applicable required validations must be passed except at least one incomplete external provider. A failed result, local incomplete, stale identity, unsafe path, foreign owner, dirty non-report scope, or consumed attempt is never authorization.

If the classifier does not authorize a recheck, run Finalize Verification once without changing report bytes or reposting its issue comment, then stop. `not_applicable` keeps ordinary publication-only recovery; invalid or stale evidence remains intervention under the finalizer. An Incomplete report with an exact-head required `builtin.command` failure remains mixed actionable evidence: the finalizer preserves the report and artifact, and writes the existing non-intervention `next: implement` handoff. Never alter evidence to change its classification.

After `{recover:true}`, run the registered steering gate once for that exact issue/spec/HEAD and owner. Read its freshly written canonical artifact. If coverage is not complete or any applicable required validation is not passed, preserve the historical report and issue comment, run Finalize Verification once to record an intervention-bearing non-pass handoff, and stop. Do not rerun the gate or regenerate a report. Only complete, all-required-pass fresh evidence permits the normal reviews, accurate replacement report, issue comment, and controller finalization below; finalizer publication and execute advancement retain all existing gates.

## Deterministic Steering Gate

Before prose review, run:

```bash
node "<plugin-root>/scripts/sdlc-verify-steering.mjs" --project . --issue N --spec specs/N-SLUG --base main [--controller-run-id R]
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
  Use updated exercise instructions (see exercise-testing.md): from a disposable project run `node "<plugin-root>/scripts/exercise-omp.mjs" --cwd <project> -- /sdlc-NAME [args]` with this extension loaded by the harness. Do not use `omp --print --load`. Preserve the prior dry-run contract and use state-based termination without a wall-clock deadline. Record output vs ACs.

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
node "<plugin-root>/scripts/sdlc-finalize-verification.mjs" --issue N --spec specs/N-SLUG [--controller-run-id R]
```

When the worker header provides a non-empty controller run id, replace the bracketed option with `--controller-run-id R` using that exact value. Omit the option only for standalone verification.

The finalizer keeps the normal dirty-report commit and first push flow. It reconciles a failed first push before emitting a terminal handoff: exact upstream equality acknowledges a landed push; a proven clean-ahead known commit consumes `stage_publication` once before one non-force recovery push. A publication-only reinvoke uses the same proof and owner without another commit. Remote identity, known subject, report-only scope, and clean-tree proof are mandatory. A new report, head, lease, or session cannot replenish that allowance. Never manually replay a failed recovery push.

Print the controller's `NMG_SDLC_HANDOFF:` line unchanged and stop. A passed handoff exists only after the exact report is published, the branch is synchronized, and the non-runtime worktree is clean. Fail or Partial `implementation_non_pass`, and a safe report with locally unverifiable readiness, write `status: failed` with `intervention: false`; they do not advance to delivery and may enter bounded `rN-verify` repair.

An exact-head, coverage-complete required failed `builtin.command` result remains locally repairable without a marker. A registered required applicable `project.*` provider may explicitly return `repairable: true` only with `status: "failed"` and structured evidence of an executed deterministic local test command (program, args, cwd, nonzero integer exitCode). Cluster/device readiness, credentials, incomplete prerequisites, and other external failures are not repairable. A qualifying blocked report writes a failed, non-intervention handoff with `next: implement`, preserves the report and canonical artifact paths, and does not pass verification. Execute consumes one durable `actionable_verification_resume`, reruns publication-only finalization, rewinds to standard implement authority, then reruns both reviews/fixes and every verification gate. An unmarked legacy project failure remains intervention unless the operator invokes bare execute with `--legacy-recovery-digest=<sha256 of original artifact>`; the controller alone passes that authorization to finalization, and one-use recovery keeps the original failed report and artifact unchanged.

`spec_not_approved`, `verification_publish_failed`, lease failure, missing/unsafe report or artifact, incomplete-only evidence, and non-recoverable external-only failure remain intervention. Never rewrite a controller handoff to change classification or bypass live scope, evidence, ownership, publication, or remediation bounds.
