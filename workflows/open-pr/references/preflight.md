# Delivery Preparation

Preserve unrelated dirty work. Version preparation occurs on the actual issue branch before the final verification gate; no version commit follows a passing gate. Stage only approved paths, never `git add -A`. A known clean-ahead version or report commit may be acknowledged at exact upstream HEAD or safely published with `reconcileStagePublication` using its conventional subject and allowed paths. Do not force push, duplicate the commit, or use an old token as permission.

For `BEHIND`, `DIRTY`, or `CONFLICTING`, fetch the current base and issue branch; inspect merge-base, divergence and an isolated `git merge-tree` trial. A stale GitHub enum is not proof of a conflict. Never discard unrelated work, silently resolve hunks or use ours/theirs. A conflict-free substantive head change needs full registered verification before ready or merge; otherwise report exact conflicting paths and preserve the PR.
