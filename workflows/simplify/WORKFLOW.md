---
name: simplify
description: "Simplify the completed issue implementation before review without changing behavior, scope, public contracts, or generated artifacts. Used only by the implement worker."
---

# Simplify

Review the files changed for issue N after all approved implementation tasks pass.

1. Remove redundant branches, needless indirection, duplicated logic, and stale comments only when behavior is preserved.
2. Keep the approved design, public APIs, error contracts, and task scope unchanged.
3. Do not add abstractions, dependencies, compatibility aliases, or unrelated cleanup.
4. For workflow-bundled files, continue following the already loaded `skill://skill-creator` authoring contract.
5. Rerun the narrow checks covering any simplification. Leave the implementation unchanged when no clear simplification exists.
