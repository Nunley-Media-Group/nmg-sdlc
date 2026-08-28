# Root Cause Analysis: Repair obsolete steering manifests during project upgrades

**Issue**: #314
**Date**: 2026-08-28
**Status**: Approved
**Author**: NMG
**Related Spec**: specs/291-enforce-one-controller-writer-and-close-stale-workers/

---

## Root Cause

The strict steering runtime intentionally accepts exactly `id`, `path`, `consumers`, `slot`, and `order` on each project snippet record. `canonicalSnippetRecord` and `loadSteeringRuntime` therefore reject the obsolete `byteBound` field with `steering_manifest_unknown_key`. That clean-cutover rule is correct for ordinary runtime loading and must remain unchanged.

The supported migration boundary cannot currently repair the rejected state. `detectSteeringRuntime` in `scripts/sdlc-upgrade.mjs` returns `null` immediately when no legacy `steering/{product,tech,structure}.md` files exist and `steering/manifest.json` does exist. It never inspects the manifest for the one known obsolete field. Interactive prompt registry construction then surfaces only `project_runtime_invalid`, leaving users unable to reach a supported repair.

**Version bump**: patch

### Affected Code

| File | Role |
|------|------|
| `scripts/sdlc-upgrade.mjs` | `detectSteeringRuntime` decides whether to offer a managed steering repair; `applySteeringRuntime` already stages and validates approved plans |
| `scripts/sdlc-steering.mjs` | `canonicalSnippetRecord`, `steeringSourceDigest`, and apply enforce strict schema, source binding, candidate validation, and atomic live replacement |
| `scripts/__tests__/sdlc-upgrade.test.mjs` | Managed steering detection, application, preservation, and stale-plan regression coverage |
| `scripts/__tests__/steering-contract.test.mjs` | Public README installation contract |
| `README.md` | Installation and post-update project migration guidance |

### Triggering Conditions

- `steering/manifest.json` exists and has at least one snippet record with `byteBound`.
- No legacy `steering/product.md`, `steering/tech.md`, or `steering/structure.md` file exists.
- Upgrade detection takes its current manifest-present early return.
- Ordinary prompt-fragment loading validates the strict current schema.

---

## Fix Strategy

### Approach

Add a migration-only current-manifest inspection before `detectSteeringRuntime` returns `null`. When at least one snippet contains `byteBound`, clone the parsed manifest, remove only that key, and validate every resulting snippet through existing `canonicalSnippetRecord`. Any other unknown snippet key, malformed record, or malformed manifest fails closed instead of producing a partial repair.

Produce an `update` plan with the exact current `steeringSourceDigest` and one write action for `steering/manifest.json`. Reuse `applySteeringRuntime`, which invokes `sdlc-steering apply`; that path checks the approved digest, stages the candidate tree, loads the strict runtime, rechecks the digest, and only then replaces live files. Do not weaken `canonicalSnippetRecord`, `loadSteeringRuntime`, or prompt registry error handling.

### Locked repair contract

1. Applies only when a current-layout manifest exists and no legacy steering Markdown exists.
2. Requires `manifest.snippets` to be an array and at least one record to own `byteBound`.
3. Removes `byteBound` from cloned records, then calls existing `canonicalSnippetRecord` on every resulting record.
4. Any additional unknown field causes `steering_manifest_unknown_key`; no repair item is returned.
5. Preserves every other top-level manifest value and every canonical snippet value.
6. Emits a digest-bound `mode: "update"` plan whose only action writes `steering/manifest.json`.
7. Leaves manifests without `byteBound` on the existing no-op path.

### Changes

| File | Change | Rationale |
|------|--------|-----------|
| `scripts/sdlc-upgrade.mjs` | Inspect current-layout manifests for `byteBound`; build the locked manifest-only update plan; retain existing legacy migration behavior | AC1, AC2, AC5 — exposes a safe explicit repair without weakening runtime validation |
| `scripts/__tests__/sdlc-upgrade.test.mjs` | Cover non-mutating detection, apply preservation, stale-plan rejection, post-repair runtime loading, idempotence, and additional-unknown-key failure | AC1, AC2, AC3, AC5 |
| `README.md` | Add prominent post-install/post-update `/sdlc-upgrade-project` instruction before other workflow guidance | AC4 |
| `scripts/__tests__/steering-contract.test.mjs` | Lock the required README guidance | AC4 |

### Blast Radius

- **Direct impact**: current-layout branch of `detectSteeringRuntime`; managed steering upgrade fixtures; README installation text.
- **Indirect impact**: `detectUpgrade` gains one actionable item for previously stranded projects; `applyUpgrade` continues routing it through unchanged `applySteeringRuntime`.
- **Unaffected**: ordinary runtime schema, legacy Markdown migration, prompt registry error mapping, manifest registrations other than `byteBound`, and project-owned files.
- **Risk level**: Medium — the repair writes the registration authority, but only through digest-bound staged validation.

---

## Regression Risk

| Risk | Likelihood | Mitigation |
|------|------------|------------|
| Additional unknown fields are silently accepted | Low | Strip only `byteBound`, then run every record through strict `canonicalSnippetRecord` |
| Approved evidence becomes stale before apply | Low | Bind the plan to `steeringSourceDigest`; assert `steering_plan_stale` and no mutation |
| Registrations or snippet bodies are lost | Low | Use a manifest-only action and assert semantic preservation of every other manifest section plus byte-identical bodies |
| Repair repeats forever | Low | After apply no record has `byteBound`, so a second detection returns no steering-runtime item |
| Legacy migration changes accidentally | Low | Keep the legacy branch and its existing tests unchanged; current-layout repair is selected only when legacy files are absent |

---

## Alternatives Considered

| Option | Description | Why Not Selected |
|--------|-------------|------------------|
| Accept `byteBound` in ordinary runtime loading | Add a compatibility alias or ignore the field everywhere | Violates the strict clean-cutover contract and AC5 |
| Reinitialize the complete steering runtime | Regenerate modules, snippets, and manifest through `createInitializePlan` | Unnecessarily rewrites managed and project-owned content when only one manifest field is obsolete |
| Repair `byteBound` together with legacy Markdown | Expand the existing legacy migration path in the same change | Rejected by interview scope; broader states and preservation rules belong to a separate contract |

---

## Change History

| Issue | Date | Summary |
|-------|------|---------|
| #314 | 2026-08-28 | Initial defect report |
