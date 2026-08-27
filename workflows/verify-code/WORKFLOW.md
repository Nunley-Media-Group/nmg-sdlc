---
name: verify-code
description: "The architecture-reviewer runs inline verification against the approved specs/{N}-{slug}/ . Writes verification-report.md, comments on the issue, and produces handoff. Pass or PR Evidence Pending advances to deliver; otherwise failed intervention. Use only from automated /sdlc-execute."
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

## Deterministic Steering Gate

Before prose review, run:

```bash
node <plugin-root>/scripts/sdlc-verify-steering.mjs --project . --issue N --spec specs/N-SLUG --base main
```

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
  Use updated exercise instructions (see exercise-testing.md): from disposable project run `node "/Users/rnunley/.omp/plugins/node_modules/nmg-sdlc/scripts/exercise-omp.mjs" --cwd <project> -- /sdlc-NAME [args]` with this extension loaded by the harness. Do not use `omp --print --load`. Preserve the prior dry-run contract and use state-based termination without a wall-clock deadline. Record output vs ACs.

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
node "<plugin-root>/scripts/sdlc-finalize-verification.mjs" --issue N --spec specs/N-SLUG
```

Print the controller's `NMG_SDLC_HANDOFF:` line unchanged and stop. A passed handoff exists only after the exact report is published, the branch is synchronized, and the non-runtime worktree is clean. Controller failure remains an intervention and never advances to delivery.
