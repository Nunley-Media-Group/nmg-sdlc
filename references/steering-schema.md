# Steering Runtime Schema

**Consumed by**: `draft-issue`, `write-spec`, `onboard-project`, `upgrade-project`, `write-code`, `verify-code`, and `open-pr`.

`steering/manifest.json` is the only registration authority for managed modules, project snippets, trusted project extensions, providers, and deterministic validations. Consumers fail closed when the manifest is missing or invalid; they never fall back to `steering/product.md`, `steering/tech.md`, or `steering/structure.md`.

## Layout and Ownership

| Path | Owner | Contract |
|------|-------|----------|
| `steering/manifest.json` | Project | Versioned registration data and managed-file hashes |
| `steering/modules/{product,tech,structure,verification}.mjs` | Plugin-managed copies | Exactly four frozen v1 descriptors; replaced only when manifest-marked and approved |
| `steering/snippets/*.md` | Project | Loaded only through explicit manifest registrations and prompt-registry consumers |
| `steering/extensions/*.mjs` | Project | Trusted provider modules with exact declared exports |
| `steering/retrospective.md` | Project | Independently maintained by `/sdlc-run-retro`; never managed runtime content |

Unknown files are preserved and are not loaded implicitly.

## Manifest v1

The manifest has exactly `schemaVersion`, `runtimeVersion`, `managedFiles`, `modules`, `snippets`, `extensions`, and `validations`, plus the optional `worktree`, `changelog`, and `fullGreen` keys described under Optional Settings. Unknown keys fail. All registered paths are POSIX project-relative regular files under their allowed `steering/` subtree; traversal, absolute paths, and symlink escape fail.

- `managedFiles[]`: `{ path, template, sha256 }` for exactly the four module copies.
- `modules[]`: `{ id, role, path }` for exactly `product`, `tech`, `structure`, and `verification`.
- `snippets[]`: `{ id, path, consumers, slot, order }`. Consumers and slots must be allowed by the prompt registry. Provenance, ordering, placeholders, hashes, provider identity, source confinement, and non-empty bodies use the shared renderer. Prompt composition has no byte ceiling. `byteBound` is not part of the manifest or fragment schema and fails as an unknown key; there is no legacy compatibility or enforcement path. Initialize and migration writers validate the exact input key set and canonicalize accepted records before returning any plan actions or manifest output.
- `extensions[]`: `{ id, path, providers }`. The module exports one frozen `extension` descriptor whose id and provider keys exactly match.
- `validations[]`: `{ id, provider, required, when, config }`, plus the optional `tier`, `heavy`, `selection`, and `fallbackPaths` keys described under Validation Tiers. A legacy `timeoutMs` key is accepted and ignored for compatibility; omission is canonical and means no deadline. Provider ids resolve exactly once.

## Optional Settings

Every key in this section is optional. A manifest that declares none of them behaves exactly as before.

- `worktree`: `{ setup?, teardown? }`. Each is a command `{ program, args, cwd?, env? }` run with `shell: false` (a shell is not an allowed program); `cwd` is project-relative and `env` names the environment keys passed through. `setup` runs once when an issue worktree is created, for example to create a virtual environment and install dependencies; a failed setup fails the start with `worktree_setup_failed` and runs again when the worktree is reused. `teardown` runs before a delivered worktree is removed. A spec worktree (`spec/{N}-{slug}`) holds only the spec's Markdown files, so neither command runs for it.
- `changelog`: `{ fragments: { dir } }`. Opts the project into changelog fragments: issue N writes one Markdown file `<dir>/<N>.md`, whose bullets end with `(#N)`, and `sdlc-deliver.mjs prepare-version` for issue N assembles only that file into `CHANGELOG.md` and deletes it in the version commit.
- `fullGreen`: `{ actions: [id] }`. The downstream action names, such as `"deploy"`, that require a green `full`-tier record at or after the commit they act on. `sdlc-verify-full.mjs check --action NAME --commit REF` answers whether a commit satisfies one, and fails with `full_green_action_unknown` for an action that is not listed.

