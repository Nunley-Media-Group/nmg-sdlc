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

The manifest has exactly `schemaVersion`, `runtimeVersion`, `managedFiles`, `modules`, `snippets`, `extensions`, and `validations`, plus the optional `worktree`, `changelog`, `fullGreen`, `selection`, and `surfaces` keys described under Optional Settings and Scoped Selection. Unknown keys fail. All registered paths are POSIX project-relative regular files under their allowed `steering/` subtree; traversal, absolute paths, and symlink escape fail.

- `managedFiles[]`: `{ path, template, sha256 }` for exactly the four module copies.
- `modules[]`: `{ id, role, path }` for exactly `product`, `tech`, `structure`, and `verification`.
- `snippets[]`: `{ id, path, consumers, slot, order }`. Consumers and slots must be allowed by the prompt registry. Provenance, ordering, placeholders, hashes, provider identity, source confinement, and non-empty bodies use the shared renderer. Prompt composition has no byte ceiling. `byteBound` is not part of the manifest or fragment schema and fails as an unknown key; there is no legacy compatibility or enforcement path. Initialize and migration writers validate the exact input key set and canonicalize accepted records before returning any plan actions or manifest output.
- `extensions[]`: `{ id, path, providers }`. The module exports one frozen `extension` descriptor whose id and provider keys exactly match.
- `validations[]`: `{ id, provider, required, when, config }`, plus the optional `tier`, `heavy`, `concurrent`, `selection`, and `fallbackPaths` keys described under Validation Tiers. A legacy `timeoutMs` key is accepted and ignored for compatibility; omission is canonical and means no deadline. Provider ids resolve exactly once.

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
- `concurrent`: a boolean. The verification gate runs in two phases: Phase 1 runs the required `builtin.command` validations one at a time, and Phase 2 runs the rest. In Phase 2, every applicable `concurrent: true` validation starts together at the position of the first one, so the batch takes about as long as its slowest member instead of the sum of all of them. The gate waits for the whole batch before it continues.
  - A validation without `concurrent: true` never overlaps another validation, and Phase 1 validations always run one at a time whatever they declare. A manifest without the key runs exactly as before.
  - A failure in the batch does not cancel the other members: each runs to completion and records its own result.
  - Each member keeps its own selection, its heavy-job slot when it is also `heavy: true` (it waits for a slot before its provider starts; the members that are not heavy do not wait), the Phase 1 deferral of project providers, and cancellation by the gate's abort signal.
  - Results are recorded in manifest order whatever order the members finish in, with the same fields as a serial run.
- `selection`: `true`, only on a `change`-tier `builtin.command` validation in a manifest that declares the top-level `selection` (see Scoped Selection). The validation runs only the selected tests. Any other value fails; the retired command form (`{ program, args }`) fails with `selection takes a prompt`.
- `fallbackPaths`: only on a `change`-tier `builtin.command` validation. An array of project-relative globs that add to the top-level `selection.fallbackPaths` when the validation opts in with `selection: true`. A validation that does not opt in runs its full command anyway, so its globs force nothing else to run in full.

  Each result records `tier` (or null) and `selection` (or null): `{ provider, reason, fallbackPath, selectedCount }`, where `provider` is `claude:<model>`.

## Scoped Selection

A manifest turns on scoped pre-merge verification with two optional top-level keys. `/sdlc-onboard-project` and `/sdlc-upgrade-project` detect and propose them (`verification-scope.md`). Full-tier runs, and manifests without `selection`, skip everything in this section.

- `selection`: `{ docPaths?, fallbackPaths?, coveragePaths? }`, each an array of project-relative globs without a leading `!`. An unknown key fails with `steering_manifest_invalid` (`selection`). A command object (`program` or `args`) fails with `steering_validation_invalid`: selection takes a prompt.
  - `docPaths`: a change whose every path that still exists matches one is docs-only and may select nothing. A path the change deletes leaves nothing to cover, so without `docPaths` only a deletion-only change is docs-only.
  - `fallbackPaths`: a changed path matching one runs everything (`fallback_path`), and Claude is not asked.
  - `coveragePaths`: the source and test globs the coverage report accounts for. Onboarding and upgrade read it to find tracked files nothing accounts for. The gate does not read it: check 4 accounts for a path through the coverage report, the selected tests, `docPaths` and the selected surfaces.
- `surfaces`: a non-empty array of `{ id, sources, validations? }`. `id` matches `^[a-z0-9][a-z0-9.-]*$` and is unique, `sources` is a non-empty array of globs, and `validations` names declared validation ids that do not set `selection: true` (an opted-in validation runs the selected tests, so it is never surface-bound). Violations fail with `steering_manifest_invalid` (`surfaces`).

