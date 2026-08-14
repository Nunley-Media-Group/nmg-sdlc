# Root Cause Analysis: Scope Cumulative Feature Specs to the Active Issue

**Issue**: #162
**Date**: 2026-08-14
**Status**: Approved
**Author**: Rich Nunley

---

## Root Cause

Issue #72 introduced cumulative feature specifications by replacing singular issue frontmatter with `**Issues**` and append-only Change History entries. Those records identify contributors at the directory level, but they do not assign individual acceptance criteria, functional requirements, tasks, or Gherkin scenarios to an issue. The original design explicitly rejected a machine-readable feature manifest because frontmatter was sufficient for discovery; issue #162 demonstrates that discovery identity and active delivery scope are different contracts.

The downstream skills still consume whole documents:

- `skills/write-code/SKILL.md` Step 2 loads the cumulative files and its planning/resumption references operate on the task list without an issue-to-task filter.
- `skills/verify-code/SKILL.md` Step 3 checks every AC and every task in the active spec.
- `skills/open-pr/SKILL.md` and `skills/open-pr/references/pr-body.md` build acceptance and test sections from the cumulative requirements/tasks files.
- `scripts/sdlc-status.mjs` resolves the correct spec directory but reports only directory- and report-level state, not the active issue's element slice.
- `skills/verify-code/references/report-format.md` has no required issue-scope evidence block.

Path resolution therefore succeeds while completion scope remains ambiguous. Change History prose cannot reliably reconstruct adoption, and a consumer cannot distinguish current delivery from selected regression behavior or future work.

### Affected Code

| File | Role |
|------|------|
| `skills/write-spec/SKILL.md` and `skills/write-spec/references/amendment-mode.md` | Create and amend cumulative specs without durable element ownership. |
| `skills/write-spec/templates/feature.gherkin` | Produces scenario names without stable scenario identifiers. |
| `skills/write-code/SKILL.md` and its plan/resumption references | Plan and resume from the full cumulative task list. |
| `skills/verify-code/SKILL.md` and `references/report-format.md` | Verify and report the full cumulative AC/task set. |
| `skills/open-pr/SKILL.md` and `references/pr-body.md` | Build PR evidence from cumulative files without filtering. |
| `scripts/sdlc-status.mjs` and `skills/status/SKILL.md` | Report spec presence and lifecycle stage without exact issue scope. |

---

## Fix Strategy

### Approach

Add a strict, versioned `issue-scope.json` beside the four canonical spec documents for cumulative feature specs. A shared zero-dependency resolver validates that manifest against identifiers extracted from `requirements.md`, `tasks.md`, and stable `@SCN...` Gherkin tags. The resolver returns one normalized delivery slice and one explicit regression slice for an active issue. Prompt-defined lifecycle consumers invoke that helper before planning, verification, reporting, or PR content generation; `sdlc-status.mjs` imports the same pure resolver so status cannot drift from the manual skills.

Defect specs and single-contributor feature specs remain backwards compatible: when no manifest exists and frontmatter proves exactly one active issue, the resolver returns `implicit_single_issue` with the complete spec inventory. A multi-issue feature spec without a complete valid manifest returns `repair_required`; no consumer may fall back to the whole cumulative document.

### Manifest Schema

```json
{
  "schemaVersion": 1,
  "issues": {
    "42": {
      "owned": {
        "acceptanceCriteria": ["AC1"],
        "functionalRequirements": ["FR1"],
        "tasks": ["T001"],
        "scenarios": ["SCN001"]
      },
      "adopted": {
        "acceptanceCriteria": [],
        "functionalRequirements": [],
        "tasks": [],
        "scenarios": []
      },
      "regression": {
        "acceptanceCriteria": [],
        "functionalRequirements": [],
        "scenarios": []
      }
    }
  }
}
```

`owned` establishes the single canonical owner for every AC, FR, task, and scenario in the cumulative spec. `adopted` adds an already-owned element to the active issue's delivery slice without changing its historical owner. `regression` names prior ACs, FRs, and scenarios that verification and PR evidence must exercise but that implementation must not claim as current delivery tasks.

### Validation Rules

