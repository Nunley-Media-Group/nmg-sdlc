# Sealed Umbrella-Spec Recovery

Read this reference when `upgrade-project` reaches sealed-spec analysis or applies an explicitly approved `stranded_recoverable` finding. The shared Git classification contract is `../../../references/canonical-umbrella-spec.md`.

## Analyze

Resolve the installed plugin root from the skill path and run:

```bash
node <plugin-root>/scripts/umbrella-spec-status.mjs \
  --project <project-root> \
  --all \
  --json
```

Render every finding with its exact normalized path, umbrella issue numbers, refreshed default branch/commit/tree, candidate full tree IDs, source commit IDs, and refs. Map statuses as follows:

| Helper status | Upgrade finding | Mutability |
|---------------|-----------------|------------|
| `canonical` | canonical | Report-only |
| `canonical_marker_lost` | canonical with history marker lost | Report-only |
| `stranded_recoverable` | stranded but unambiguously recoverable | Exact approval may prepare content |
| `divergent` | divergent from same-path default spec | Preserve default; report-only |
| `ambiguous` | ambiguous/unrecoverable | Report-only |
| `unverifiable` | unverifiable | Report-only |

Do not infer recovery approval from approval of another path/category, silence, an empty answer, or a timeout. Ask for each recoverable path/tree/source identity through `request_user_input` and include accepted identities in the decision-complete plan.

## Revalidate Approved Finding

Immediately before apply:

1. Run audit mode again and find the exact approved path.
2. Require status `stranded_recoverable`, the same default branch and absent default path, one identical full tree ID, and the same approved full source commit among its evidence.
3. Resolve the source commit and confirm `git rev-parse <sourceCommit>:<specPath>` equals the approved tree ID.
4. Use `lstat` semantics on the worktree path. Reject symlinks and non-directory collisions.
5. Capture the index with `git ls-files --stage -z` and capture unrelated dirty paths with `git status --porcelain=v1 -z --untracked-files=all` before apply.

If any value changed, stop only this recovery as a stale finding. Do not rediscover or substitute a different ref, path, tree, source commit, or destination.

## Prepare Exact Content

- If the destination is absent, restore only the approved path with `git restore --source=<full-source-commit> --worktree -- <validated-spec-path>`. Do not pass `--staged`.
- If the destination exists, compare its complete regular-file tree with the approved Git tree through a temporary directory created by the platform temporary-directory API. If byte-identical, report `already prepared`; otherwise preserve it as project-authored/divergent and stop.
- Never overwrite an existing differing file, follow a symlink, create parent content outside `specs/`, or restore any sibling path.

After restoration, confirm:

1. The exact four-file spec content resolves to the approved tree identity.
2. `git ls-files --stage -z` is byte-for-byte unchanged.
3. Every pre-existing unrelated dirty path and byte remains unchanged.
4. No branch/ref, release artifact, or GitHub state changed.

Report the restored path as `prepared for publication`, not canonical. Direct it through `$nmg-sdlc:write-spec #N`, whose Seal-Spec Flow owns review, exact commit/push, publication PR creation, and merged-default recheck.

## Idempotence

Run analysis a second time. An absent default path with already prepared byte-identical worktree content creates no additional diff; a later run after publication reports canonical or canonical with history marker lost. Never create a duplicate local restoration, seal commit, publication PR, or branch cleanup action.
