---
name: write-spec
description: "Create BDD specifications for an executable GitHub issue. Use when `/plan /skill:write-spec #N`. Feature/bug produce requirements+design+tasks+gherkin. Third step after draft; precedes execute."
---

# Write Spec

Read `../../references/codex-tooling.md` for OMP tool mapping (read/grep/glob/ask/write to local/xd).

## Step 0: Plan-Mode Precondition

If write/edit tools available, print exactly:

Run /plan /skill:write-spec #N

(append trimmed $ARGUMENTS) and stop. No mutation, no interview.

## Requirements on $ARGUMENTS

Trim $ARGUMENTS. Must match ^#?\d+$. Else print:

Usage: /plan /skill:write-spec #N

and stop.

Let N = the numeric issue id (strip leading #).

## Discovery

Use glob `specs/${N}-*/` (or read gh issue for title if needed to derive slug).

- If exactly one specs/{N}-* dir exists: update in place (must have **Issue**: #N in files).

- Else: derive slug from gh issue title (or provided), create specs/{N}-{slug}/ 

Never write into a directory whose leading number != N.

Read gh issue #N --json title,body,labels,state to get title, check labels for bug, check state.

If the dir exists and has **Status**: Approved and the issue is closed/merged: do not rewrite. Print: "Spec already approved for closed issue #N. Open a new issue for follow-up work." Stop.

If open or undelivered: rewrite in place and (later) append revision to Change History.

## Classification from labels / body

- bug label → bug path (defect templates)

- else feature

Never treat a leftover `spike` label as a separate path. `upgrade-project` converts leftover spike artifacts. This skill always writes an ordinary `specs/{N}-{slug}/` package.

## Interview (max 3 asks total)

Use ask (rec first) only for prefs if any (e.g. confirm slug on conflict, or scope notes). Typically 0 asks for simple #N; at most 3.

No review gates (deleted 3 gates, epic role, umbrella).

## Feature / Bug package

Plan Approach section includes the **full text** of:

- requirements.md (use singular **Issue**: #N , Status: Draft, appropriate heading # Requirements: or # Defect Report: with **Related Spec** if bug)

- design.md

- tasks.md

- feature.gherkin

Every written file, including `feature.gherkin` and defect variants, must carry:

```
**Issue**: #N
**Date**: YYYY-MM-DD
**Status**: Draft
**Author**: ...
```

Approval rewrites **Status** to Approved on all four files. Defect `tasks.md` and defect Gherkin use Draft | Approved only — never Planning / In Progress / Complete / In Review.

Use templates from templates/ (read at runtime), fill from issue body + steering + investigation (read steering/*, glob source for patterns).

## Plan File

Slug: spec-{N}

Write:

local://spec-{N}-plan.md

Content includes:

- issue: N

- slug

- title

- classification: feature|bug

- targetDir

- the full file contents to write on approval

- frontmatter rules: singular **Issue**, Status Approved on approval

## Approval Behavior (in plan execution after xd propose)

- Write (or overwrite in place) the files exactly.

- Set **Status**: Approved on every spec file written.

- Ensure specs/{N}-slug/ exists and contains all four required files.

- Fail closed if any written file has **Issue** field != #N .

- If was existing undelivered: append row to ## Change History : | #N | today | Spec revised before delivery |

- Initial write uses "Initial feature spec" or "Initial defect report"

## Finish

Write plain:

spec-{N}

<title from gh or derived>

to xd://propose

## Integration with SDLC Workflow

```
/plan /skill:write-spec #N   →   (approved plan writes specs/{N}-slug/)   →   /skill:execute #N
     ▲ You are here
```

Do not create specs/ dirs for other issues. Reuse parseBodyRelationships if relationships mentioned (no fork).
