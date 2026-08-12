# Root Cause Analysis: Fix nmg-sdlc steering and skill-contract documentation drift

**Issue**: #142
**Date**: 2026-07-31
**Status**: Investigating
**Author**: Rich Nunley
**Related Spec**: `specs/feature-setup-steering-skill/`

---

## Root Cause

The repository was extracted from the broader `nmg-plugins` context into a standalone Codex plugin, and the executable/public entry surfaces were updated: `.codex-plugin/plugin.json`, `README.md`, and `AGENTS.md` identify `nmg-sdlc` correctly. The human-authored steering documents did not receive the same semantic reconciliation. Their headings, mission, self-references, and manifest example still identify the former monorepo as the product or repository.

The same steering files also retained generic template content and older resource assumptions. `steering/tech.md` claims SKILL.md files declare `allowedTools`, describes execution-control fields on reusable agent prompt contracts, and contains an unfilled database standards section. `steering/structure.md` contains an unfilled UI/design-token section even though this repository is a prompt-based plugin with no UI layer. These claims contradict active skill frontmatter, active `agents/*.md`, and the standalone manifest.

The drift persisted because existing tests validate runner behavior, individual workflow contracts, and plugin inventory, but no test checks the repo-specific steering documents against the active plugin identity and resource shape. A blind repository-wide ban on `nmg-plugins` would be incorrect because README installation guidance, installed-cache paths, and legacy migration logic intentionally use that name.

### Affected Code

| File | Lines | Role |
|------|-------|------|
| `steering/product.md` | 1, 10 | Uses the former monorepo identity in the product heading and mission. |
| `steering/tech.md` | 1, 127, 150-155, 224-228, 246-256, 308, 435 | Contains stale identity, inactive skill/agent metadata claims, inapplicable placeholders, and stale self-references. |
| `steering/structure.md` | 1, 192-201, 222-228 | Contains stale identity, the wrong manifest repository example, and an inapplicable UI/design-token placeholder section. |
| `scripts/__tests__/` | N/A | Has no contract test covering steering identity, placeholder resolution, or live resource-shape consistency. |

### Triggering Conditions

- A future SDLC skill reads the repo's steering documents as authoritative project context.
- A maintainer trusts the steering contract without manually comparing it to active skills, agents, references, and the manifest.
- A broad search sees both stale and legitimate `nmg-plugins` references but has no contextual rule for distinguishing them.
- Existing test suites pass because they do not assert the semantics of repo-specific steering.

---

## Fix Strategy

### Approach

Apply targeted documentation corrections to the three repo-specific steering files, using `.codex-plugin/plugin.json`, active skill frontmatter, active agent prompt contracts, and shared Codex tooling references as the source of truth. Remove only placeholder sections that are inapplicable to this repository; leave reusable consumer templates and legitimate marketplace, cache, and legacy compatibility references unchanged.

Add one focused Jest contract test under `scripts/__tests__/` to pin the corrected semantics. The test should assert stable contract facts rather than snapshotting whole documents, which keeps it useful without making harmless prose edits expensive.

### Changes

| File | Change | Rationale |
|------|--------|-----------|
| `steering/product.md` | Replace the stale heading and mission identity with `nmg-sdlc`. | Align the primary product context with the standalone manifest and README. |
| `steering/tech.md` | Correct project identity and self-references; replace inactive `allowedTools` and agent execution-control claims with the active resource contract; remove the unfilled database standards section. | Prevent future specs and verification from treating obsolete or inapplicable guidance as authoritative. |
| `steering/structure.md` | Correct project identity and the manifest repository example; remove the unfilled UI/design-token section. | Align structural guidance with the checked-in plugin and eliminate irrelevant placeholders. |
| `scripts/__tests__/steering-contract.test.mjs` | Add targeted assertions for standalone identity, resolved repo-specific placeholders, and active skill/agent metadata semantics. | Make future drift fail in the existing Jest suite while preserving intentional external and legacy references. |

The implementation audit includes `README.md`, `AGENTS.md`, active `skills/*/SKILL.md`, shared `references/`, `agents/*.md`, and `.codex-plugin/plugin.json`, but current evidence does not require modifying those files. If implementation discovers a real stale contract in a skill-bundled file, the design must be amended and that edit routed through `$skill-creator` rather than expanding T001 silently.

### Blast Radius

- **Direct impact**: Three repo-specific steering documents and one new contract test.
- **Indirect impact**: Every SDLC workflow that consumes steering will receive corrected project identity and resource-contract context. The full Jest suite gains one fast static test.
- **Unaffected surfaces**: Runtime behavior, public installation commands, marketplace distribution, legacy path support, generic onboarding templates, historical specs, and versioning artifacts.
- **Risk level**: Low.

---

## Regression Risk

| Risk | Likelihood | Mitigation |
|------|------------|------------|
| A valid `nmg-plugins` marketplace, cache, or legacy-layout reference is replaced or rejected. | Medium | Scope edits to repo-specific steering claims and test contextual facts instead of banning the string globally. |
| Generic onboarding templates lose placeholders needed for consumer-project discovery. | Low | Exclude `skills/onboard-project/templates/` from this fix and assert only the checked-in repo steering is fully resolved. |
| The regression test becomes brittle under harmless wording changes. | Medium | Assert identity values, prohibited inactive terms, and required metadata semantics rather than full-file snapshots. |
| Correcting agent guidance accidentally changes agent runtime behavior. | Low | Modify steering only; do not edit `agents/*.md` because their current prompt-contract shape is already correct. |

---

## Alternatives Considered

| Option | Description | Why Not Selected |
|--------|-------------|------------------|
| Global `nmg-plugins` search-and-replace | Replace every occurrence across the repository. | Would corrupt intentional marketplace installation, installed-cache, and legacy migration references. |
| Documentation-only correction without tests | Edit the three steering files and rely on review. | Repeats the original failure mode; nothing would prevent later template or migration work from reintroducing stale claims. |
| Move the checks into `skill-inventory-audit.mjs` | Extend the packaging inventory audit to validate steering semantics. | Steering correctness is a repository contract rather than skill inventory shape; a focused Jest test is smaller and keeps ownership clear. |

---

## Validation Checklist

- [x] Root cause is identified with specific file and line references
- [x] Fix is minimal and excludes unrelated refactoring
- [x] Blast radius is assessed
- [x] Regression risks are documented with mitigations
- [x] Fix follows the existing zero-dependency Jest contract-test pattern
- [x] Skill-bundled files are audit-only unless the design is explicitly amended

---

## Change History

| Issue | Date | Summary |
|-------|------|---------|
| #142 | 2026-07-31 | Initial defect report |
