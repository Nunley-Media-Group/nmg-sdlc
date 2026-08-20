# Review Gates (v3 removed)

v3 write-spec has no phase review gates, no old gate, no 3 sequential approvals.

The first spec still synthesizes to `local://spec-{N}-plan.md` + `xd://propose`. That first plan file must include the publish helper commands and continue-loop rules, not only the four file bodies.

After plan approval the executor publishes (`prepare` → write Approved package → `commit-push`) then asks Continue/Finished. Continuation never calls `xd://propose` and never re-enters phase review gates.

Epic role gate, umbrella publication deleted.
