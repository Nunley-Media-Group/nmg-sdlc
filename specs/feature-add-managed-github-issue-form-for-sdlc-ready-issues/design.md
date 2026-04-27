# Design: Add Managed GitHub Issue Form for SDLC-Ready Issues

**Issues**: #135
**Date**: 2026-04-27
**Status**: Draft
**Author**: Codex

---

## Overview

This feature adds a managed GitHub Issue Form artifact to nmg-sdlc. The canonical form lives in the plugin repository at `.github/ISSUE_TEMPLATE/nmg-sdlc-ready-issue.yml`, and lifecycle skills install the same form into consumer projects so manually created GitHub issues follow the structure expected by `$nmg-sdlc:write-spec`.

The implementation should mirror the existing managed artifact shape used by the contribution gate: one shared reference owns the stable path, status wording, installation rules, and verification expectations; `$nmg-sdlc:init-config` consumes that contract during setup; `$nmg-sdlc:upgrade-project` consumes it during reconciliation; tests exercise both flows against disposable projects. The deliberate difference is overwrite behavior. The approved issue-form target path is owned by nmg-sdlc, so init and upgrade replace any existing file at that path and report the overwrite, while preserving every unrelated issue template.

GitHub Issue Forms are YAML files in `.github/ISSUE_TEMPLATE/` with required top-level `name`, `description`, and `body` keys. The form body uses supported input types such as dropdown and textarea, with required validations on the fields that make an issue spec-ready.

---

## Architecture

### Component Diagram

```text
Plugin repository
  |
  |-- .github/ISSUE_TEMPLATE/nmg-sdlc-ready-issue.yml
  |     `-- canonical GitHub Issue Form used by this repo
  |
  |-- references/issue-form.md
  |     |-- approved target path
  |     |-- canonical template location or embedded template contract
  |     |-- overwrite/idempotency/preservation rules
  |     |-- stable Issue Form status block
  |     `-- schema validation expectations
  |
  |-- skills/init-config/SKILL.md
  |     |-- writes sdlc-config.json
  |     |-- updates .gitignore
  |     |-- applies contribution-gate contract
  |     `-- applies issue-form contract
  |
  |-- skills/upgrade-project/SKILL.md
  |     |-- analyzes managed project artifacts
  |     |-- reports issue-form findings
  |     `-- applies approved or unattended issue-form reconciliation
  |
  `-- scripts/__tests__/
        |-- issue-form-contract.test.mjs
        `-- exercise-issue-form.test.mjs
```

### Data Flow

```text
1. A contributor opens GitHub's New Issue page.
2. GitHub reads .github/ISSUE_TEMPLATE/nmg-sdlc-ready-issue.yml.
3. The contributor completes required SDLC fields.
4. GitHub converts responses into a structured Markdown issue body.
5. $nmg-sdlc:write-spec reads the issue body and extracts user story/context, ACs, FRs, scope, priority, and automation suitability.

Consumer project setup:
1. init-config or upgrade-project resolves the consumer project root.
2. The caller reads references/issue-form.md.
3. The contract resolves the canonical issue form template.
4. The caller ensures .github/ISSUE_TEMPLATE/ exists.
5. If the approved target path is absent, the caller writes the form and reports created.
6. If the target path exists with identical content, the caller leaves it unchanged and reports already present.
7. If the target path exists with different content, the caller replaces it and reports overwritten.
8. The caller preserves every unrelated file under .github/ISSUE_TEMPLATE/.
```

---

## API / Interface Changes

### Managed Issue Form Contract

| Interface | Type | Purpose |
|-----------|------|---------|
| `.github/ISSUE_TEMPLATE/nmg-sdlc-ready-issue.yml` | GitHub Issue Form YAML | Canonical issue form in this repository and installed artifact for consumer projects |
| `references/issue-form.md` | Shared reference | Defines how lifecycle skills install, overwrite, reconcile, and report the managed form |
| Issue Form status block | Skill summary text | Reports form path outcome and gaps in init-config and upgrade-project output |

### Constants

| Name | Value |
|------|-------|
| Approved target path | `.github/ISSUE_TEMPLATE/nmg-sdlc-ready-issue.yml` |
| Canonical template path | `.github/ISSUE_TEMPLATE/nmg-sdlc-ready-issue.yml` in the plugin root |
| Status heading | `Issue Form:` |
| Status values | `created`, `overwritten`, `already present`, `skipped (<reason>)` |

The approved target path is the ownership boundary. Unlike `.github/workflows/nmg-sdlc-contribution-gate.yml`, an unmanaged file at this path is not a collision to preserve; it is replaced by the managed issue form and reported as `overwritten`.

### Stable Status Shape

`references/issue-form.md` should define this stable result shape:

