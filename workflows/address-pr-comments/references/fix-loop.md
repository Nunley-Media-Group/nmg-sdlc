# Controller-Owned Remediation Loop

**Consumed by**: `address-pr-comments` only after `scripts/sdlc-deliver.mjs` emits an `NMG_SDLC_REMEDIATION` packet.

Apply only the packet-listed code corrections. Run targeted verification, commit, and push without force. Then return control to `sdlc-deliver.mjs`.

The delivery controller exclusively polls checks and review threads, posts replies, resolves threads, changes pull-request readiness, and proves merge and issue closure. A remediation worker never performs those operations.

Pathless, ambiguous, human-authored, design-affecting, unchanged, or repeated findings return `human_review` without mutation.
