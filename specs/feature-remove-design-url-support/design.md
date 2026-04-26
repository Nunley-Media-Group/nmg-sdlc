# Design: Remove Legacy Design URL Support

**Issues**: #105
**Date**: 2026-04-25
**Status**: Approved
**Author**: Rich Nunley

---

## Overview

This change removes the legacy Design URL ingestion path from the live nmg-sdlc plugin contract. The implementation is primarily a prompt-contract and documentation cleanup: remove design URL input collection, remove design archive fetch/decode references, remove design context from session schemas and downstream workflow steps, and update README command surfaces.

The selected approach is a targeted live-surface removal. Historical specs and release history are not bulk-normalized because they describe prior behavior and are useful context for the project. The implementation instead defines a live-surface search boundary and requires remaining references to be either removed or justified as archival-only.

---

## Architecture

### Component Diagram

```text
nmg-sdlc Plugin
|
|-- README.md
|   `-- command docs no longer advertise design-url inputs
|
|-- skills/draft-issue/
|   |-- SKILL.md removes Design URL gather/fetch/decode steps
|   |-- references/design-url.md removed from live bundle
|   |-- references/feature-template.md removes design citations
|   |-- references/interview-depth.md removes design context cues
|   `-- references/multi-issue.md removes design state/summary
|
|-- skills/onboard-project/
|   |-- SKILL.md removes optional Design URL capability
|   |-- references/greenfield.md starts at interview/steering
|   `-- references/interview.md removes design-context defaults
|
`-- scripts/skill-inventory.baseline.json
    `-- regenerated after skill reference changes
```

### Data Flow

#### Draft Issue

```
Before:
initial argument -> detect optional Design URL -> fetch/decode -> session.designContext
  -> investigation/interview/synthesis/multi-issue summary

After:
initial argument -> product steering -> multi-issue detection
  -> classification -> investigation -> interview -> synthesis -> issue creation
```

#### Onboard Project

```
Before:
greenfield mode -> optional --design-url / prompt -> fetch/decode -> design_context
  -> interview defaults -> starter issue synthesis -> summary

After:
greenfield mode -> intent + tech-selection interview
  -> steering bootstrap/enhancement -> version/milestones -> starter issue synthesis -> summary
