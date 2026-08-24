---
name: review-main
description: "Persist the immediately preceding host OMP /review result and record its controller-owned handoff. Use only after /sdlc-execute drives review mode against main."
---

# Review Main

Never call `ask`. Do not write handoff JSON, commit, or push.

1. The host OMP `/review` has already run interactively in this worker against literal `main`. Do not invoke `/review`, `omp`, or a nested agent.
2. Write `.omp/sdlc/reviews/<N>-<step>.md` from the immediately preceding assistant review response, where `<step>` is `review1` or `review2` from this worker. If that response reports no findings, the file body is exactly `No findings.` plus a trailing newline. Otherwise write the findings text only.
3. Run `node <plugin-root>/scripts/sdlc-review-main.mjs --issue N --step <step>`.
4. If the preceding host review did not complete, skip the artifact write and run `node <plugin-root>/scripts/sdlc-review-main.mjs --issue N --step <step> --result review_failed`.
5. Print the controller's `NMG_SDLC_HANDOFF:` line unchanged. Stop.
