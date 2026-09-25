---
name: write-code
description: "Load specs/{N}-{slug}/ only. Execute tasks.md in declared order. Map every Approved Acceptance bullet before editing. Resolve and read skill://skill-creator before skill-bundled edits. Use from /sdlc-execute for approved spec. Handoff next verify."
---

# Write Code

Direct implementation of approved spec tasks for #N. No user questions. No plan approval. Load only from specs/{N}-{slug}/ .

## Prerequisites Check and Spec Resolver

1. Determine N:
   - From explicit arg matching ^#?(\d+)$
   - Else from current branch: git branch --show-current | sed -n 's/^\([0-9][0-9]*\)-.*/\1/p'

   If no N, write failed handoff step:"implement" reasonCode:"no_issue_number" intervention:true

2. A leftover `spike` label is not a special case. Continue as an ordinary feature/bug implementation. `upgrade-project` converts leftover spike artifacts before new drafts.

3. Resolve spec directory (first matching leading number):
   Use glob tool on path "specs/"
   Find directories matching ^N-  (take first by name sort)
   If none or >1 exact leading match, or dir does not exist: spec_not_approved

4. Read frontmatter from the dir files (use read + grep):
   Required files for feature/bug: requirements.md, design.md, tasks.md, feature.gherkin
   For each existing:
     Extract lines matching ^\*\*Issue\*\*:\s*#?N$   and ^\*\*Status\*\*:\s*Approved$
   If any required file missing the exact match or Status != Approved: write failed handoff reasonCode:"spec_not_approved" intervention:true step:"implement"

5. Use the injected `project.tech` and `project.structure` prompt snippets as the steering conventions. Do not read removed `steering/tech.md` or `steering/structure.md` authorities.

If spec resolution fails any check, produce the failed handoff and stop before any edit.

Before implementation edits, reports, or commits, run the native read-only owner-bound scope probe:

```bash
node <plugin-root>/scripts/sdlc-safe-recoveries.mjs probe --issue N --step implement --spec specs/N-SLUG --controller-run-id R
```

Use the exact controller run id from the worker header; it is required for this probe. Require `NMG_SDLC_PUBLICATION` with `passed:true` and `scope.mutationPolicy:"outcome"`. The helper validates the exact singular Approved spec, actual Git branch, active run identity/state, and unique matching incomplete recovery owner without acquiring the controller lock or writing run, handoff, recovery, spec, product, or `.pi-glla` state. `scope.allowedPaths` contains optional task `File(s)` hints; it is not mutation authority or a ceiling. Mutate any repository-relative path needed to satisfy Acceptance when `publicationPathDenied(path, { spec, readOnlyPaths: scope.readOnlyPaths })` is false. Never edit a `scope.readOnlyPaths` entry, another spec path, `.omp/`, or any path rejected by the publication-path validator. The current spec's `verification-report.md` is the only writable `specs/` exception.

## Execute Tasks in Order

Read specs/N-SLUG/tasks.md

Parse tasks in order: headings matching ^### T(\d+):\s*(.+)$

For each task in sequence (lowest to highest T number, follow declared Depends order if present but execute listed sequence):

