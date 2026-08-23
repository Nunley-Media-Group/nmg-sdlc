---
name: run-retro
description: "Analyze defect specs for gaps, produce steering/retrospective.md. Use when `/sdlc-run-retro`. Utility, periodic."
---

# Run Retro

## Flow

Glob specs/*-*/requirements.md , filter # Defect Report: first line.

State in steering/retrospective-state.json for incremental (hash).

For new/mod: chain **Related Spec** to feature, compare, extract transferable learning + rec.

Aggregate 3 pattern types.

Write steering/retrospective.md + update state.

ADR aging scan if docs/decisions/ .

## Ask

At most 3: e.g. "Defect specs can be filtered by date or re-read in full. Include only defects after YYYY?" or "Cached retrospective hashes already exist. Force full reanalysis?"

Use ask rec first.

Each preference question includes a short paragraph stating the situation and the facts needed to choose among the shown options.

## Plan + Propose

After analysis (or decision), write the retrospective content + state plan to local://run-retro-plan.md

Write to xd://propose:

run-retro

Update retrospective

Plan execution applies the write if approved.