**The selection call.** Before any validation runs, the change-tier gate makes one headless Claude call: `claude -p --model <m> [--effort <e>] --output-format json --json-schema <schema> --tools "" --no-session-persistence`, with a 300 000 ms timeout.
- The prompt is the bundled `gate:selection` fragment plus every project snippet routed to the `gate:selection` consumer. It is followed by the base ref, the changed paths, the diff (capped at 200 000 bytes), the surfaces, the project's files named like tests (tracked or untracked, outside `docPaths`, at most 3000) and any supervisor guidance.
- The model and effort come from the optional `selection: { model, effort }` entry of `steering/sdlc-models.json`, default `haiku` at `xhigh`. An invalid entry fails the gate with `stage_models_invalid`.
- The answer is `{ mode: "selected" | "all", tests, surfaces }`: at most 5000 unique test ids of at most 1024 characters and 1 MiB together, none an option (leading `-`), absolute or containing `..`, only declared surface ids, and no other key.
  - An id is unsafe both as given and once normalized, so `./--config=x.json` (normalized to `--config=x.json`) is rejected; a rebased id that would start with `-` keeps a leading `./`. Every directory a path-shaped id passes through must be a real directory, never a symlink.
  - A test id is path-shaped when its target (the part before any `::` node suffix) holds a `/`, and file-shaped when that path's last segment also has a file extension. Path-shaped ids are read from the project root, the directory the coverage command runs from, so the tests and the coverage run name the same files. A file-shaped id is normalized (POSIX-normalized, without a leading `./`) and must name a regular file, spelled exactly; any other path-shaped id (a directory, or a package such as `./pkg/...`) must name a file or a directory, spelled exactly.
  - Ids without a `/` (a test or package name) pass through unchanged, because only the project's runner knows how to read them. Each id is appended to the coverage command as given and to each opted-in command rebased onto that command's `cwd`: a path-shaped id is rewritten relative to the `cwd` (keeping a leading `./` and any `::` suffix), so a runner in a subdirectory finds the file. A path-shaped id naming the project root (`.`) is an unsafe id.
  - A selected test file that the change deletes is dropped.
  - A stored selection is checked against the same rules, and its reason against its lists, before it is reused.
- A non-zero exit, a timeout (which stops the call's whole process group, so a descendant holding its output never holds the gate), an `is_error` result, malformed output (or more than 64 MiB of it), an unsafe test id, a path-shaped id that names nothing in the project or an undeclared surface runs everything (`selection_failed`, with the exit status and Claude's stderr in `detail`), and an `all` answer does too (`selection_all`).
- The changed paths are listed without rename detection, so a committed rename names both its source and its target, and no path is exempt: a version bump that touches a `fallbackPaths` file runs everything.
- `sdlc-verify-steering.mjs --mode select` resolves the selection without running validations. The selection is stored in `.nmg-sdlc/verification/selection-<N>.json`, and the gate reuses it while the head, changed paths, diff, steering, prompt, guidance and model are unchanged.

**What the selection drives.**
- Opted-in validations (`selection: true`) run the selected tests. They pass as `selection_empty` without running when no test is selected, and run in full in `all` mode.
- A validation named in a surface's `validations` (any provider) runs only when one of its surfaces is selected. Otherwise it passes as `surface_not_selected` with evidence `surface_not_selected: no bound surface selected`. In `all` mode every surface is selected. Unbound validations run as before.
- Every provider request gains `changedPaths` and `selection: { mode, reason, surfaces }`. `surfaces` holds every declared id in `all` mode, and is `[]` for a docs-only change.

