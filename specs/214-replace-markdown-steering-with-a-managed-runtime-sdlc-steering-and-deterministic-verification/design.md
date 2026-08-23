# Design: Managed steering runtime and deterministic verification

**Issue**: #214
**Date**: 2026-08-23
**Status**: Approved
**Author**: NMG
**Related Spec**: specs/213-add-a-prompt-snippet-registry-for-command-and-worker-composition/

---

## Overview

Replace the three free-form steering authorities with a versioned manifest, four plugin-managed modules, registered project snippets, and optional trusted project extensions. Add a deterministic verification runner that evaluates applicability, resolves providers, validates results, and computes the verification ceiling in code before the workflow writes its report or handoff.

The implementation is a clean cutover. Consumers load `steering/manifest.json`; they do not fall back to `product.md`, `tech.md`, or `structure.md`. Migration is explicit and approval-gated. `steering/retrospective.md` remains independently owned.

Issue #213 is a hard implementation dependency. Extend its registry APIs; do not bypass them.

## Project layout

```text
steering/
  manifest.json
  modules/
    product.mjs
    tech.mjs
    structure.mjs
    verification.mjs
  snippets/
    project-product.md
    project-tech.md
    project-structure.md
  extensions/
    *.mjs
  retrospective.md
```

Plugin-owned templates live at `workflows/steering/templates/modules/*.mjs`. The project copies are managed files. Snippets and extensions are project-owned. The manifest is project-owned registration data but contains a `managedFiles` table that identifies replaceable copies and their installed template hashes.

## Public command and shared writer

Add `workflows/steering/WORKFLOW.md` and add `['sdlc-steering', 'steering', ...]` to `INTERACTIVE_COMMANDS`. The command receives natural-language `$ARGUMENTS`, inspects the repository and current runtime, writes an exact local plan plus machine-readable apply payload, and ends at `xd://propose`. The extension's existing interactive/headless behavior supplies `/plan` and `Run /sdlc-steering in the TUI.`.

Add `scripts/sdlc-steering.mjs` with deterministic CLI operations:

```text
node scripts/sdlc-steering.mjs inspect --project <root>
node scripts/sdlc-steering.mjs validate --project <root>
node scripts/sdlc-steering.mjs apply --project <root> --plan <json>
```

`inspect` and `validate` are read-only JSON commands. `apply` accepts a schema-validated plan with mode `initialize`, `update`, or `migrate` and an exact list of snippet, extension, validation, and managed-file actions. `/sdlc-steering`, onboard, and upgrade all call this command; they do not duplicate writes.

`apply` builds the complete candidate tree in a temporary sibling directory, validates it, and only then applies its exact action list. It writes files by rename from same-filesystem temporary files. Before each live mutation it compares the source-state digest recorded by the approved plan; mismatch fails `steering_plan_stale`. On any staging or validation error the live steering tree is unchanged. A live write failure reports `steering_apply_failed`; already-applied prior renames are reported explicitly rather than claimed atomic.

## Manifest v1

`steering/manifest.json` has exactly these top-level keys:

```json
{
  "schemaVersion": 1,
  "runtimeVersion": "1",
  "managedFiles": [],
  "modules": [],
  "snippets": [],
  "extensions": [],
  "validations": []
}
```

Unknown keys fail `steering_manifest_unknown_key`. All paths are POSIX-style project-relative paths under `steering/`, must be regular files, must not traverse `..`, and must not resolve through a symlink outside `steering/`; violations fail `steering_path_outside_root`.

### Managed files and modules

`managedFiles[]` records `{ path, template, sha256 }`. Paths are exactly the four `steering/modules/{role}.mjs` files. `template` is the plugin-relative template path and `sha256` is the installed file hash. Upgrade may replace only these paths and only when the approved plan names the replacement. Unknown files are never deleted.

`modules[]` contains exactly four records `{ id, role, path }`; `id` and `role` are each one of `product`, `tech`, `structure`, `verification`, once each. Each module default-exports a frozen descriptor `{ schemaVersion: 1, id, role }`. Missing, duplicate, extra, or mismatched roles fail `steering_module_invalid`.

### Snippets

`snippets[]` records:

```json
{
  "id": "project.tech.testing",
  "path": "steering/snippets/project-tech.md",
  "consumers": ["sdlc-write-spec", "worker:implement", "worker:verify"],
  "slot": "body",
  "order": 500,
  "byteBound": 8192
}
```

