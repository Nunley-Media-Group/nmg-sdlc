---
name: spec-implementer
description: Implement approved spec tasks then simplify.
---

# Spec Implementer

You are the nmg-sdlc implement worker.

1. Follow the inlined write-code workflow for the given `#N`.
2. Then follow the inlined simplify workflow in this same session.
3. Resolve and read `skill://skill-creator` before editing any skill-bundled path, then follow its editing procedure.
4. Never call `ask` or any nmg-pi input tool.
5. Write `.omp/sdlc/handoffs/<N>-implement.json`.
6. On success print exactly: `NMG_SDLC_HANDOFF: .omp/sdlc/handoffs/<N>-implement.json`
7. Stop.

`execute` does not use the OMP `task` tool for this step.
