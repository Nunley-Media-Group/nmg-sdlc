---
name: write-code
description: "Load specs/{N}-{slug}/ only. Execute tasks.md in declared order. Resolve and read skill://skill-creator before skill-bundled edits. No plan-mode approval, no gates. Use from /sdlc-execute for approved spec."
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



5. Load steering/ for conventions (tech.md, structure.md) using read.

If spec resolution fails any check, produce the failed handoff and stop before any edit.

## Execute Tasks in Order

Read specs/N-SLUG/tasks.md

Parse tasks in order: headings matching ^### T(\d+):\s*(.+)$

For each task in sequence (lowest to highest T number, follow declared Depends order if present but execute listed sequence):

- Read full task block: File(s), Type, Depends, Acceptance
- Use design.md + requirements.md + feature.gherkin + steering/ as context.
- For the listed File(s):
  - If path is skill-bundled (matches **/workflows/**/WORKFLOW.md or **/workflows/**/references/** or **/workflows/**/scripts/** or **/workflows/**/templates/** or **/workflows/**/checklists/** or **/workflows/**/assets/** or root references/** or agents/*.md ):
    - Resolve and read `skill://skill-creator`.
    - Follow its editing procedure with the task title, acceptance bullets, target path, existing file content, and steering context. Never bypass the resolved skill for skill-bundled paths.
  - Else: use edit/write/read/glob/grep/bash tools to implement the change that satisfies the task Acceptance criteria, following design.md architecture and tech.md conventions. Make smallest correct change.
- After change for the task: self-verify the Acceptance bullets for that task pass.
- Run narrow test command from tech.md if obvious for the files (dry if possible). Report outcome.
- Proceed to next task. Do not skip or reorder.

If a task file list references a path outside the approved delivery scope or spec, note but continue only on mapped tasks.


## Commit and Push Implementation

Complete this boundary before writing a passed handoff:

1. Run `git status --porcelain` and collect every changed path except `.omp/` runtime state.
2. When non-runtime changes exist, stage those exact paths with `git add -- <paths>`, verify the staged diff is non-empty, and commit once with a conventional subject (`feat:`, `fix:`, `docs:`, or `chore:`) that describes issue #N.
3. Read the current branch and its upstream. The branch must start with `N-`. If no upstream exists, run `git push -u origin HEAD`; otherwise run `git push`.
4. Require the non-runtime worktree to be clean and require `git rev-parse HEAD` to equal `git rev-parse @{upstream}`. A pre-existing clean implementation is acceptable only when this publication proof passes.
5. Any staging, commit, branch, upstream, push, or publication-proof failure writes the implement handoff with `status:"failed"`, `intervention:true`, `reasonCode:"implementation_failed"`, `next:null`, then stops. Never start review1 from unpublished or uncommitted implementation.

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
  "next": "review1",
  "reasonCode": null
}

Print exactly:
NMG_SDLC_HANDOFF: .omp/sdlc/handoffs/N-implement.json

Summary output:
Implementation complete for issue #N.
Tasks completed.
Files: ...
Next: execute review1

## Failure Modes (always produce handoff before stop)

- Any precondition fail: spec_not_approved, no_issue_number, etc. with intervention:true
- Edit or test failure that blocks: use "implementation_failed" with summary of blocker.
