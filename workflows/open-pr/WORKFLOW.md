---
name: open-pr
description: "Deliver a verified issue through the controller, remediate only explicit bot or CI packets in the same worker, and stop safely for human review."
---

# Open PR

Run deterministic delivery for issue N. No user questions and no nested worker.

## Controller Loop

1. Resolve N from `$ARGUMENTS` or the current `N-*` branch.
2. Resolve exactly one delivery scope and retain it for the complete controller loop:
   - When the worker header provides a non-empty controller run id R, use
     `--controller-run-id R` and the canonical
     `.omp/sdlc/handoffs/N-deliver.json`.
   - Otherwise, run
     `node "/Users/rnunley/.omp/plugins/node_modules/nmg-sdlc/scripts/sdlc-deliver.mjs" session-init --issue N`
     exactly once. Require exactly one `NMG_SDLC_SESSION: T` line whose token is
     a lowercase UUID. Retain `--session-token T` and
     `.omp/sdlc/sessions/T/handoffs/N-deliver.json` through every rerun.
   - A missing, conflicting, or changed scope stops before any delivery
     mutation. Never fall back from one namespace to the other.
3. Keep the immediately preceding remediation packet fingerprint in worker
   context.
4. Run
   `node "/Users/rnunley/.omp/plugins/node_modules/nmg-sdlc/scripts/sdlc-deliver.mjs" --issue N <scope-option>`
   with the retained scope option.
5. Route every invocation, including every post-remediation rerun:
   - `0`: require the exact namespace-specific handoff marker, validate that
     handoff, print its marker, and stop.
   - `1`: preserve the controller-written failed handoff at the exact selected
     namespace and stop.
   - `2`: stop on the invalid controller invocation; do not invent a handoff.
   - `3` with `NMG_SDLC_PR_EVIDENCE`: execute the controlled-draft branch below.
   - `3` with `NMG_SDLC_REMEDIATION`: execute the remediation branch below.
   - Any other output: stop without inventing a handoff.

Exit 0 is not completion without the validated marker and passed handoff for the
selected namespace.

The controller writes a passed handoff only after the persisted pull request is
`MERGED` at its persisted expected head and issue N is `CLOSED`. Failures such
as `major_bump_required` remain controller-owned intervention handoffs.

## Controlled-Draft PR Evidence

For one `NMG_SDLC_PR_EVIDENCE` packet:

1. Require `kind: pr_evidence_verification_required`, issue N, an exact draft PR,
   H1 in `headSha`, the active approved spec path, and bounded evidence identities.
2. Re-fetch that PR and every packet identity from GitHub. Require the PR to
   remain an open draft at H1. Do not accept evidence for another head or claim
   evidence that GitHub did not return.
3. Read the active verification report plus
   `workflows/verify-code/references/report-format.md` and
   `references/pr-dependent-verification.md`. Preserve its already-passing local
   evidence and issue scope. Update only the PR-readiness evidence so every
   packet identity has a success-equivalent conclusion, URL, and exact H1.
4. Validate the report with
   `node <plugin-root>/scripts/verification-readiness.mjs --project <project-root> --spec <spec-path> --issue N --head H1 --json`
   If the PR changed or the bounded evidence cannot be satisfied, run the
   controller with `--remediation-result human_review` and stop.
5. Do not write, preserve, or print an `N-verify.json` handoff. Return directly
   to the controller loop. The controller alone commits and safely pushes the
   changed report, captures H2, re-polls every declared identity for H2, writes
   and re-fetches the final delivery marker, validates it, and marks the draft
   ready.

Never mark the draft ready, merge, delete a branch, or synthesize H1/H2 evidence
inside this workflow.

## On-Demand Remediation

Use only the packet's failing checks and bot-thread context. Apply a fix only when it
is obvious, local, safe, and inside the approved issue scope. For a workflow-bundled
target, resolve and read `skill://skill-creator` before editing.

Before editing, compare the packet fingerprint—`headSha`, failing-check names and
URLs, and thread URLs—with the immediately preceding remediation packet. If it is
unchanged, or any thread has no `path`, run the controller with
`--remediation-result human_review` and stop.

After a clear fix:

1. Run the narrow verification covering the changed behavior.
2. Stage only the remediation paths, excluding `.omp/`.
3. If the staged diff is empty, run the controller with
   `--remediation-result human_review`, preserve its intervention handoff, and stop.
4. Commit with a conventional `fix:` subject.
5. Push the current branch without force.
6. Save this packet's fingerprint as the immediately preceding fingerprint.
7. Return to the controller loop and route the next result from step 5. A new exit
   3 is never terminal by itself and never bypasses repeat detection.

Never resolve a review thread, merge the PR, resend a prompt, invoke OMP, or start
another worker from this loop.

If a request is ambiguous, design-affecting, human-authored, unsafe, outside
scope, pathless, unchanged after the attempted fix, or repeated unchanged, run:

```bash
node "/Users/rnunley/.omp/plugins/node_modules/nmg-sdlc/scripts/sdlc-deliver.mjs" --issue N <scope-option> --remediation-result human_review
```

Preserve that controller-owned intervention handoff and stop.