**The checks** run in selected mode only:
1. `selection_surface_missing`: a surface whose `sources` match a changed path outside `docPaths` is not selected; a doc path requires no surface. Extra surfaces are allowed. This is checked before anything runs.
2. `selection_empty_code_change`: no tests and no surfaces are selected, and a changed path that still exists is outside `docPaths`. A path the change deletes leaves nothing to cover, so a deletion-only change may select nothing. This is also checked before anything runs.
3. `selection_uncovered`: only after the opted-in validations pass, the `coverage` command of `steering/test-coverage.json` runs with the selected tests appended. Its report is `{ version: 1, tests: [{ id, file, lines, branches, outcomes }], executableLines? }`, where the optional `executableLines` are `path:N` entries naming the lines that hold code.
   - For each changed path the report covers, the changed lines (from `git diff -U0 --find-renames` against the merge base, so a moved file counts only the lines the move edited, plus untracked files) that are executable must be hit by a selected test. Without `executableLines`, the non-blank changed lines must be hit.
   - The coverage command runs only the selected tests, so the lines every test of its report hits count as hit, whatever form the selected ids take (a file, a directory, a package or a test name).
   - The command runs in a heavy-job slot in its own process group with the scrubbed environment of a `builtin.command` (the safe keys plus the opted-in validations' declared `env`), a one-hour timeout and the gate's abort signal. A timeout or abort stops the whole group; the gate settles at once even when a descendant still holds the command's output. An aborted run leaves the opted-in results `incomplete` with reason `coverage_cancelled`, and a timeout or a report over 256 MiB fails them as `coverage_failed`.
   - Each opted-in result records `coverage: { changedLines, hitLines, uncovered, counts }`; each list keeps at most 200 entries and `counts` holds the full lengths.
   - A missing or invalid coverage config accounts for no path through the report; the opted-in results record its state as `coverage_skipped: steering/test-coverage.json is missing` or `… is invalid: <reason>`. A failing coverage command fails the opted-in results as `coverage_failed`, which is an ordinary failure.
4. `selection_unaccounted`: a changed path that still exists is none of these: a path in the report's line records, the path a selected path-shaped test names, the `file` of a test in the coverage report, under `docPaths`, or under a selected surface's `sources`. A path the change deletes is always accounted for: nothing of it is left to cover, and a surface its sources match must still be selected (check 1) unless it is a doc path. (A change to `fallbackPaths` never reaches this check: it runs everything in full.)

Failing selected tests, a failing coverage command, or any failing required local command are ordinary failures for implement to repair: neither check 3 nor check 4 runs after them, so they never escalate. Because the selection is then unchecked, an opted-in result that did not pass caps the gate's ceiling at `Fail` (`Incomplete` when it is incomplete) even when the validation is not required. A required result the checks fail defers the project providers, as a failed local command does.

A rejection makes the affected validations `failed`, naming the surfaces, lines or paths, and caps the gate's ceiling at `Fail` even when it affects no applicable validation. For `selection_uncovered` the affected validations are the opted-in ones; otherwise they are the opted-in and surface-bound ones. The artifact's top-level `selection` records:
- `prompt: { consumer, fragments: [{ id, hash }] }`, `model` and `effort`;
- `mode`, `reason`, `fallbackPath`, `tests`, `surfaces` and `requiredSurfaces`;
- `guidanceSupplied`;
- `rejection: null | { reasonCode, uncovered, missingSurfaces, unaccounted, truncated }`, each list capped at 200 entries and `truncated` counting the rest.

**Escalation.** The verify finalizer turns a rejection into a failed handoff with `reasonCode: "selection_escalation"`, `intervention: false`, `next: "verify"` and `escalation: { kind: "selection", reasonCode, uncovered, missingSurfaces, unaccounted, truncated }`, bounded the same way.
- `/sdlc-execute` presents it to its supervising session with only `redispatch` and `halt`, and never routes the branch to implement.
- A `redispatch --text` stores the guidance in `.nmg-sdlc/verification/selection-guidance-<N>.json` for the current head, and binds it again to the head of each later verify dispatch until an implement stage runs (which deletes it), so queue-head integration, version preparation and a controller restart do not drop it. The rerun gate appends it to the selection prompt and records `guidanceSupplied: true`.
- An unsupervised run stops with `selection_escalation`.

## Deterministic Validations

Core evaluates the closed `when.kind` grammar before provider launch: `always`, `changed_paths`, `path_exists`, or `glob_exists`. Providers cannot decide applicability.

Built-ins:

- `builtin.command`: explicit `program` and `args`, project-bounded `cwd`, named environment keys, `shell: false`;
- `builtin.artifact`: regular-file checks for nonempty, JSON, SHA-256, or contained text;
- `builtin.external-evidence`: schema-valid identity-bound result envelope from an external deterministic harness.

Every request and result binds to head SHA, clean/dirty tree identity, spec hash, steering hash, and validation-config hash. Provider requests expose an explicit cancellation signal but no automatic deadline. Each successful artifact includes declaration/result `coverage`: declared and recorded counts, a completeness boolean, and deterministic missing, duplicate, and unknown id arrays. Zero declarations plus zero results is complete and does not impose a ceiling. Any missing, duplicate, or unknown result makes coverage incomplete and caps verification at `Incomplete`. When coverage is complete, only a schema-valid `passed` result with non-empty evidence satisfies an applicable required validation. Failure caps verification at `Fail`; malformed, stale, crashed, explicitly cancelled, process-lost, skipped, or not-applicable required results cap it at `Incomplete`. Optional results remain evidence without raising the ceiling.

## Mutation

`node scripts/sdlc-steering.mjs inspect|validate|apply` is the sole writer contract. `/sdlc-steering`, onboarding, and upgrade create an exact approval payload for `initialize`, `update`, or `migrate`. Apply checks the approved source digest, constructs and validates the complete candidate runtime, then performs only named actions. Failed staging or validation leaves live steering unchanged. Migration deletes legacy Markdown authorities only after their prose is preserved in registered snippets and the candidate validates.