```text
Issue Form:
- Form: created | overwritten | already present | skipped (<reason>)
- Path: .github/ISSUE_TEMPLATE/nmg-sdlc-ready-issue.yml
- Gaps: none | <comma-separated gaps>
```

`init-config`, `upgrade-project`, README examples, and tests should use the same words so logs and assertions remain stable.

### GitHub Issue Form Shape

The YAML should use GitHub-supported schema keys and body field types:

| Field | YAML Type | Required | Notes |
|-------|-----------|----------|-------|
| Issue type | `dropdown` | Yes | Feature/Enhancement, Bug, Epic, Spike |
| User story or context | `textarea` | Yes | Placeholder guides feature story, defect context, or spike research context |
| Current state / background | `textarea` | Yes | Captures why the change is needed and what exists today |
| Acceptance criteria | `textarea` | Yes | Placeholder uses numbered ACs with Given/When/Then |
| Functional requirements | `textarea` | Yes | Placeholder uses table rows with ID, requirement, priority, notes |
| Scope boundaries | `textarea` | Yes | Includes in-scope and out-of-scope bullets |
| Priority | `dropdown` | Yes | MoSCoW values |
| Automation suitability | `dropdown` | Yes | Yes/No options must be quoted in YAML |
| Additional notes | `textarea` | No | Links, constraints, risks, or known gaps |

The form should not request secrets, tokens, credentials, private keys, or internal-only data.

---

## Database / Storage Changes

No database changes.

### Consumer Project Files

| File | Change | Rule |
|------|--------|------|
| `.github/ISSUE_TEMPLATE/nmg-sdlc-ready-issue.yml` | Created or replaced from the canonical template | Always own this exact path; report overwrite when content differed |
| Other `.github/ISSUE_TEMPLATE/*` files | No change | Preserve byte-for-byte |
| `.github/workflows/*` files | No change from this feature | Contribution-gate behavior remains separate |

### Repository Files For Implementation

| File | Purpose |
|------|---------|
| `.github/ISSUE_TEMPLATE/nmg-sdlc-ready-issue.yml` | Canonical GitHub Issue Form used by this repository |
| `references/issue-form.md` | Shared managed issue-form contract |
| `skills/init-config/SKILL.md` | Calls the issue-form contract during setup |
| `skills/upgrade-project/SKILL.md` | Analyzes issue-form managed artifact and reports findings |
| `skills/upgrade-project/references/upgrade-procedures.md` | Applies approved or unattended issue-form creation/replacement |
| `README.md` | Public docs for the managed issue form |
| `CHANGELOG.md` | Unreleased entry |
| `scripts/__tests__/issue-form-contract.test.mjs` | Static contract and schema coverage |
| `scripts/__tests__/exercise-issue-form.test.mjs` | Disposable-project install/reconcile coverage |
| `scripts/skill-inventory.baseline.json` | Inventory baseline refresh for new shared reference clauses |

---

## State Management

No persistent runtime state is added. Each setup or upgrade run derives state from the filesystem.

| State | Detection | Action | Status |
|-------|-----------|--------|--------|
| Missing form | Approved target path absent | Create parent directory and write canonical form | `created` |
| Current form | Target content matches canonical form | Leave unchanged | `already present` |
| Existing different target file | Target exists and differs from canonical form | Replace with canonical form | `overwritten` |
| Parent directory cannot be created | Filesystem error | Leave unchanged and record gap | `skipped (<reason>)` |
| Canonical template missing or invalid | Plugin root template cannot be read or parsed | Leave consumer project unchanged and record gap | `skipped (<reason>)` |
| Unrelated issue templates | Any other file under `.github/ISSUE_TEMPLATE/` | Leave unchanged | Not included unless reporting preservation evidence |

---

## UI Components

No graphical UI is introduced.

### User-Facing Output

| Output | Location | Purpose |
|--------|----------|---------|
| Issue Form status | `init-config` completion summary | Shows whether the form was created, overwritten, already present, or skipped |
| Issue Form finding | `upgrade-project` Step 8 findings | Lets interactive users review the managed issue-form reconciliation with other non-destructive findings |
| Issue Form status | `upgrade-project` Step 9 summary | Reports applied/skipped outcomes in unattended and interactive modes |
| GitHub issue form | GitHub New Issue flow | Collects SDLC-ready issue fields from manual contributors |
| README/CHANGELOG copy | Public docs | Explains setup, upgrade, overwrite, and manual-label limitations |

---

## Alternatives Considered

