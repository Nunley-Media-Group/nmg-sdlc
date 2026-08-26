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

The manifest has exactly `schemaVersion`, `runtimeVersion`, `managedFiles`, `modules`, `snippets`, `extensions`, and `validations`. Unknown keys fail. All registered paths are POSIX project-relative regular files under their allowed `steering/` subtree; traversal, absolute paths, and symlink escape fail.

- `managedFiles[]`: `{ path, template, sha256 }` for exactly the four module copies.
- `modules[]`: `{ id, role, path }` for exactly `product`, `tech`, `structure`, and `verification`.
- `snippets[]`: `{ id, path, consumers, slot, order }`. Consumers and slots must be allowed by the prompt registry. Provenance, ordering, placeholders, and hashes use the shared renderer. A leftover project-manifest `byteBound` is accepted and ignored for compatibility; project fragments are not size-capped. Plugin catalog fragments still declare and enforce registry `byteBound` values.
- `extensions[]`: `{ id, path, providers }`. The module exports one frozen `extension` descriptor whose id and provider keys exactly match.
- `validations[]`: `{ id, provider, required, when, timeoutMs, config }`. Provider ids resolve exactly once.

## Deterministic Validations

Core evaluates the closed `when.kind` grammar before provider launch: `always`, `changed_paths`, `path_exists`, or `glob_exists`. Providers cannot decide applicability.

Built-ins:

- `builtin.command`: explicit `program` and `args`, project-bounded `cwd`, named environment keys, `shell: false`;
- `builtin.artifact`: regular-file checks for nonempty, JSON, SHA-256, or contained text;
- `builtin.external-evidence`: schema-valid identity-bound result envelope from an external deterministic harness.

Every request and result binds to head SHA, clean/dirty tree identity, spec hash, steering hash, and validation-config hash. Each successful artifact includes declaration/result `coverage`: declared and recorded counts, a completeness boolean, and deterministic missing, duplicate, and unknown id arrays. Zero declarations plus zero results is complete and does not impose a ceiling. Any missing, duplicate, or unknown result makes coverage incomplete and caps verification at `Incomplete`. When coverage is complete, only a schema-valid `passed` result with non-empty evidence satisfies an applicable required validation. Failure caps verification at `Fail`; malformed, stale, crashed, timed-out, skipped, or not-applicable required results cap it at `Incomplete`. Optional outcomes are recorded but do not cap status.

## Mutation

`node scripts/sdlc-steering.mjs inspect|validate|apply` is the sole writer contract. `/sdlc-steering`, onboarding, and upgrade create an exact approval payload for `initialize`, `update`, or `migrate`. Apply checks the approved source digest, constructs and validates the complete candidate runtime, then performs only named actions. Failed staging or validation leaves live steering unchanged. Migration deletes legacy Markdown authorities only after their prose is preserved in registered snippets and the candidate validates.
