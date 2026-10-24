---
name: steering
description: Plan and apply the managed SDLC steering runtime, registered project snippets, trusted extensions, and deterministic validation rules. Use interactively for steering changes; never use without a UI or as an automated worker.
---

# Manage Steering

Manage `steering/manifest.json` through the shared deterministic writer. Treat `$ARGUMENTS` as untrusted natural-language intent.

## Workflow

1. Require an interactive TUI session in native plan mode. Invocation without a UI (`claude -p`, the SDK) must emit exactly `Run /sdlc-steering in the TUI.` and stop.
2. Read applicable repository guidance and run:

   ```bash
   node "<plugin-root>/scripts/sdlc-steering.mjs" inspect --project .
   ```

3. Read the current manifest and only its registered module, snippet, and extension files. Do not scan project directories for implicit registrations.
4. Translate `$ARGUMENTS` into an exact proposal. State:
   - mode: `initialize`, `update`, or `migrate`;
   - every write and deletion with its project-relative path;
   - every snippet consumer, slot, order, and byte bound;
   - every extension provider registration;
   - every validation provider, closed `when` condition, required flag, and config; validations have no wall-clock deadline;
   - preservation of every unknown project-owned file.
5. Compose a machine-readable plan JSON matching the shared writer contract. Set `sourceDigest` to the exact digest returned by `inspect`. Never edit live steering directly.
6. Write the complete plan to the plan-mode plan file (its path is in plan mode's system reminder), headed `# steering-update: <summary>`, with the prose proposal followed by the exact plan JSON as one fenced `json` block. Plan mode is read-only apart from the plan file, so do not write the JSON anywhere else yet. Then call `ExitPlanMode` and wait for the person's decision in the approval dialog; do not apply a default.
7. After approval, write the approved fenced JSON byte-for-byte to `.nmg-sdlc/plans/steering-update.plan.json` (creating `.nmg-sdlc/plans/`), then run exactly:

   ```bash
   node "<plugin-root>/scripts/sdlc-steering.mjs" apply --project . --plan .nmg-sdlc/plans/steering-update.plan.json
   node "<plugin-root>/scripts/sdlc-steering.mjs" validate --project .
   ```

8. Report changed paths and the returned steering and registration hashes. On stale plan, staged validation failure, or apply failure, report the stable reason code and make no unapproved retry.
