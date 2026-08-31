# Verification Report Format

**Consumed by**: `verify-code` Step 7 (generate report) and Step 8 (post GitHub issue comment).

The verification report is two artifacts produced from the same underlying data: a local report built from `checklists/report-template.md`, and a GitHub issue comment posted via `gh issue comment`. Both follow the same section structure so reviewers see the same shape in both places.

## Step 7: Local report structure

Use `checklists/report-template.md` as the scaffold and fill in:

- Executive summary with post-fix scores.
- Acceptance criteria checklist (pass / fail / partial).
- **Issue Scope** with the active issue number, spec and manifest paths, resolver status, exact delivery AC/FR/task/scenario IDs, and exact regression AC/FR/scenario IDs.
- A separate regression-obligations checklist. Regression evidence never counts as current delivery completion.
- Architecture review scores (SOLID, security, performance, testability, error handling).
- Test coverage analysis.
- Exercise test results — include when plugin changes were detected in Step 5a; cover skill exercised, method, AC evaluation, and captured output summary. Include the graceful-degradation note when exercise was skipped.
- **Steering Doc Verification Gates** — include when gates were extracted from `tech.md` in Step 1; list each gate's name, status, and evidence. Omit entirely when no `## Verification Gates` section exists.
- Fixes applied (what was found and how it was fixed, including the routing column).
- Remaining issues (items that could not be auto-fixed, with reasons).
- Recommendations.

Refer to `references/verification-gates.md` → "Gate-status aggregation" for how gate results constrain the overall Implementation Status row. When an acceptance criterion depends on GitHub-only evidence, also read `../../../references/pr-dependent-verification.md` and use its exact local-evidence, marker, and status-aggregation rules.

`PR Evidence Pending` is narrower than Partial: every local obligation and gate has passed and the exact remaining evidence is a bounded, allowlisted GitHub result. A matching draft may instead produce Pass plus satisfied evidence for its exact head. Generic non-Pass reports never carry a readiness marker.

## Step 8: GitHub issue comment template

Post the verification results as an issue comment:

```bash
gh issue comment #N --body "[verification summary]"
```

Use this Markdown structure:

```markdown
## Verification Report

### Implementation Status: [Pass / PR Evidence Pending / Partial / Incomplete / Fail]

### Issue Scope

- Active issue: #N
- Spec: `specs/{feature}`
- Manifest: `specs/{feature}/issue-scope.json` or `implicit single issue`
- Resolver status: `scoped` / `implicit_single_issue`
- Delivery: AC [...]; FR [...]; tasks [...]; scenarios [...]
- Regression: AC [...]; FR [...]; scenarios [...]

<!-- nmg-sdlc-issue-scope: {"issueNumber":N,"specPath":"specs/{feature}","status":"scoped","delivery":{"acceptanceCriteria":[...],"functionalRequirements":[...],"tasks":[...],"scenarios":[...]},"regression":{"acceptanceCriteria":[...],"functionalRequirements":[...],"scenarios":[...]}} -->

<!-- Include exactly one readiness marker only for qualified pending or satisfied evidence. Emit compact JSON on one line immediately after the issue-scope marker. -->
<!-- nmg-sdlc-pr-readiness: {"schemaVersion":1,"state":"pr_evidence_pending","issueNumber":N,"specPath":"specs/{feature}","local":{"acceptanceCriteria":[...],"functionalRequirements":[...],"tasks":[...],"scenarios":[...],"regression":{"acceptanceCriteria":[...],"functionalRequirements":[...],"scenarios":[...]},"tests":"pass","steeringGates":"pass"},"pendingEvidence":[{"kind":"required_check","name":"exact-check-name","event":"pull_request","acceptanceCriteria":["AC1"]}]} -->

### Delivery Validation

- Local verification: Pass / Not complete
- PR evidence: Not required / Pending / Satisfied for `[40-character head SHA]`

### Acceptance Criteria

- [x] AC1: [criterion] — Implemented in `path/to/file`
- [x] AC2: [criterion] — Implemented in `path/to/file`
- [ ] AC3: [criterion] — **Not implemented** / **Partial**

### Regression Obligations

- [x] ACX / FRX / SCNXXX: [prior contract] — Preserved by [evidence]
- [ ] ACY / FRY / SCNYYY: [prior contract] — **Regression found**

### Architecture Review

| Area | Score (1-5) |
|------|-------------|
| SOLID Principles | [score] |
| Security | [score] |
| Performance | [score] |
| Testability | [score] |
| Error Handling | [score] |

### Test Coverage

- BDD scenarios: [X/Y] acceptance criteria covered
- Step definitions: [Implemented / Missing]
- Test execution: [Pass / Fail / Not run]

### Steering Doc Verification Gates

*Include this section when gates were extracted from tech.md. Omit entirely if tech.md has no `## Verification Gates` section.*

| Gate | Status | Evidence |
|------|--------|----------|
| [gate name] | Pass / Fail / Incomplete | [output excerpt or blocker reason] |

**Gate Summary**: [X/Y] passed, [Z] failed, [W] incomplete

### Fixes Applied

| Severity | Category | Location | Issue | Fix | Routing |
|----------|----------|----------|-------|-----|---------|
| [sev] | [cat] | `path/to/file` | [what was wrong] | [what was done] | `skill-creator` or `direct` |

The Routing column records how the fix was applied: `skill-creator` when the fix was routed through the skill-creator file on disk (when present) per Step 6a, `direct` for standard editing fixes.

### Remaining Issues

| Severity | Category | Location | Issue | Reason Not Fixed |
|----------|----------|----------|-------|------------------|
| [sev] | [cat] | `path/to/file` | [what is wrong] | [why deferred] |

### Recommendation

[Ready for PR / Needs fixes for remaining items / Major rework needed]
```

Emit the HTML marker as one line with valid JSON and the exact normalized resolver values. Use `implicit_single_issue` when applicable. Include the same marker in the GitHub issue comment; it is machine evidence used by status and delivery preparation to reject another contributor's verification report.

When PR-dependent evidence qualifies, emit the readiness marker immediately after the issue-scope marker and copy it unchanged to the issue comment. Before PR creation, use `state: pr_evidence_pending` and `pendingEvidence`; the exact declared checks are allowed to be absent because the PR-only results do not exist yet. Every `required_check` or `check_run` identity includes GitHub's exact `event: pull_request` provenance; a push-capable or unknown event does not qualify. For an existing draft, set `state: pr_evidence_satisfied` and use `evidence` only when every declared item succeeds. Required-check and check-run items include the same event identity, exact head SHA, successful conclusion, and evidence URL; each `merge_blocking` item additionally includes its required `observedStates`. Do not emit a qualifying marker for Partial, Incomplete, Fail, local/gate failures, stale/malformed evidence, missing or failed evidence on an existing draft, or an ordinary Pass report.

For every `required_check` and `check_run`, set `name` to the canonical GitHub check identity. Trim the job and workflow names. When GitHub provides a non-empty workflow, use `<workflow> / <job>`; when workflow metadata is empty or absent, use the bare job name only when that name uniquely identifies the observed check. Never infer identity with suffix or trailing-name matching. A duplicate bare job name across workflows is unresolved until the declaration names the exact workflow-qualified identity.
