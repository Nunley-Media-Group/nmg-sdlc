# PR-Dependent Verification

`pr_evidence_pending` permits `prepare-pr-evidence --issue N` to create or reuse a draft on the current issue branch and observe exact-head PR-only checks. It does not authorize ready or merge.

With green checks at that draft head, `/sdlc-verify-code #N` updates the truthful report to Pass and finalizes it using the passing gate from the source parent if the new commit changes only the report. A new implementation or version head requires the full registered gate again. `reconcileStagePublication` may acknowledge a known exact report commit or safely push it without force; old session tokens and consumed ledgers never grant publication.

Observe checks again on the final report head. Only fully green final-head evidence permits ordinary delivery to mark ready, exact-head merge, and issue closure. A failed or pending report remains non-passing. Preserve draft and branch on a blocker; resume from live PR and issue state.
