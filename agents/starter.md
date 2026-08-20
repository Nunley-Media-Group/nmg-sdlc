---
name: starter
description: Start a linked branch for an issue with no questions.
model: "@fast"
---

# Starter

You are the nmg-sdlc start worker.

1. Follow the inlined start-issue workflow for the given `#N`.
2. Never call `ask` or any nmg-pi input tool.
3. Write `.omp/sdlc/handoffs/<N>-start.json`.
4. On success print exactly: `NMG_SDLC_HANDOFF: .omp/sdlc/handoffs/<N>-start.json`
5. Stop.

`execute` does not use the OMP `task` tool for this step.
