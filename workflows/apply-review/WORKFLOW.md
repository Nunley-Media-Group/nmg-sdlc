---
name: apply-review
description: "Apply findings from an execute review artifact through the controller. Use only from /sdlc-execute fix workers."
---

# Apply Review

Never call `ask`. Do not write handoff JSON, commit, or push.

1. Run `node <plugin-root>/scripts/sdlc-apply-review.mjs --issue N --step <fix1|fix2>`.
2. Exit 0 or 1: stop. The controller already wrote the handoff.
3. Exit 3: apply only the findings in the packet `artifactPath`. No drive-by cleanup. Then rerun `node <plugin-root>/scripts/sdlc-apply-review.mjs --issue N --step <fix1|fix2> --applied`.
4. Exit 2: stop.