An invalid value for one of these keys fails with `steering_manifest_invalid`.

## Validation Tiers

An invalid value for one of these keys fails with `steering_validation_invalid`.

- `tier`: `"change"` or `"full"`. A `change` validation is required before merge. A `full` validation is not: the pre-merge gate records it as skipped, and `/sdlc-verify-full [REF]` runs it on demand and records the result per commit. In a project where no validation declares a tier, every required validation runs before merge.
- `heavy`: a boolean. `true` makes the validation take a slot from the host-wide heavy-job pool before it runs. The pool is shared by every project and session on the machine; its size is `heavyJobSlots` in `~/.nmg-sdlc/config.json` (default 1), and its locks are `~/.nmg-sdlc/heavy-jobs/slot-<k>.lock`. `NMG_SDLC_HOST_STATE_DIR` relocates that host directory. The result records `heavy: { slot, waitedMs }`. A slot whose holder process is dead is reclaimed.
- `selection`: only on a `change`-tier `builtin.command` validation. A project command `{ program, args, cwd?, env? }`:
  - It receives `{ "schemaVersion": 1, "validationId", "baseRef", "changedPaths" }` on stdin and prints `{ "schemaVersion": 1, "mode": "selected" | "all", "tests": [...], "dataStatus": "fresh" | "stale" | "missing", "dataAgeSeconds": number | null }`. The plugin implements no language-specific selection.
  - The selected tests are appended to the validation's `args` (reason `selected`).
  - The full command runs when the command answers `all` (`selection_all`), exits non-zero or prints something malformed (`selection_failed`), or reports its data stale or missing (`selection_data_stale`, `selection_data_missing`).
  - An empty selection passes without running anything (`selection_empty`).
- `fallbackPaths`: only on a `change`-tier `builtin.command` validation. An array of project-relative globs on the validation itself. When a change touches one, the validation runs its full command (`fallback_path`) and the selection command is not asked.

  Each result records `tier` (or null) and `selection` (or null): `{ provider, reason, fallbackPath, selectedCount, dataAgeSeconds }`.

## Deterministic Validations

Core evaluates the closed `when.kind` grammar before provider launch: `always`, `changed_paths`, `path_exists`, or `glob_exists`. Providers cannot decide applicability.

Built-ins:

- `builtin.command`: explicit `program` and `args`, project-bounded `cwd`, named environment keys, `shell: false`;
- `builtin.artifact`: regular-file checks for nonempty, JSON, SHA-256, or contained text;
- `builtin.external-evidence`: schema-valid identity-bound result envelope from an external deterministic harness.

Every request and result binds to head SHA, clean/dirty tree identity, spec hash, steering hash, and validation-config hash. Provider requests expose an explicit cancellation signal but no automatic deadline. Each successful artifact includes declaration/result `coverage`: declared and recorded counts, a completeness boolean, and deterministic missing, duplicate, and unknown id arrays. Zero declarations plus zero results is complete and does not impose a ceiling. Any missing, duplicate, or unknown result makes coverage incomplete and caps verification at `Incomplete`. When coverage is complete, only a schema-valid `passed` result with non-empty evidence satisfies an applicable required validation. Failure caps verification at `Fail`; malformed, stale, crashed, explicitly cancelled, process-lost, skipped, or not-applicable required results cap it at `Incomplete`. Optional results remain evidence without raising the ceiling.

## Mutation

`node scripts/sdlc-steering.mjs inspect|validate|apply` is the sole writer contract. `/sdlc-steering`, onboarding, and upgrade create an exact approval payload for `initialize`, `update`, or `migrate`. Apply checks the approved source digest, constructs and validates the complete candidate runtime, then performs only named actions. Failed staging or validation leaves live steering unchanged. Migration deletes legacy Markdown authorities only after their prose is preserved in registered snippets and the candidate validates.