1. Require `schemaVersion: 1`, a plain `issues` object, positive decimal issue keys, exact category names, arrays of unique normalized IDs, and no unexpected structural values.
2. Extract contributing issue numbers from the active spec frontmatter, AC/FR/task IDs from Markdown, and scenario IDs from unique `@SCN[0-9]+` tags.
3. Require every discovered element to have exactly one owner and every owner issue to appear in the cumulative frontmatter.
4. Require every adopted or regression element to exist, to have an owner other than the adopting issue, and to be absent from conflicting active categories. Regression never contains tasks.
5. Require every frontmatter contributor to have a manifest entry; reject unknown issue entries, duplicate ownership, unmapped elements, unknown IDs, malformed files, and ambiguous active issue identity.
6. Sort every normalized ID list by prefix and numeric suffix so every consumer receives stable output.

### Resolver Interface

```text
node <plugin-root>/scripts/issue-spec-scope.mjs \
  --project <project-root> \
  --spec specs/<slug> \
  --issue <N> \
  --json
```

Stable results:

| Status | Evidence | Consumer behavior |
|--------|----------|-------------------|
| `scoped` | Complete valid manifest entry for the active issue. | Use `delivery` and `regression` exactly. |
| `implicit_single_issue` | No manifest, but one frontmatter issue equals the active issue. | Use the full inventory as delivery with no inferred regression. |
| `repair_required` | Multi-issue spec has no manifest or an incomplete ownership/adoption map. | Stop and direct explicit repair through `$nmg-sdlc:write-spec #N`. |
| `unverifiable` | Files, JSON, frontmatter, identifiers, or active issue are malformed/inconsistent. | Fail closed with exact `gaps`; do not plan, verify, report success, or deliver. |

The JSON result includes `issueNumber`, `specPath`, `manifestPath`, `contributingIssues`, `inventory`, `delivery`, `regression`, `ownership`, `reasonCode`, and `gaps`.

### Consumer Contract

| Consumer | Required behavior |
|----------|-------------------|
| `write-spec` | On feature creation, assign every new element to the first issue. On amendment, show the exact newly owned elements, explicit adoptions, and explicit regression obligations at the Tasks gate; update the manifest with the approved append-only amendment and validate it before handoff. Add stable `@SCN...` tags. |
| `write-code` | Resolve scope after active-spec discovery and before planning. Plan/execute only `delivery.tasks`; use delivery AC/FR/scenarios as context. Resumption subtracts completed tasks only from that same mapped task set. |
| `verify-code` | Verify delivery ACs/tasks/scenarios as current completion and regression ACs/FRs/scenarios as preservation evidence. Exclude every other cumulative element and write the normalized scope into the report/comment. |
| `status` | Include the normalized scope result in JSON/text. `repair_required` or `unverifiable` becomes a gap whose next action is `$nmg-sdlc:write-spec #N`, even when broad cumulative artifacts exist. |
| `open-pr` | Require a valid scope result for specs-found delivery; summarize only delivery ACs/tasks and declared regression evidence, include the manifest link, and close only the active issue. |

### Changes

| File | Change | Rationale |
|------|--------|-----------|
| `scripts/issue-spec-scope.mjs` | Add pure inventory parsing, strict manifest validation, single-issue fallback, stable result normalization, and read-only CLI. | Provides one deterministic authority for every consumer. |
| `references/issue-spec-scope.md` | Define schema, validation, statuses, repair behavior, and consumer responsibilities. | Shared contract is used by five skills and status code. |
| `skills/write-spec/templates/issue-scope.json`, `skills/write-spec/templates/feature.gherkin` | Add the manifest template and stable scenario-ID convention. | Makes new specs machine-readable at creation. |
| `skills/write-spec/SKILL.md`, `skills/write-spec/references/amendment-mode.md`, `skills/write-spec/references/review-gates.md` | Create/amend/approve exact ownership, adoption, and regression mappings. | Prevents scope ambiguity at its source. |
| `skills/write-code/SKILL.md`, `skills/write-code/references/plan-mode.md`, `skills/write-code/references/resumption.md` | Filter plans and resumption to mapped delivery tasks. | Satisfies active implementation isolation. |
| `skills/verify-code/SKILL.md`, `skills/verify-code/references/report-format.md` | Separate delivery verification from regression evidence and persist exact scope. | Prevents cross-issue completion claims. |
| `skills/open-pr/SKILL.md`, `skills/open-pr/references/pr-body.md` | Build summaries/test plans from the active slice and link the manifest. | Keeps delivery evidence issue-bound. |
| `scripts/sdlc-status.mjs`, `skills/status/SKILL.md` | Expose normalized scope and repair gaps. | Gives status the same active-slice authority. |
| `scripts/__fixtures__/cumulative-issue-scope/`, `scripts/__tests__/issue-spec-scope.test.mjs`, affected contract/status tests | Exercise earlier, active, adopted, regression, and future elements across consumers. | Proves the full isolation contract deterministically. |
| `README.md`, `CHANGELOG.md` | Document the manifest and active-scope behavior. | Keeps public usage aligned with the plugin. |