- Read the full task block: optional File(s) hints, Type, Depends, and required Acceptance.
- Use design.md + requirements.md + feature.gherkin + the injected `project.tech` and `project.structure` snippets as context.
- Implement every path needed to satisfy Acceptance when the outcome-policy deny check permits it. Do not limit work to listed File(s).
- For each required skill-bundled path (matching **/workflows/**/WORKFLOW.md or **/workflows/**/references/** or **/workflows/**/scripts/** or **/workflows/**/templates/** or **/workflows/**/checklists/** or **/workflows/**/assets/** or root references/** or agents/*.md ):
  - Resolve and read `skill://skill-creator`.
  - Follow its editing procedure with the task title, acceptance bullets, target path, existing file content, and steering context. Never bypass the resolved skill for skill-bundled paths.
- For other permitted paths, use edit/write/read/glob/grep/bash tools to implement the change that satisfies Acceptance, following design.md architecture and the injected technical conventions. Make the smallest correct change.
- When an in-scope implementation detail is missing or an edit/test fails, follow Repair and Reverify below before deciding whether to hand off.
- After change for the task, self-verify its Acceptance bullets.
- Run the narrow check from technical steering when obvious for the changed behavior. Report the outcome.
- Proceed to the next task. Do not skip or reorder.

If a File(s) hint is incomplete or absent, continue from Acceptance and repository evidence. If a hinted path is denied, do not mutate it; report the conflict only when Acceptance cannot be satisfied through permitted paths.

## Repair and Reverify

1. Read the complete active requirements, design, tasks, and scenarios plus bounded relevant repository contracts and existing implementations. In a fresh `rN-implement` session, also consume the captured failure evidence and inspect preserved partial changes; retain the original `implement` step and handoff path.
   Map every `tasks.md` (and requirements) Acceptance bullet as already satisfied, remaining authorized work, or a still-blocked prerequisite before any edit. Skip every already satisfied task. Preserve `step:"implement"` and the implement handoff path. Completed work must not be reset or re-published. Preserve authorized partial changes.
2. Distinguish engineering work from unavailable authority. Missing internal code or an unspecified implementation detail is work to resolve within approved outcomes, not a reason to demand external implementation policy. Choose a conservative implementation supported by repository evidence and approved constraints; record the rationale and any necessary in-scope clarification in the active design.
3. Implement the repair and rerun the failing check plus the narrow checks covering affected behavior. If another repairable defect appears, repeat investigation, repair, and reverification under the same contract. Never weaken acceptance criteria, fabricate provider/calibration facts or verification evidence, or invent approval to make a check pass.
4. If repairable work remains for a fresh session, preserve useful partial changes and write `status:"failed"`, `intervention:false`, `reasonCode:"implementation_failed"`, `next:null`, `step:"implement"`. In `summary`, identify the remaining defect, attempted repairs, check commands/results, and next repair; list exact evidence and changed paths in `artifacts`. The existing controller owns fresh-session remediation; do not add a retry subsystem or attempt cap.
5. Escalate with `intervention:true` only when available tools and authorized repairs cannot resolve a genuine prerequisite: missing approved scope, required credentials or external evidence, conflicting safety authority, or publication failure. Name the exact missing prerequisite and attempted resolutions, not merely “missing policy” or “missing code”. Do not publish partial work as success.

Repair does not waive task completion, simplification, verification, or the commit/push/clean-tree/upstream-equality gates below. A failed handoff never advances to verify without satisfying commit/push/clean/upstream gates.

## Pre-Publication Simplification

If this worker prompt includes the appended `# Simplify` workflow, execute that entire section now, after all implementation tasks and before any final verification, commit, push, or handoff write. Return here only after its narrow checks pass. Never defer simplification until after publication.

## Commit and Push Implementation

Complete this boundary before writing a passed handoff:

1. Choose the exact implementation commit subject before staging. It must use `feat:`, `fix:`, `docs:`, or `chore:` (optionally with a conventional scope/breaking marker), describe the change, and contain the concrete requested issue identifier (for issue {{issue}}, `#{{issue}}`; `#N` denotes this issue-number form). Never run the obsolete subjectless command `node <plugin-root>/scripts/sdlc-safe-recoveries.mjs bind --issue N --step implement --spec specs/N-SLUG [--controller-run-id R]`; implement `bind` rejects it with `publication_subject_unproven` before lease or scope inspection. Run `node <plugin-root>/scripts/sdlc-safe-recoveries.mjs bind --issue N --step implement --spec specs/N-SLUG [--controller-run-id R] --subject "<exact planned subject>"` after tasks and simplification to revalidate identity, outcome policy, denied paths, and the subject. Invoke the helper with a program-and-argument array; never interpolate the subject into shell source. Require `NMG_SDLC_PUBLICATION` with `passed:true`; treat returned `scope.allowedPaths` only as task hints. Failure stops before any staging, commit, or push.
2. When approved non-runtime changes exist, stage the exact observed non-runtime dirty path set after the outcome-policy deny check passes, verify the staged diff is non-empty, and commit once using the exact machine-checked subject from step 1. Use literal Git pathspecs and avoid restaging already-staged deleted rename sources. Read the current branch and upstream: the branch must start with `N-`; run `git push -u origin HEAD` only for this newly created commit with no upstream, otherwise `git push`. This normal first publication does not consume a recovery allowance. Preserve a failed push's commit and proceed to outcome reconciliation below; never repeat a manual push.
3. If the non-runtime worktree was already clean, do not commit or push directly. Do not rename, amend, or create a commit to satisfy the check.
4. Read the exact existing stage subject with `git log -1 --format=%s HEAD`. It must equal the subject machine-checked in step 1 whenever this invocation created the commit. For clean existing publication and every first-push outcome, run `node <plugin-root>/scripts/sdlc-safe-recoveries.mjs reconcile --issue N --step implement --spec specs/N-SLUG --subject "<exact stage subject>" [--controller-run-id R]`. Use an argument-array process invocation; never interpolate the subject into shell source. Require `NMG_SDLC_PUBLICATION` with `passed:true`. The helper derives the observed commit path set, rejects denied paths or a mismatch, records that observed set as publication evidence, acknowledges only exact upstream HEAD with the expected stage subject, or consumes one `stage_publication` record before pushing a known clean-ahead commit without a duplicate commit or push.
5. Any unresolved staging, commit, branch, upstream, owner, or publication-proof failure writes the implement handoff with `status:"failed"`, `intervention:true`, `reasonCode:"implementation_failed"`, `next:null`, then stops. Never start verify from unpublished or uncommitted implementation.

## Write Handoff

Write `.omp/sdlc/handoffs/N-implement.json` :

{
  "schemaVersion": 1,
  "issue": N,
  "step": "implement",
  "status": "passed",
  "intervention": false,
  "summary": "All tasks from tasks.md executed for #N",
  "artifacts": [ list of created/modified paths ],
  "next": "verify",
  "reasonCode": null
}

Print exactly:
NMG_SDLC_HANDOFF: .omp/sdlc/handoffs/N-implement.json

Summary output:
Implementation complete for issue #N.
Tasks completed.
Files: ...
Next: execute verify

## Failure Modes (always produce handoff before stop)

- Any precondition fail: spec_not_approved, no_issue_number, etc. with intervention:true
- Remaining repairable implementation/detail/edit/test failure: use `implementation_failed`, `status:"failed"`, `intervention:false`, `next:null` with evidence and attempted repairs as specified in Repair and Reverify.
- Genuine unresolved authority/scope/credential/evidence blocker or any publication failure: use `implementation_failed`, `status:"failed"`, `intervention:true`, `next:null` with the exact prerequisite and attempted resolutions. Preserve the specific precondition reason codes above.
