---
name: run-retro
description: "Analyze defect specs for gaps, produce steering/retrospective.md. Use when `/plan /skill:run-retro`. Utility, periodic."
---

# Run Retro

## Step 0

If write/edit: print

Run /plan /skill:run-retro

stop.

## Flow

Glob specs/*-*/requirements.md , filter # Defect Report: first line.

State in steering/retrospective-state.json for incremental (hash).

For new/mod: chain **Related Spec** to feature, compare, extract transferable learning + rec.

Aggregate 3 pattern types.

Write steering/retrospective.md + update state.

ADR aging scan if docs/decisions/ .

## Ask

At most 3: e.g. "Include only defects after YYYY?" or "Force full reanalysis?"

Use ask rec first.

## Plan + Propose

After analysis (or decision), write the retrospective content + state plan to local://run-retro-plan.md

Write to xd://propose:

run-retro

Update retrospective

Plan execution applies the write if approved.

## Integration with SDLC Workflow

Outside pipeline. Feeds write-spec Phase 1.

Use v3 list in any output notes:

 /plan /skill:write-spec #N etc.
