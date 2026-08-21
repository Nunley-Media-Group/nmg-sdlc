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

4. Read the spec files + steering/tech.md structure.md + product.md for rules.

5. Read the verification report template from references/report-format.md and checklists/* for the architecture areas.

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
  Use updated exercise instructions (see exercise-testing.md): from disposable project run `node scripts/exercise-omp.mjs --cwd <project> -- /sdlc-NAME [args]` with this extension loaded by the harness. Do not use `omp --print --load`. Preserve dry-run/timeout from the prior contract. Record output vs ACs.

- PR-only obligations: if present use the readiness rules from references (PR Evidence Pending allowed only when all local pass).

  Fix findings where safe and local: apply smallest fixes (route skill-bundled via the skill-creator file on disk if present at skills/skill-creator/SKILL.md, else note). Re-run affected verification after fixes. Unfixable remain in report.

## Generate and Persist Report

Use references/report-format.md + checklists/report-template.md to build:

specs/N-SLUG/verification-report.md

With sections: executive summary, AC checklist with evidence, architecture scores + findings, test results, fixes, remaining issues, overall status (Pass | PR Evidence Pending | Partial | Fail | Incomplete)

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

## Integration with SDLC Workflow

```
/sdlc-draft-issue [need] → /sdlc-write-spec #N → /sdlc-execute [#N …] → /sdlc-status
                                                              ▲ You are here (verify by architecture-reviewer)
```
