---
name: run-retro
description: "Analyze defect specs for gaps, produce steering/retrospective.md. Use when `/sdlc-run-retro`. Utility, periodic."
---

# Run Retro

## Flow

Find specs/*-*/requirements.md (`Glob`, or `find` through `Bash`), filter # Defect Report: first line.

State in steering/retrospective-state.json for incremental (hash).

For new/mod: chain **Related Spec** to feature, compare, extract transferable learning + rec.

Aggregate 3 pattern types.

Write steering/retrospective.md + update state.

ADR aging scan if docs/decisions/ .

## Ask

At most 3: e.g. "Defect specs can be filtered by date or re-read in full. Include only defects after YYYY?" or "Cached retrospective hashes already exist. Force full reanalysis?"

Use `AskUserQuestion`, recommended option first with ` (Recommended)` appended to its label.

Each preference question includes a short paragraph stating the situation and the facts needed to choose among the shown options.

## Plan + Approval

After analysis (or decision), write the complete plan to the plan-mode plan file (its path is in plan mode's system reminder): the full planned `steering/retrospective.md` content and the state update, with the first line:

```text
# run-retro: Update retrospective
```

Then call `ExitPlanMode`. Plan execution applies the writes if approved in the approval dialog.
