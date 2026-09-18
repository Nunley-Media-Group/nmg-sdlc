# Review Gates (v3 removed)

v3 write-spec has no phase review gates, no old gate, no 3 sequential approvals.

Every selected issue synthesizes a distinct complete `local://spec-{N}-plan.md` and calls `xd://propose`. The plan file includes the current `published[]`, publish helper commands, publication rules, and all four file bodies.

After that issue's plan approval the executor publishes (`prepare` → write Approved package → `commit-push` → `merge` into the default branch), records N, completes documented post-merge remediation, and settles. The extension queues native `/plan` re-entry; only that follow-up may ask Continue/Finished. A selected continuation issue performs read-only discovery/interview and receives its own proposal before any issue-specific mutation.

Epic role gate, umbrella publication deleted.
