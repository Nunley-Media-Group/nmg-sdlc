# Umbrella Mode

**Consumed by**: `write-spec` Phase 0 HRG (spike umbrella+children scope shape) and Phase 3 Seal-Spec Flow (multi-PR triggered).

**Read this when** `/write-spec` needs to produce an umbrella+children structure — either because the Phase 0 Human Review Gate chose "Umbrella+Children" for a spike issue, or because the Phase 3 Seal-Spec Flow detected a `## Multi-PR Rollout` heading in `design.md`. The authoritative machinery for each piece lives where noted in § Authoritative Sources.

---

## Trigger Conditions

The umbrella+children shape is triggered when ANY of the following is true:

| Trigger | Source |
|---------|--------|
| `design.md` contains a `## Multi-PR Rollout` heading | Phase 3 Seal-Spec Flow |
| Any FR row's Requirement cell contains `multiple PRs` or `multi-PR` (case-insensitive) | Phase 3 Seal-Spec Flow |
| Phase 0 HRG (interactive) selects "Umbrella+Children" | Spike Phase 0 |
| Phase 0 HRG (unattended) applies deterministic default with `component-count >= 2` | Spike Phase 0 via `references/spike-variant.md` |

---

## Umbrella Issue

The umbrella issue is a coordination artifact, not a deliverable. It carries the ADR summary (for spikes) or the multi-phase design rationale (for features), a child checklist, and a milestone.

**Umbrella issue body template:**

```markdown
## Summary

{1-2 sentence description of the overall deliverable or research outcome}

## Design Rationale

{Brief explanation of why this work is split across multiple PRs / child issues.
For spikes: reference the ADR file path (docs/decisions/YYYY-MM-DD-<slug>-gap-analysis.md).
For features: reference the Multi-PR Rollout section in design.md.}

## Child Issues

- [ ] #{child-1} — {one-line description}
- [ ] #{child-2} — {one-line description}
- [ ] #{child-N} — {one-line description}

## Out of Scope

{What this umbrella does NOT cover — prevents scope creep in child issues}
```

**Umbrella issue labels**: `epic` + `enhancement` (BOTH; create the `epic` label lazily with color `5319E7` if absent).

**Umbrella issue creation**:

```bash
gh issue create \
  --title "Umbrella: {overall feature/research name}" \
  --body "..." \
  --label "epic,enhancement" \
  --milestone "v{N}"
```

Capture the umbrella issue number `U` for use in child issue creation below.

---

## Child Issues

Each child issue carries one independently-deployable unit of work from the Delivery Phases table (feature path) or the Decomposition section of the spike-researcher output (spike path).

**Child issue body template:**

```markdown
## Summary

{1-2 sentence description of this specific child's scope}

## Context

Part of umbrella #{U}: {umbrella title}.
See {docs/decisions/YYYY-MM-DD-<slug>-gap-analysis.md OR specs/{feature-name}/design.md} for full context.

## Acceptance Criteria

### AC1: {Name}

**Given** {precondition}
**When** {action}
**Then** {outcome}

## Functional Requirements

| ID | Requirement | Priority |
|----|-------------|----------|
| FR1 | {requirement} | Must |

## Out of Scope

{What this child does NOT cover}

Depends on: #{U}
```

**Required body line** (machine-read by `open-pr` epic-child downgrade rule):

```
Depends on: #{U}
```

This line triggers the sibling-aware downgrade logic in `skills/open-pr/references/version-bump.md` § 4a. It must be present verbatim (the regex is `/Depends on:\s*#(\d+)\b/gi`).

**Child issue labels**: `epic-child-of-{U}` (lazily create if absent) PLUS one of `enhancement` or `bug` based on the child's type.

**Child issue creation** (one call per child):

```bash
gh issue create \
  --title "{verb} {child scope}" \
  --body "..." \
  --label "enhancement,epic-child-of-{U}" \
  --milestone "v{N}"
```

After creating each child, link it to the umbrella via:

```bash
gh issue edit #{U} --add-sub-issue #{child-N}
```

(Run the `gh` capability probe first — `gh issue edit --help | grep add-sub-issue`; if absent, fall back to appending the `- [ ] #{child-N}` line to the umbrella body via `gh issue edit #{U} --body "..."` with the updated checklist.)

---

## Creation Sequence

1. Create the umbrella issue (no child numbers yet — use placeholder checklist rows if needed).
2. Create each child issue in dependency order (leaves first). Capture each `#{child-N}`.
3. Update the umbrella's child checklist with the real issue numbers (edit the body).
4. Run the autolink loop: for each child, `gh issue edit #{U} --add-sub-issue #{child-N}` (probe first).
5. Record `epicParentNumber = U` in the session state for `/open-pr` step 2 epic-child downgrade.

---

## Authoritative Sources

This reference gives `/write-spec` a single production recipe. The *machinery* for each behaviour lives in:

| Behavior | Authoritative Source |
|-----------|---------------------|
| Phase 3 Seal-Spec Flow (multi-PR trigger, seal commit, child-issue prompt) | `skills/write-spec/SKILL.md` § 3b |
| Epic Coordination template and multi-issue batch mode | `skills/draft-issue/references/multi-issue.md` |
| Epic-child sibling-aware version downgrade | `skills/open-pr/references/version-bump.md` § 4a |
| Spike Phase 0 HRG menu and deterministic default | `skills/write-spec/references/spike-variant.md` |
