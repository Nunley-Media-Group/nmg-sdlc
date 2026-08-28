---
name: review-main
description: "Run one controller-owned host review against the exact resolved base, then persist its artifact and validated handoff in the same sibling OMP prompt."
---

# Review Main

Never call `ask`. Do not commit, push, or write handoff JSON directly.

1. Run the host review now in this sibling OMP worker against the exact resolved base named in the controller prompt. Do not invoke `/review`, start `omp`, or route review work through the controller or main pane.
2. Use the controller prompt's parallel file-assigned reviewer contract. Consolidate every finding before finalization.
3. Write `.omp/sdlc/reviews/<N>-<step>.md`, where `<step>` is `review1` or `review2`. With no findings, write exactly `No findings.` plus a trailing newline. Otherwise write the consolidated findings text only.
4. Run `node <plugin-root>/scripts/sdlc-review-main.mjs --issue N --step <step>`.
5. If the host review cannot complete, skip the artifact write and run `node <plugin-root>/scripts/sdlc-review-main.mjs --issue N --step <step> --result review_failed`.
6. Print the controller's `NMG_SDLC_HANDOFF:` line unchanged. Stop only after the command writes the handoff.
