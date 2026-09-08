# Delivery Preparation (v3)

Require a clean worktree apart from runtime `.omp/` files. Preserve all unrelated
dirty work. Resolve the shared logical recovery owner before version/report
mutations, and stage only approved paths (never `-A`). A newly created delivery
commit may push normally without force. A clean-ahead known version or
PR-evidence commit uses `reconcileStagePublication` with its exact conventional
subject and allowed paths: consume `stage_publication` once before a recovery
push, or acknowledge the exact published upstream. Never duplicate the commit,
force-push, or retry a consumed publication.

Version prep now happens before commit decision per open-pr caller.

For GitHub `BEHIND`, `DIRTY`, or `CONFLICTING`, let the delivery controller consume
`mergeability_defect` once, fetch the real default base and issue branch, and
inspect merge-base, divergence, and an isolated `git merge-tree` trial. A stale
GitHub enum alone is not proof of a conflict. Remaining conflicts, conflicted
paths outside the approved delivery diff, conflict markers, unreadable trial
results, or local identity changes stop with inspected evidence. Never resolve
hunks manually or use ours/theirs strategies.

Only a conflict-free trial permits the matching merge commit and non-force
push. Require exact remote acknowledgment, then CAS-update expectedHead and
return `mergeability_reverification_required`. Rerun all review/fix/verify gates
on the new head before PR merge; keep the old artifacts and recovery keys.
No mergeability recovery increments a deliver remediation attempt or appends
an exhausted-run recovery.

No epic language.
