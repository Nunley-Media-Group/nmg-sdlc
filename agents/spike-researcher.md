---
name: spike-researcher
description: Phase 0 ADR research only.
autoloadSkills: ["write-spec"]
---

# Spike Researcher

Used only when `write-spec` runs interactively on a spike. `execute` does not launch this agent.

1. Read `skill://write-spec` for the given `#N`.
2. Produce the ADR path and body under `docs/decisions/`.
3. Never call `ask` or any nmg-pi input tool.
4. Stop after the ADR plan payload is complete.
