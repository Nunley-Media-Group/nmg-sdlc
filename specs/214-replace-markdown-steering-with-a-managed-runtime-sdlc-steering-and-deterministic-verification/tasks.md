# Tasks: Managed steering runtime and deterministic verification

**Issue**: #214
**Date**: 2026-08-23
**Status**: Approved
**Author**: NMG
**Related Spec**: specs/213-add-a-prompt-snippet-registry-for-command-and-worker-composition/

---

## Summary

| Phase | Tasks | Status |
|-------|-------|--------|
| Runtime | 3 | [ ] |
| Integration | 4 | [ ] |
| Verification | 2 | [ ] |
| **Total** | 9 | |

---

### T001: Implement steering manifest loader and validator

**File(s)**: `src/sdlc-steering-runtime.mjs`
**Type**: Create
**Depends**: #213 merged and closed
**Acceptance**:
- [ ] Validates manifest v1, fixed module roles, exact record keys, project-bounded regular-file paths, and symlink containment
- [ ] Loads module and extension exports and rejects duplicate or unresolved identities with the design reason codes
- [ ] Computes deterministic steering and registration hashes

### T002: Add managed module templates and shared writer

**File(s)**: `workflows/steering/templates/modules/*.mjs`, `scripts/sdlc-steering.mjs`
**Type**: Create
**Depends**: T001
**Acceptance**:
- [ ] Supplies exactly product, tech, structure, and verification managed module templates
- [ ] Implements read-only `inspect`/`validate` plus approval-driven `apply` modes initialize, update, and migrate
- [ ] Stages and validates the complete candidate runtime before live writes and rejects stale plans
- [ ] Replaces only manifest-marked managed files and preserves unknown project files

### T003: Extend prompt registry for validated project snippets

**File(s)**: `src/sdlc-prompt-snippets.mjs`, `src/sdlc-steering-runtime.mjs`
**Type**: Modify
**Depends**: #213, T001
**Acceptance**:
- [ ] Converts only manifest-registered files under `steering/snippets/` to `project:<id>` fragments
- [ ] Reuses allowed consumers, slots, order, byte bounds, hashes, and provenance from issue #213
- [ ] Does not scan project directories or expose direct unvalidated project registration

### T004: Add `/sdlc-steering` interactive workflow

**File(s)**: `workflows/steering/WORKFLOW.md`, `src/sdlc-commands.mjs`, `src/extension.ts`, `README.md`
**Type**: Create/Modify
**Depends**: T002
**Acceptance**:
- [ ] Registers `/sdlc-steering [prompt]` as an interactive native-plan command
- [ ] Workflow inspects state, proposes exact changes, and calls the shared writer only after approval
- [ ] Print/RPC/headless invocation emits exactly `Run /sdlc-steering in the TUI.
`
- [ ] Public docs and prompt/inventory surfaces include the command

### T005: Migrate onboard and upgrade to the shared writer

**File(s)**: `workflows/onboard-project/WORKFLOW.md`, `workflows/upgrade-project/WORKFLOW.md`, `scripts/sdlc-upgrade.mjs`, `references/steering-schema.md`
**Type**: Modify
**Depends**: T002
**Acceptance**:
- [ ] Onboard initializes the managed runtime instead of live product/tech/structure Markdown
- [ ] Upgrade exposes an approval-gated steering-runtime category and uses migrate/update mode
- [ ] Successful migration preserves project prose as snippets, removes legacy authority, and preserves retrospective and unknown files
- [ ] Steering schema documents generated runtime ownership and project-owned snippets/extensions

### T006: Implement deterministic validation providers and runner

**File(s)**: `src/sdlc-verification-runtime.mjs`, `scripts/sdlc-verify-steering.mjs`
**Type**: Create
**Depends**: T001
**Acceptance**:
- [ ] Core evaluates all closed `when` kinds before provider launch
- [ ] Built-in command provider uses explicit program/argv with `shell: false`; artifact and external-evidence providers validate schemas
- [ ] Provider results bind to head, tree, spec, steering, and config identity
- [ ] Applicable required skipped/not_applicable, crash, timeout, malformed, stale, failed, or missing results cannot satisfy verification
- [ ] Writes `.omp/sdlc/verification/<issue>.json` with every declared validation outcome

### T007: Integrate verification ceiling into verify-code

**File(s)**: `workflows/verify-code/WORKFLOW.md`, `workflows/verify-code/references/verification-gates.md`, `commands/sdlc-verify-code.md`
**Type**: Modify
**Depends**: T006
**Acceptance**:
- [ ] Interactive and execute verify paths call the same runner and consume its JSON artifact
- [ ] Invalid runtime or any required non-pass forbids Pass and PR Evidence Pending according to design ceilings
- [ ] Prompt prose cannot override core results
- [ ] Execute step order, handoff schema, and PR-evidence identity contracts remain unchanged

### T008: Add runtime, migration, and verification regression tests

**File(s)**: `scripts/__tests__/sdlc-steering*.test.mjs`, `scripts/__tests__/sdlc-verification*.test.mjs`, existing command/workflow tests
**Type**: Create/Modify
**Depends**: T003-T007
**Acceptance**:
- [ ] Covers every manifest/error/condition/provider/result/identity contract and required-vs-optional ceiling
- [ ] Proves failed staged validation leaves live steering unchanged
- [ ] Proves initialize/update/migrate preserve owned project files and remove legacy authority only on success
- [ ] Proves registry-only snippet injection, provenance, command registration, and TUI fail-closed behavior

### T009: Update managed surfaces and run full verification

**File(s)**: `README.md`, `CHANGELOG.md`, command files, inventory/baseline fixtures, plugin-surface and exercise fixtures
**Type**: Modify
**Depends**: T008
**Acceptance**:
- [ ] Regenerates affected command Markdown from its renderer and updates user-facing docs and Unreleased changelog
- [ ] Full `scripts` Jest suite passes
- [ ] Plugin-surface, command-inventory, steering initialize/migrate, project-snippet, and required-gate fail-closed smokes pass
- [ ] During VERIFY only, runs two fresh real issue lifecycles against `Nunley-Media-Group/nmg-sdlc-smoke-20260820001416` using the required Herdr/controller PATH
- [ ] Verification evidence preserves both issue URLs, PR URLs, exact observed head SHAs, MERGED proof, and CLOSED proof; fixtures/unit tests do not substitute
- [ ] Closes only verification-created Herdr panes/tabs and preserves the main and unrelated pre-existing resources
- [ ] Production search finds no legacy product/tech/structure fallback and no direct project snippet concatenation

---

## Change History

| Issue | Date | Summary |
|-------|------|---------|
| #214 | 2026-08-23 | Initial feature spec |