Ids are non-empty dotted identifiers. Consumer and slot values must be allowed by the issue #213 registry. The runtime converts each record to a registry fragment with provider `project:<id>` and source equal to the manifest path. The registry is extended to accept these records only from a successfully validated runtime and only under the project `steering/snippets` root. Direct project registration and directory scanning remain forbidden. Ordering, placeholder checks, byte bounds, hashes, and provenance reuse `renderPrompt`.

### Extensions and providers

`extensions[]` records `{ id, path, providers }`, where `providers` is a non-empty array of globally unique provider ids. An extension module must export `extension`:

```js
export const extension = Object.freeze({
  schemaVersion: 1,
  id: 'project.web',
  providers: Object.freeze({
    'project.playwright': async (request) => result,
  }),
});
```

The exported id and provider keys must exactly match the manifest. Duplicate extension or provider ids fail `steering_duplicate_id`; load or shape failures fail `steering_extension_invalid`. Project extensions are trusted code but receive an immutable request and may return only the result schema. They receive no lifecycle or handoff writer API.

### Validations

`validations[]` records exactly:

```json
{
  "id": "repository.tests",
  "provider": "builtin.command",
  "required": true,
  "when": { "kind": "always" },
  "timeoutMs": 120000,
  "config": {
    "program": "npm",
    "args": ["test", "--", "--runInBand"],
    "cwd": "scripts",
    "env": []
  }
}
```

Allowed `when.kind` values are:

- `always`
- `changed_paths`, with non-empty `include` globs and optional `exclude` globs, evaluated against the issue-scoped base-to-head diff plus dirty paths
- `path_exists`, with one project-relative `path`
- `glob_exists`, with one project-relative `root` and `pattern`

No expressions, shell, negation language, or provider-defined conditions exist. Invalid conditions fail `steering_condition_invalid`. Core records false conditions as `skipped` and does not resolve or launch the provider.

Validation ids are unique. `provider` must resolve exactly once across built-ins and extensions or validation fails `steering_provider_unresolved` / `steering_duplicate_id`. `timeoutMs` is an integer from 1 through 900000. `config` is provider-specific and schema-validated before execution.

## Built-in providers

Add `src/sdlc-verification-runtime.mjs` with these built-ins:

- `builtin.command`: config `{ program, args, cwd, env }`; uses `spawn` with an explicit program and argument array, `shell: false`, project-bounded cwd, timeout, and an environment limited to inherited safe process values plus named keys. Exit 0 returns passed evidence containing command, exit code, and bounded stdout/stderr; non-zero returns failed; launch error or timeout returns incomplete.
- `builtin.artifact`: config `{ path, checks }`; checks regular-file existence plus closed checks `nonempty`, `json`, `sha256`, or `contains`. Missing or mismatched artifacts fail; unreadable or invalid configuration is incomplete.
- `builtin.external-evidence`: config `{ path }`; reads a schema-valid provider-result envelope written by an external deterministic harness. Identity must match the current request; missing, malformed, or stale evidence is incomplete. It never launches a browser or simulator itself.

Configuration unknown keys fail `steering_validation_config_invalid`. Command strings and `sh -c` are not accepted.

## Provider request, result, and identity

Core supplies:

```json
{
  "schemaVersion": 1,
  "validationId": "repository.tests",
  "projectRoot": "/absolute/project",
  "timeoutMs": 120000,
  "config": {},
  "identity": {
    "headSha": "40-hex",
    "treeState": "clean",
    "dirtyDiffHash": null,
    "specHash": "sha256:...",
    "steeringHash": "sha256:...",
    "validationConfigHash": "sha256:..."
  }
}
```

For a dirty tree, `treeState` is `dirty` and `dirtyDiffHash` hashes the canonical staged, unstaged, and untracked path/content inventory. `specHash` hashes the four approved spec files in path order. `steeringHash` hashes the manifest, modules, snippets, and extension source files in manifest order. `validationConfigHash` hashes canonical JSON for the validation. Hashing uses UTF-8 bytes and `sha256:` prefixes.

Provider result schema is:

```json
{
  "schemaVersion": 1,
  "status": "passed",
  "summary": "tests passed",
  "identity": {},
  "evidence": [{ "kind": "command", "summary": "npm test exited 0", "artifact": null }]
}
```

Allowed statuses are `passed`, `failed`, `incomplete`, `skipped`, and `not_applicable`. Summary is non-empty; evidence is a non-empty bounded array for passed results; identity must exactly equal the request identity. Malformed output or identity mismatch becomes incomplete.

