---
name: address-pr-comments
description: "Provide on-demand guidance for an explicit delivery remediation packet. Do not load for green delivery or run as an unconditional deliver prompt."
---

# Address PR Comments

Use only after `scripts/sdlc-deliver.mjs` exits 3 and emits an
`NMG_SDLC_REMEDIATION` packet. The compact open-pr workflow owns the loop.

## Boundaries

- Act only on packet-listed failing checks and unresolved automated-review threads.
- Treat `__typename: Bot`, `coderabbitai`, and steering-declared logins as automated.
- Never edit for human threads, `CHANGES_REQUESTED`, ambiguous requests, or
  design-affecting requests.
- Never resolve threads or merge a PR. The controller owns readiness and merge proof.
- Never launch or prompt another OMP worker.

## Clear Fix

For an obvious, local, safe request:

1. Read the packet's file and line context.
2. Apply the smallest in-scope correction. Resolve and read
   `skill://skill-creator` first for workflow-bundled targets.
3. Run targeted verification.
4. Commit changed non-runtime paths when needed.
5. Push without force.
6. Return to open-pr and rerun the controller so it re-fetches current state.

For anything else, return to open-pr and invoke the controller with
`--remediation-result human_review`.
