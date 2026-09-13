# Root Cause Analysis: Reject non-canonical spec File(s) before worker dispatch

**Issue**: #379
**Date**: 2026-09-13
**Status**: Approved
**Author**: NMG
**Related Spec**: specs/374-recover-bounded-automatic-delivery-stops-without-loops/
---

## Root Cause

`publicationFileEntries` in `scripts/sdlc-safe-recoveries.mjs` parses each **File(s)** value as a whole declaration. It accepts an optional `plus new ` prefix, a quoted `` `path` `` or an unquoted token matching `[^\s`(),;]+` that contains `/` or `.` or is ALL_CAPS, optional parenthetical notes, and comma/semicolon-separated lists. It does not extract paths from surrounding prose. Imperative text such as `Create \`src/a.ts\`` fails that whole-declaration match and throws `publication_scope_unproven`.

`inspectPublicationScope` runs from the worker-side bind CLI in `workflows/write-code/WORKFLOW.md` after execute has already split a pane. `scripts/sdlc-execute.mjs` treats an issue as executable from `spec-created` plus Approved frontmatter (`specStatus` / `isSpecApproved`). `scripts/spec-created-label.mjs` and `scripts/publish-approved-spec.mjs` do not parse **File(s)**. Bind catch writes only `error.reasonCode` to stderr.

`workflows/write-spec/templates/tasks.md` shows placeholders (`[varies]`, `A or B`) that are not valid grammar. `/sdlc-upgrade-project` has no publication-files detector, so existing invalid packages stay unexecutable.

### Affected Code

| File | Lines | Role |
|------|-------|------|
| `scripts/sdlc-safe-recoveries.mjs` | `publicationFileEntries`, `inspectPublicationScope`, `runCli` catch | Whole-declaration parse; bind is first failure; stderr is reasonCode only |
| `scripts/sdlc-execute.mjs` | issue loop after `spec.approved` | Starts panes without File(s) preflight |
| `scripts/publish-approved-spec.mjs` | `commitPush`, `mergeSpec` | Approves packages without File(s) parse |
| `scripts/sdlc-upgrade.mjs` | `detectUpgrade` / `applyUpgrade` | No File(s) rewrite category |
| `workflows/write-spec/templates/tasks.md` | File(s) examples | Invalid placeholders copied into specs |

### Triggering Conditions

- Delivery-task **File(s)** value is prose-prefixed or otherwise not a whole declaration
- Issue is labeled spec-created and four files are Approved
- `/sdlc-execute` splits an implement pane before bind
- Upgrade is not run, or has no rewrite detector

---

## Fix Strategy

### Approach

Keep one parser. Export it. Fail closed on prose in live bind/preflight/publish. Add location fields. Run syntax validation at commit-push/merge (no git expansion). Run full `inspectPublicationScope` (including empty glob/dir) in execute before any `paneSplit`. Teach write-spec to emit only canonical lines and make template examples valid. Add an upgrade detector that rewrites only when every backtick-quoted span is already a valid path; never teach the live parser to mine prose.

### Changes

| File | Change | Rationale |
|------|--------|-----------|
| `scripts/sdlc-safe-recoveries.mjs` | Export parse + syntax constant; locate errors; empty glob/dir unproven; richer bind stderr | Shared grammar and diagnostics |
| `scripts/sdlc-execute.mjs` | Preflight inspectPublicationScope before paneSplit | AC1 timing |
| `scripts/publish-approved-spec.mjs` | parseDeliveryTaskFileLines before add/PR | Block spec-created of invalid File(s) |
| `scripts/sdlc-upgrade.mjs` | detect/apply `publication-files` | AC6 existing packages |
| `workflows/write-spec/WORKFLOW.md` | Canonical File(s) contract | AC4 |
| `workflows/write-spec/templates/tasks.md` | Valid example values | AC4 |
| `workflows/upgrade-project/WORKFLOW.md` | Detector 12 | AC6 |

### Blast Radius

- **Direct impact**: recoveries parser, execute preflight, publish helper, upgrade detect/apply, write-spec templates/workflow, upgrade-project workflow
- **Indirect impact**: write-code/verify bind still call inspectPublicationScope; valid specs unchanged; invalid existing specs become executable only after approved upgrade rewrite
- **Risk level**: Medium — preflight and empty-glob tightening can fail previously “passed bind with spec-only paths” cases that declared empty globs; that is required fail-closed behavior

---

## Regression Risk

| Risk | Likelihood | Mitigation |
|------|------------|------------|
| Valid quoted/list/glob/annotation cases break | Low | Keep existing inspectPublicationScope fixture; add explicit valid rows |
| Empty glob now unproven while spec files exist | Med | Required by issue; test it; write-spec still allows undeclared-yet literals via parse-only publish |
| Upgrade extracts unsafe paths | Low | Mixed invalid quoted spans → finding, no rewrite; live parser unchanged |
| Circular imports | Low | recoveries must not import execute or publish-approved-spec |

---

## Alternatives Considered

| Option | Description | Why Not Selected |
|--------|-------------|------------------|
| Mine paths from prose in publicationFileEntries | Make `Create \`src/a.ts\`` bind | Violates fail-closed authorization |
| Rewrite consumer specs in this delivery | Fix #81 in nmg-sdlc implement | Out of scope for implement; upgrade is the approved rewriter |
| Validate only at bind | Keep execute dispatch | Does not meet AC1 pane timing |

---

## Validation Checklist

Before moving to TASKS phase:

- [x] Root cause is identified with specific code references
- [x] Fix is minimal — no unrelated refactoring
- [x] Blast radius is assessed
- [x] Regression risks are documented with mitigations
- [x] Fix follows existing project patterns (per `structure.md`)