All edits under `skills/` and `references/` are routed through `$skill-creator`, matching technical steering and current official OpenAI skill guidance that reusable skill workflows use a full `SKILL.md` plus progressively loaded references and optional scripts.

### Blast Radius

- **Direct impact**: feature spec creation/amendment, implementation planning/resumption, verification/reporting, lifecycle status, spec-linked PR content, shared templates, and deterministic exercises.
- **Compatibility impact**: existing single-issue feature and defect specs continue through `implicit_single_issue`; existing cumulative specs require explicit mapping repair before another child can claim completion.
- **Unaffected**: spec directory discovery, issue/epic relationship identity, canonical umbrella publication, version classification, review cleanup, merge monitoring, and historical report contents.
- **Risk level**: Medium-high because the fix deliberately changes ambiguous cumulative specs from permissive whole-document behavior to a fail-closed repair gate.

---

## Regression Risk

| Risk | Likelihood | Mitigation |
|------|------------|------------|
| Existing single-issue projects are blocked by a new artifact requirement. | Low | Preserve the exact `implicit_single_issue` fallback and test feature plus defect shapes. |
| A manifest silently omits a future or historical element. | Low | Require complete single ownership across the extracted inventory before returning `scoped`. |
| Adoption is confused with historical ownership. | Medium | Keep `owned` and `adopted` separate; require adopted IDs to resolve to a different issue's owner. |
| Regression evidence becomes implementation work. | Low | Exclude tasks from `regression` and expose delivery/regression as separate result objects. |
| Scenario names are renamed and break mapping. | Medium | Map stable `@SCN...` tags rather than human-readable names. |
| Prompt consumers implement different filters. | Low | Require every consumer to invoke or import the same resolver and add cross-contract fixture assertions. |
| Status overstates a branch with an invalid mapping. | Low | Make repair/unverifiable scope a lifecycle gap with write-spec as the next action. |
| Legacy cumulative ownership is guessed incorrectly during repair. | Medium | Never infer ambiguous ownership; require write-spec to render and approve the exact proposed map. |

---

## Alternatives Considered

| Option | Description | Why Not Selected |
|--------|-------------|------------------|
| Infer ownership from Change History prose | Match issue summaries to nearby ACs/tasks. | Prose is not deterministic and cannot represent adoption or regression obligations safely. |
| Add issue suffixes directly to every AC/FR/task heading | Encode ownership in identifiers such as `AC162-1`. | Renumbers historical identifiers, makes adoption awkward, and spreads parsing rules across every document. |
| Put separate mapping tables in each Markdown file | Add issue-to-element tables to requirements, tasks, and Gherkin comments. | Duplicates authority and permits cross-file drift. |
| Use `issue-scope.json` with a shared resolver | Keep one strict machine contract next to human-readable specs. | **Selected**: deterministic, cross-platform, independently testable, and explicit about adoption/regression. |
| Split cumulative specs by issue | Restore one directory per delivery issue. | Violates issue scope and discards the cumulative feature model's shared context. |
| Continue whole-spec behavior with warnings | Report ambiguity but keep planning. | Still permits unrelated or future work to satisfy the active issue accidentally. |

---

## Change History

| Issue | Date | Summary |
|-------|------|---------|
| #162 | 2026-08-14 | Initial defect design |

---

## Validation Checklist

- [x] Root cause distinguishes spec discovery from element-level delivery scope
- [x] The schema represents ownership, adoption, and regression without duplicating authority
- [x] Every lifecycle consumer uses one normalized resolver result
- [x] Single-issue compatibility and multi-issue fail-closed behavior are explicit
- [x] Stable scenario identifiers and complete-inventory validation prevent silent drift
- [x] Status and reports cannot overstate ambiguous cumulative work
- [x] Skill-bundled edits are routed through `$skill-creator`
- [x] Fixture coverage includes earlier, active, adopted, regression, and future elements