| Option | Description | Pros | Cons | Decision |
|--------|-------------|------|------|----------|
| Markdown issue template | Add `.github/ISSUE_TEMPLATE/*.md` with headings | Simple and broadly familiar | Cannot require fields before submission | Rejected |
| Single GitHub Issue Form | One YAML form with issue type and automation fields | Matches the requested GitHub manual flow; required fields; simple setup | Cannot conditionally apply labels from dropdown choices | Selected |
| Separate forms per issue type | Feature, bug, spike, and epic forms with static labels | Could auto-apply type labels per form | Larger surface, more drift, conflicts with request for one SDLC issue form | Rejected for this issue |
| Inline install rules in each skill | Add template-copy instructions directly to init-config and upgrade-project | Fewer files | Duplicates managed-artifact behavior and status wording | Rejected |
| Shared issue-form reference | One contract consumed by lifecycle skills | One source of truth, testable, consistent with contribution-gate pattern | Adds inventory baseline work | Selected |
| Preserve unmanaged target-path file | Treat existing target path as collision | Protects user content | Violates issue's explicit overwrite requirement | Rejected |
| Overwrite only approved target path | Replace any file at `.github/ISSUE_TEMPLATE/nmg-sdlc-ready-issue.yml` and preserve all others | Satisfies overwrite requirement while bounding blast radius | Requires clear summary text | Selected |

---

## Security Considerations

- [x] **Input Handling**: The form collects public issue text only; it must not ask for credentials, tokens, private keys, or secrets.
- [x] **YAML Safety**: Tests parse the YAML as data and do not execute field content.
- [x] **Boolean-like Options**: Dropdown options such as "Yes" and "No" are quoted to avoid YAML boolean parsing surprises.
- [x] **Project Preservation**: Only the approved issue-form target path is overwritten; unrelated templates and workflows remain untouched.
- [x] **GitHub Labels**: The form does not rely on conditional labels that GitHub Issue Forms do not support.

---

## Performance Considerations

- [x] **Small File Copy**: Setup and upgrade write one small YAML file.
- [x] **Targeted Inspection**: Reconciliation reads only the canonical template, the approved target path, and optionally a narrow directory listing for preservation tests.
- [x] **Idempotency**: Current-form detection avoids unnecessary rewrites on rerun.
- [x] **No Network Dependency**: Installation uses local plugin files; no GitHub API call is required to install the form.

---

## Testing Strategy

| Layer | Type | Coverage |
|-------|------|----------|
| Canonical YAML | Static/unit | Parse YAML or inspect structure for required top-level keys, supported body types, unique ids/labels, required validations, and quoted boolean-like dropdown options |
| Shared contract | Static/unit | Assert approved path, status block, overwrite rule, preservation rule, and init/upgrade consumers |
| Init-config integration | Static/unit + fixture exercise | Assert setup creates `.github/ISSUE_TEMPLATE/`, installs the form, reports status, overwrites target-path drift, and preserves unrelated templates |
| Upgrade-project integration | Static/unit + fixture exercise | Assert upgrade analyzes missing/current/drifted forms, applies managed reconciliation, reports overwrite, and preserves unrelated templates |
| Docs | Static/unit | Assert README and CHANGELOG describe the managed form, install paths, and overwrite behavior |
| Inventory | Audit | Run `node scripts/skill-inventory-audit.mjs --check`; regenerate `scripts/skill-inventory.baseline.json` if the new shared reference changes the inventory |
| Compatibility | Audit | Run `npm --prefix scripts run compat` and `npm --prefix scripts test -- --runInBand` |

---

## Risks & Mitigations

| Risk | Likelihood | Impact | Mitigation |
|------|------------|--------|------------|
| Users expect the issue type dropdown to apply GitHub labels automatically | Medium | Medium | Document the GitHub Issue Form limitation and keep label automation out of scope; form body still captures issue type for reviewers/spec writers |
| Overwrite behavior surprises projects with an existing file at the managed path | Medium | High | Restrict overwrite to one explicit nmg-sdlc path and report `overwritten` in setup/upgrade summaries |
| GitHub rejects the YAML due to schema mistakes | Medium | High | Add static schema-oriented tests and boolean-like option checks |
| Init and upgrade implementations drift | Medium | Medium | Define one shared `references/issue-form.md` contract and test both consumers against it |
| Unrelated issue templates are accidentally changed | Low | High | Exercise tests preserve byte-for-byte unrelated templates |
| Skill-bundled file edits bypass skill-creator | Medium | High | Implementation tasks explicitly route shared references and skill files through `$skill-creator` per steering invariant |

---

## Open Questions

None.

---

## Change History

| Issue | Date | Summary |
|-------|------|---------|
| #135 | 2026-04-27 | Initial feature spec |

---

## Validation Checklist

Before moving to TASKS phase:

- [x] Architecture follows existing project patterns per `structure.md`
- [x] All API/interface changes documented
- [x] Database/storage changes planned with no database migration needed
- [x] State management approach is clear
- [x] UI components and hierarchy are not applicable
- [x] Security considerations addressed
- [x] Performance impact analyzed
- [x] Testing strategy defined
- [x] Alternatives were considered and documented
- [x] Risks identified with mitigations
