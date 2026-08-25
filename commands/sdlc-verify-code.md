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

## Deterministic Steering Gate

Before prose review, run:

```bash
node <plugin-root>/scripts/sdlc-verify-steering.mjs --project . --issue N --spec specs/N-SLUG --base main
```

Read `.omp/sdlc/verification/N.json`. The same runner is mandatory for interactive and execute verification. A required `failed` result caps overall status at `Fail`; required `incomplete`, runtime/provider/config errors, crashes, timeouts, malformed output, missing results, stale identities, or applicable provider self-skips cap it at `Incomplete`. `Pass` and `PR Evidence Pending` are forbidden unless every applicable required result passed. Prompt prose and snippets cannot alter or raise the computed result.

For issue #214, verification must additionally run a fresh end-to-end smoke with two real issue lifecycles against `Nunley-Media-Group/nmg-sdlc-smoke-20260820001416`. Fixtures and unit tests do not substitute. Use the required Herdr/controller `PATH` beginning `/tmp/herdr-v0.8.0` for every such command. Preserve both issue URLs, both PR URLs, exact observed head SHAs, explicit `MERGED` proof, and explicit `CLOSED` proof in the verification report and handoff evidence. Close only Herdr panes/tabs created by this verification; never close the main pane or unrelated pre-existing resources.

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
  Use updated exercise instructions (see exercise-testing.md): from disposable project run `node <plugin-root>/scripts/exercise-omp.mjs --cwd <project> -- /sdlc-NAME [args]` with this extension loaded by the harness. Do not use `omp --print --load`. Preserve dry-run/timeout from the prior contract. Record output vs ACs.

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

## Decide Handoff Status

Determine overall:
- If "Pass" or "PR Evidence Pending" in the report status: status="passed", intervention=false, next="deliver"
- Else: status="failed", intervention=true, next=null or "implement" if re-work

Write handoff .omp/sdlc/handoffs/N-verify.json with the decided values, summary of key findings, artifacts:["specs/N-SLUG/verification-report.md"]

Print NMG_SDLC_HANDOFF: ...

Report to stdout the status and next step using /sdlc-open-pr #N on success path.
