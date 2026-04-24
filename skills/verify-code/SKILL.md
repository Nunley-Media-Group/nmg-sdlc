---
name: verify-code
description: "Verify implementation against spec, fix findings, review architecture and test coverage, update GitHub issue. Use when user says 'verify specs', 'check implementation', 'review the code against spec', 'validate the code', 'check if done', 'run verification for #N', 'how do I verify the implementation', 'how to check if the feature is done', or 'is this ready to merge'. Do NOT use for writing specs, implementing code, or creating PRs. Includes SOLID/security/performance review, exercise testing for plugin changes, and auto-fix of findings. Fifth step in the SDLC pipeline — follows $nmg-sdlc:write-code and precedes $nmg-sdlc:commit-push."
---

# Verify Code

Read `../../references/codex-tooling.md` when the workflow starts — it maps legacy tool wording to Codex-native file inspection, shell, editing, web, interactive-gate, and subagent behavior.

Read `../../references/interactive-gates.md` when the workflow reaches any manual-mode user decision, menu, review gate, or clarification prompt — Codex renders these as conversational numbered prompts and waits for the next user reply.

Verify the implementation against specifications, fix any findings, review architecture and test coverage, then update the GitHub issue with evidence.

Read `../../references/legacy-layout-gate.md` when the workflow starts — the gate aborts before Step 1 if legacy `.codex/steering/` or `.codex/specs/` trees are still present. Verification against a mixed layout produces misleading results.

Read `../../references/unattended-mode.md` when the workflow starts — the sentinel pre-approves every Codex interactive gate call site in this skill so the runner proceeds through all steps without blocking.

Read `../../references/feature-naming.md` when resolving the spec directory for an issue and no explicit `{feature-name}` is in hand — the reference covers the `feature-{slug}` / `bug-{slug}` convention and the `**Issues**` frontmatter fallback chain for legacy `{issue#}-{slug}/` directories.

Read `../../references/steering-schema.md` when you need to know which steering doc to read for which step — steering docs are required inputs to this skill, not optional references.

Read `../../references/spec-frontmatter.md` when a frontmatter field drives behaviour (e.g., singular `**Issue**` + `**Related Spec**` signals the defect path).

## Prerequisites

1. Specs exist at `specs/{feature-name}/`.
2. Implementation is complete (or believed to be complete).
3. A GitHub issue exists for tracking.

---

## Workflow

### Step 1: Load Specifications and Steering Docs

Read all spec documents:

```
specs/{feature-name}/
├── requirements.md    — Acceptance criteria to verify
├── design.md          — Architecture decisions to validate
├── tasks.md           — Task completion to confirm
└── feature.gherkin    — BDD scenarios to check
```

Read all steering documents — these define project conventions used throughout verification and are required inputs, not optional references:

```
steering/
├── tech.md        — Technology stack, coding standards, testing strategy, behavioral contracts
├── structure.md   — Code organization, naming conventions, architectural invariants
└── product.md     — Product principles, intent verification postconditions
```

Steering docs define the verification framework (behavioral contracts, checklist applicability, script verification contracts) and must be loaded before any evaluation begins. They must also be provided to any subagents dispatched during the review.

Read `references/verification-gates.md` when `tech.md` is being parsed — the reference covers how to extract the `## Verification Gates` table (if present) so the extracted gates can be executed in Step 5f. Absence of the section is backward-compatible — no gates are enforced.

### Step 1.5: Spike Abort

Check the issue's labels:

```bash
gh issue view #N --json labels --jq '.labels[].name'
```

If any label is `spike`, print exactly:

```
Spikes don't produce code — run $nmg-sdlc:open-pr to merge the research spec
```

Exit 0 — this is a correctness guard, not a failure. Do NOT post a verification report to the issue, do NOT call the architecture-reviewer subagent, do NOT run exercise testing. The abort fires in both modes.

### Step 2: Load Issue

Read the GitHub issue for the original acceptance criteria:

```bash
gh issue view #N
```

Read `references/defect-path.md` when the spec under verification uses the defect variant (heading `# Defect Report:` or singular `**Issue**` frontmatter) — the reference narrows verification to reproduction check, regression-scenario validation, blast-radius architecture review, and a minimal-change diff check.

### Step 3: Verify Implementation

Check each acceptance criterion against actual code:

1. **For each AC in requirements.md**: find the implementing code via file discovery / text search, verify the behaviour matches the criterion, mark as Pass / Fail / Partial.
2. **For each task in tasks.md**: verify the file exists and contains the expected code, check the task's acceptance criteria, mark as Complete / Incomplete / Skipped.

### Step 4: Architecture Review

Run the architecture review inline by default. If the user or runner explicitly authorizes subagents, spawn a Codex `explorer` subagent with a bounded prompt to evaluate the implementation against all five checklists and return structured scores and findings.

When using a subagent, assume it has no useful conversation context — it only sees the prompt you give it. Include the steering doc content in the subagent prompt:

- `tech.md` — checklist applicability table (scripts vs. skills), script verification contracts (preconditions / postconditions / invariants / boundaries), coding standards, cross-platform constraints.
- `structure.md` — architectural invariants (hard contracts that must never be violated), cross-platform contracts.

