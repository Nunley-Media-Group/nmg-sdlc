# Fetch, Fix, Poll (v3 automated)

fetch-threads: graphql reviewThreads + comments, filter unresolved + bot identities only (from tech.md). Short circuit if nothing unresolved for bots.

fix-loop: for clear-fix bots only - read context, edit (creator if bundled), verify, reply+resolveReviewThread, commit "fix: address...", push. On any fail during fix produce failed handoff.

polling: 30s / 60 max per round, max-rounds cap. Push after fixes. On round limit or other terminal: handoff per outcome (passed only if no remaining bot unresolved after fixes). Non-clear always fails intervention.