Core, never the provider, determines the effective result. If `when` is true and `required` is true, only effective `passed` satisfies the gate. Provider `skipped` or `not_applicable`, missing result, crash, timeout, malformed result, or stale identity becomes `incomplete`. Optional validations are recorded but do not cap status.

## Verification integration

Export `runSteeringValidations({ projectRoot, issue, specDir, baseRef })` and `verificationCeiling(results)`. The runner loads and validates the runtime once, evaluates all conditions, runs applicable validations in manifest order, and writes `.omp/sdlc/verification/<issue>.json` with request identities and results.

Update `workflows/verify-code/WORKFLOW.md` and generated `commands/sdlc-verify-code.md` to invoke this runner before report aggregation. The execute verify worker consumes the same inlined workflow and therefore uses the same runner. Remove the free-form verification-gate extraction path and update `workflows/verify-code/references/verification-gates.md` to describe the manifest contract or remove it if no longer referenced.

Ceiling rules:

- all applicable required results passed: no additional ceiling
- any required failed: overall cannot exceed `Fail`
- any required incomplete: overall cannot exceed `Incomplete`
- unresolved provider, duplicate id, invalid runtime, or runner crash: overall `Incomplete`
- `Pass` and `PR Evidence Pending` are forbidden unless every applicable required validation passed

The workflow reads the JSON artifact; prose and snippets cannot override it. The handoff status remains `passed` only for final `Pass` or `PR Evidence Pending`; execute step order and handoff schema do not change.

## Migration, onboard, and upgrade

Migration reads the three legacy documents and writes their project-specific prose verbatim into `project-product.md`, `project-tech.md`, and `project-structure.md` with manifest registrations. A parser may suggest command validations from the old Verification Gates table, but ambiguous rows remain prose and are reported for explicit plan approval; they are never silently executable.

After staging the new runtime and validating all modules, registrations, and provider references, migration deletes the legacy three files as explicit approved actions. `retrospective.md`, unknown files, snippets, and extensions are preserved.

`workflows/onboard-project/WORKFLOW.md` stops filling old templates and generates an initialize plan for the shared writer. `workflows/upgrade-project/WORKFLOW.md` and `scripts/sdlc-upgrade.mjs` add a steering-runtime category whose approved action calls the writer in migrate/update mode. No other upgrade category may mutate steering runtime paths.

## Error codes

| Code | Meaning |
|------|---------|
| `steering_manifest_missing` | Manifest does not exist for a consumer that requires steering. |
| `steering_manifest_invalid` | JSON or required schema field is invalid. |
| `steering_manifest_unknown_key` | Manifest or record contains an unknown key. |
| `steering_duplicate_id` | Duplicate module, extension, provider, validation, or snippet identity. |
| `steering_path_outside_root` | A registered path escapes `steering/` or its allowed subtree. |
| `steering_module_invalid` | Fixed role set or module export is invalid. |
| `steering_extension_invalid` | Extension cannot load or its export differs from the manifest. |
| `steering_provider_unresolved` | Validation provider resolves zero times. |
| `steering_condition_invalid` | `when` is outside the closed grammar. |
| `steering_validation_config_invalid` | Provider config is malformed or unsafe. |
| `steering_result_invalid` | Provider result is malformed. |
| `steering_evidence_stale` | Result identity differs from the current request. |
| `steering_plan_stale` | Approved source-state digest no longer matches. |
| `steering_apply_failed` | Staging or live application failed. |

## Tests

Add focused unit tests for manifest schema, path and symlink containment, id uniqueness, module and extension exports, all condition kinds, provider resolution, result validation, identity hashes, required/optional aggregation, provider self-skip conversion, and each stable error code.

Add integration tests for the steering CLI initialize/update/migrate paths; staged-validation no-mutation behavior; preservation of unknown files, project snippets/extensions, and retrospective; deletion of legacy authority only after success; onboard and upgrade delegation; command registration/headless behavior; registry-only snippet injection and provenance; verify-code artifact/report/handoff ceilings; and command/inventory/plugin-surface synchronization.

Update existing steering, contribution-guide, skill-inventory, exercise, prompt-byte, and workflow contract fixtures rather than retaining assertions for the old three-file authority.

## Change History

| Issue | Date | Summary |
|-------|------|---------|
| #214 | 2026-08-23 | Initial feature spec |