| Area | Checklist | Priority |
|------|-----------|----------|
| SOLID Principles | Read `checklists/solid-principles.md` when evaluating SOLID compliance | 1 |
| Security | Read `checklists/security.md` when evaluating security posture | 2 |
| Performance | Read `checklists/performance.md` when evaluating performance | 3 |
| Testability | Read `checklists/testability.md` when evaluating testability | 4 |
| Error Handling | Read `checklists/error-handling.md` when evaluating error handling | 5 |

For each area: load the checklist, evaluate the implementation against each item, score 1–5 (5 = excellent), note any issues found.

### Step 5: Verify Test Coverage

#### 5a: Detect Plugin Changes

Run `git diff main...HEAD --name-only` and check if any changed files match these patterns:

- `plugins/*/skills/*/SKILL.md`
- `plugins/*/agents/*.md`
- `skills/*/SKILL.md` or `agents/*.md` at the repo root (for standalone-plugin repos)

Template-only changes (files in `templates/` without an accompanying SKILL.md change) do not trigger exercise testing.

- **If plugin changes are detected** → proceed to 5b–5e (exercise-based verification).
- **If no plugin changes are detected** → run the Standard BDD Verification below, then skip to Step 6.

#### Standard BDD Verification (non-plugin projects)

Check that BDD tests exist and cover the acceptance criteria:

1. Feature files — do `.feature` files exist at the location specified in `tech.md`?
2. Scenario coverage — does each AC from requirements.md have a corresponding Gherkin scenario?
3. Step definitions — are step definitions implemented for all scenarios?
4. Test execution — reference `tech.md` for the command to run tests.

Report coverage gaps.

#### 5b–5e: Exercise Testing

Read `references/exercise-testing.md` when Step 5a detected plugin changes — the reference covers scaffolding a disposable test project (5b), exercising the changed skill via `codex exec` with dry-run mode for GitHub-integrated skills (5c), evaluating exercise output against acceptance criteria (5d), and cleanup (5e).

Exercise findings are treated as findings for Step 6, just like any other verification finding. If the `codex` CLI is unavailable, skip exercise testing and record the reason for the report (graceful degradation).

#### 5f: Execute Verification Gates

Read `references/verification-gates.md` when gates were extracted in Step 1 — the reference covers per-gate Condition evaluation, Action execution, Pass-Criteria grading, and result recording. If no `## Verification Gates` section was present in `tech.md`, skip this sub-step entirely.

### Step 6: Fix Findings

Read `references/autofix-loop.md` when Steps 3–5 have produced findings — the reference covers the severity-ordered fix loop, the SKILL-BUNDLED FILE DETECTOR and `$skill-creator` probe contract that routes skill-bundled fixes away from direct Codex editing, the `$simplify` probe for post-fix simplification (6a-bis), re-running tests (6b), re-verifying changed areas (6c), handling unfixable findings (6d), and the Fix Rules table.

### Step 7: Generate Verification Report

Read `references/report-format.md` when authoring the report — the reference covers the Step 7 local report structure (built from `checklists/report-template.md`) and the Step 8 GitHub issue-comment Markdown template. The report sections include executive summary, acceptance-criteria checklist, architecture-review scores, test coverage, exercise test results (when Step 5a fired), Steering Doc Verification Gates (when extracted from `tech.md`), Fixes Applied (with Routing column), Remaining Issues, and Recommendations.

### Step 8: Update GitHub Issue

Post the verification results as an issue comment following the Markdown template in `references/report-format.md`:

```bash
gh issue comment #N --body "[verification summary]"
```

### Step 9: Output

```
Verification complete for issue #N.

Status: [Pass / Partial / Fail / Incomplete]
Acceptance criteria: [X/Y] passing
Architecture score: [average]
Test coverage: [X/Y] criteria covered
Verification gates: [X/Y] passed, [Z] failed, [W] incomplete (omit line if no gates defined)
Fixes applied: [count]
Remaining issues: [count]

GitHub issue #N updated with verification report.

[If `.codex/unattended-mode` does NOT exist AND passing]: Next step: Run `$nmg-sdlc:open-pr #N` to create a pull request.
[If `.codex/unattended-mode` does NOT exist AND remaining issues]: Deferred items documented — review before creating a PR.
[If `.codex/unattended-mode` does NOT exist AND failing]: Critical issues remain — address the items above before creating a PR.
[If `.codex/unattended-mode` exists]: Done. Awaiting orchestrator.
```

---

## Checklist Files

| Checklist | Purpose |
|-----------|---------|
| `checklists/solid-principles.md` | SOLID principles compliance |
| `checklists/security.md` | Security review (OWASP-aligned) |
| `checklists/performance.md` | Performance patterns |
| `checklists/testability.md` | Dependency injection and mock patterns |
| `checklists/error-handling.md` | Error hierarchy and propagation |
| `checklists/report-template.md` | Verification report template |

---

## Integration with SDLC Workflow

```
$nmg-sdlc:draft-issue  →  $nmg-sdlc:start-issue #N  →  $nmg-sdlc:write-spec #N  →  $nmg-sdlc:write-code #N  →  $simplify  →  $nmg-sdlc:verify-code #N  →  $nmg-sdlc:commit-push  →  $nmg-sdlc:open-pr #N  →  $nmg-sdlc:address-pr-comments #N
                                                                                                               ▲ You are here
```

`$simplify` is an optional external marketplace skill. When installed, it runs once between `$nmg-sdlc:write-code` and `$nmg-sdlc:verify-code`, and again inside the auto-fix loop's 6a-bis after each batch of fixes. When not installed, the step logs a warning and proceeds.