```

The removal simplifies state flow: there is no design URL input, no network archive fetch, no gzip decode, no design-context default source, and no design-fetch gap reporting.

---

## API / Interface Changes

### Removed Command Inputs

| Surface | Previous Input | New Behavior |
|---------|----------------|--------------|
| `$nmg-sdlc:draft-issue [description] [design-url]` | Optional design URL positional argument | Command accepts only the issue description / need context. |
| `$nmg-sdlc:onboard-project [--dry-run] [--design-url <url>]` | Optional `--design-url <url>` flag | Command no longer accepts or documents `--design-url`. |

### Removed Session Fields

| Field | Previous Owner | Removal |
|-------|----------------|---------|
| `session.designUrl` | draft-issue Step 1 | Remove from Step 1 output and multi-issue session schema. |
| `session.designContext` | draft-issue Step 1a | Remove from investigation, interview, synthesis, and multi-issue summary. |
| `session.designFailureNote` | draft-issue Step 1a / Step 11 | Remove from failure summary logic. |
| `design_context` | onboard-project greenfield branch | Remove from interview defaults and starter issue candidate synthesis. |

### Removed Reference Branch

| File | Action | Reason |
|------|--------|--------|
| `skills/draft-issue/references/design-url.md` | Delete | No live skill step should load or expose the removed fetch/decode branch. |

---

## Database / Storage Changes

None. This plugin feature does not persist application data. The only storage-adjacent artifact is `scripts/skill-inventory.baseline.json`, which must be regenerated or updated because the live skill reference graph changes when the design-url branch is removed.

---

## State Management

No runtime state migration is required. The affected state is prompt-level session state inside Codex skill instructions, not a serialized file format. The removal rules are:

1. Delete design URL / design context fields from described session schemas.
2. Remove any step that mutates those fields.
3. Remove downstream consumers that branch on those fields.
4. Do not replace removed fields with no-op placeholders.

---

## UI Components

N/A. This is a CLI/plugin workflow change.

---

## Components Modified

| File | Change |
|------|--------|
| `README.md` | Remove Design URL prose, command signatures, and onboarding mentions from public docs. |
| `skills/draft-issue/SKILL.md` | Remove optional Design URL input from Step 1, remove Step 1a fetch/decode, remove design context from Step 4 / Step 6 / Step 11. |
| `skills/draft-issue/references/design-url.md` | Delete the live reference file. |
| `skills/draft-issue/references/feature-template.md` | Remove instructions to cite design URLs in generated issue bodies. |
| `skills/draft-issue/references/interview-depth.md` | Remove design context from interview inputs and skip logic. |
| `skills/draft-issue/references/multi-issue.md` | Remove design context fields, per-iteration sharing, and design failure summary text. |
| `skills/onboard-project/SKILL.md` | Remove optional Design URL capability from description, summaries, errors, and integration diagram prose. |
| `skills/onboard-project/references/greenfield.md` | Remove Step 2G.1 and renumber or rewrite greenfield steps so onboarding starts from the interview. |
| `skills/onboard-project/references/interview.md` | Remove `design_context` from unattended default sourcing and logging labels. |
| `scripts/skill-inventory.baseline.json` | Regenerate after live skill edits so the audit baseline no longer expects design-url pointers. |
| `CHANGELOG.md` | Add an `[Unreleased]` entry describing the removal; do not rewrite historical release notes. |

---

## Alternatives Considered

| Option | Description | Pros | Cons | Decision |
|--------|-------------|------|------|----------|
| **A: Leave Design URL support but mark deprecated** | Keep prompts and fetch/decode path with deprecation wording. | Lowest immediate edit volume. | Still advertises and preserves a legacy-provider-era runtime path; contradicts issue #105. | Rejected. |
| **B: Replace with a Codex-native design context feature** | Design a new supported source format and ingestion model. | Could preserve a design-context capability. | Explicitly out of scope; needs separate security and format decisions. | Rejected. |
| **C: Targeted live-surface removal** | Remove current workflow support and docs while preserving archival specs/history. | Matches issue scope; avoids erasing project history; smallest safe change. | Requires precise stale-reference filtering. | **Selected**. |
| **D: Bulk rewrite every repository reference** | Remove every occurrence from specs, changelog, and history-like docs. | Grep output becomes simpler. | Violates AC4 and destroys useful historical context. | Rejected. |

---

## Security Considerations

- [x] **External Fetch Surface**: The live design archive network fetch path is removed instead of replaced.
- [x] **Input Validation**: Removing the input eliminates Design URL validation and decode branches from active workflows.
- [x] **Data Sanitization**: No design archive payload content is fetched, parsed, cached, cited, or summarized after the change.
- [x] **Secrets**: No new secrets or credentials are introduced.
- [x] **Skill Authoring Contract**: Skill-bundled edits route through `$skill-creator`.

---

## Performance Considerations

- [x] **Runtime Cost**: Draft-issue and onboard-project skip a network fetch/decode branch, reducing potential latency.
- [x] **No New Dependencies**: No scripts or packages are added.
- [x] **Validation Cost**: Stale-reference checks are plain repository searches over bounded live surfaces.

---

## Testing Strategy

| Layer | Type | Coverage |
|-------|------|----------|
| Skill contracts | Prompt quality review | Draft-issue and onboard-project flows remain coherent after step removal. |
| Inventory | Static audit | `node scripts/skill-inventory-audit.mjs --check` passes after baseline update. |
| Compatibility | Static audit | `npm --prefix scripts run compat` passes. |
| Stale references | Targeted search | Live surfaces no longer contain unsupported Design URL / design archive contract text. |
| BDD | Gherkin | All ACs in `requirements.md` are represented in `feature.gherkin`. |

### Targeted Stale-Reference Boundary

The stale-reference check should include live surfaces:

```text
README.md
skills/draft-issue/
skills/onboard-project/
scripts/skill-inventory.baseline.json
```

The check should exclude archival or history surfaces unless a specific live contract section is being edited:

```text
specs/
CHANGELOG.md historical version entries
```

`CHANGELOG.md` should receive a new `[Unreleased]` entry for this work, but older entries remain historical.

---

## Risks & Mitigations

| Risk | Likelihood | Impact | Mitigation |
|------|------------|--------|------------|
| Removing Step 1a leaves stale references to later step numbers or missing state fields. | Medium | Medium | Review the whole draft-issue flow after edits and run stale-reference searches for `designUrl`, `designContext`, and `designFailureNote`. |
| Onboard greenfield step numbering becomes inconsistent after removing Step 2G.1. | Medium | Medium | Rewrite the greenfield section as a coherent ordered flow instead of only deleting lines. |
| Inventory baseline fails after deleting `references/design-url.md`. | High | Low | Regenerate or update `scripts/skill-inventory.baseline.json` and run the audit. |
| Historical references are accidentally rewritten. | Medium | Low | Keep implementation tasks scoped to live files and explicitly exclude archival specs. |
| Direct edits bypass `$skill-creator`. | Medium | High | Tasks require `$skill-creator` for every skill-bundled edit and treat missing skill-creator as a blocker. |

---

## Open Questions

None.

---

## Change History

| Issue | Date | Summary |
|-------|------|---------|
| #105 | 2026-04-25 | Initial feature spec |
