# Review Gates (v3 removed)

Since v3, write-spec has no phase review gates, no old gate, no 3 sequential approvals.

Every selected issue overwrites the plan-mode plan file with a distinct complete plan headed `# spec-{N}: <title>` and calls `ExitPlanMode`. The plan includes the current `published[]`, publish helper commands, publication rules, and all four file bodies.

After that issue's plan approval the executor publishes (`prepare` → write Approved package → `commit-push` → `merge` into the default branch), records N, completes documented post-merge remediation, and settles. The nmg-sdlc hooks module then runs `/plan` and submits the Continue prompt as a native plan-mode turn; only that follow-up may ask Continue/Finished. A selected continuation issue performs read-only discovery/interview and receives its own plan and `ExitPlanMode` approval before any issue-specific mutation.

Epic role gate, umbrella publication deleted.
