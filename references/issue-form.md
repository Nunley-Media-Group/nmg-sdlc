# Managed Issue Form Contract

**Consumed by**: `init-config` during runner setup, and `upgrade-project` when analyzing or applying managed project artifacts.

Use this reference to install or reconcile the nmg-sdlc-managed GitHub Issue Form in consumer projects. The form is project content, not plugin metadata: it must be additive, stack-agnostic, schema-valid for GitHub Issue Forms, and destructive only at the approved nmg-sdlc-owned target path.

## Constants

| Name | Value |
|------|-------|
| Approved issue-form path | `.github/ISSUE_TEMPLATE/nmg-sdlc-ready-issue.yml` |
| Canonical template source | `.github/ISSUE_TEMPLATE/nmg-sdlc-ready-issue.yml` resolved from the plugin root |
| Status heading | `Issue Form:` |

The approved issue-form path is nmg-sdlc-owned. A file at this exact path with different content must be replaced by the canonical template and reported as `overwritten`. This overwrite rule does not apply to any other issue template.

## Process

Classify the approved issue-form path before writing:

| State | Detection | Action | Status |
|-------|-----------|--------|--------|
| Missing form | Approved path absent | Create `.github/ISSUE_TEMPLATE/` and write the canonical template | `created` |
| Current form | Target content matches the canonical template | Leave unchanged | `already present` |
| Differing target-path file | Target exists and differs from the canonical template | Replace the target file with the canonical template | `overwritten` |
| Canonical template unavailable | Plugin root template cannot be read | Leave consumer project unchanged and record a gap | `skipped (canonical template unavailable)` |
| Target write failure | Parent directory or target cannot be written | Leave the project as-is where possible and record a gap | `skipped (write failed)` |

Preserve every unrelated file under `.github/ISSUE_TEMPLATE/` byte-for-byte. Do not move, delete, rename, sort, or reformat project-authored issue templates.

## Schema Expectations

The canonical template must satisfy these GitHub Issue Form constraints:

- Top-level `name`, `description`, and `body` keys are present and non-empty.
- `body` contains one or more supported input types: `markdown`, `textarea`, `input`, `dropdown`, or `checkboxes`.
- Non-markdown body fields use unique `id` values containing only letters, numbers, hyphens, or underscores.
- Body field labels are unique.
- Dropdown options are unique and non-empty.
- Required draft-issue fields set `validations.required: true`.
- Dropdown options that YAML could parse as booleans, such as `Yes` or `No`, are quoted.
- The form collects public issue-planning data only and does not request credentials, private keys, or internal access details.

## Required Draft-Issue Fields

The form must capture these sections in the resulting GitHub issue body:

| Field | Required |
|-------|----------|
| Issue Type | Yes |
| User Story or Bug/Spike Context | Yes |
| Current State / Background | Yes |
| Acceptance Criteria | Yes |
| Functional Requirements | Yes |
| Scope Boundaries | Yes |
| Priority | Yes |
| Automation Suitability | Yes |
| Additional Notes | No |

Acceptance criteria guidance must use Given/When/Then examples so `$nmg-sdlc:write-spec` can translate each criterion into a Gherkin scenario.

## Mode Behavior

Interactive mode:

- `init-config` applies the form during setup without a separate prompt because the form is a managed setup artifact.
- `upgrade-project` presents missing or differing issue-form findings in its normal non-destructive managed-artifact batch.
- Differing files at the approved issue-form path are replaced after approval and reported as `overwritten`.

Unattended mode:

- Do not call `request_user_input`.
- Auto-apply missing form creation and differing target-path replacement.
- Record every created, overwritten, already-present, or skipped outcome in the final summary.

## Output

Return this stable result shape to the calling skill:

```text
Issue Form:
- Form: created | overwritten | already present | skipped (<reason>)
- Path: .github/ISSUE_TEMPLATE/nmg-sdlc-ready-issue.yml
- Gaps: none | <comma-separated gaps>
```

Use these exact status words so summaries and tests can compare results consistently.

## Safety Rules

- Overwrite only `.github/ISSUE_TEMPLATE/nmg-sdlc-ready-issue.yml`.
- Never modify unrelated issue templates under `.github/ISSUE_TEMPLATE/`.
- Never modify unrelated workflows under `.github/workflows/`.
- Never create labels, milestones, project-board rules, repository settings, branch protection, or repository secrets from the issue-form contract.
- Never claim that a GitHub Issue Form dropdown can conditionally apply labels.
