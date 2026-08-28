---
name: review-main
description: "Persist the immediately preceding controller-started review result and record its controller-owned handoff. Use only after /sdlc-execute starts review against the resolved GitHub default ref."
---

# Review Main

Never call `ask`. Do not write handoff JSON, commit, or push.

1. The controller-started review has already completed in this worker against the resolved GitHub default ref. Do not invoke `/review`, `omp`, or a nested agent.
2. Write `.omp/sdlc/reviews/<N>-<step>.md` from the immediately preceding assistant review response, where `<step>` is `review1` or `review2` from this worker. If that response reports no findings, the file body is exactly `No findings.` plus a trailing newline. Otherwise write the findings text only.
3. Run `node <plugin-root>/scripts/sdlc-review-main.mjs --issue N --step <step>`.
4. If the preceding host review did not complete, skip the artifact write and run `node <plugin-root>/scripts/sdlc-review-main.mjs --issue N --step <step> --result review_failed`.
5. Print the controller's `NMG_SDLC_HANDOFF:` line unchanged. Stop.
