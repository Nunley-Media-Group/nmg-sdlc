# Verification Report Format

**Consumed by**: `verify-code` Step 7 (generate report) and Step 8 (post GitHub issue comment).

The verification report is two artifacts produced from the same underlying data: a local report built from `checklists/report-template.md`, and a GitHub issue comment posted via `gh issue comment`. Both follow the same section structure so reviewers see the same shape in both places.

## Step 7: Local report structure

Use `checklists/report-template.md` as the scaffold and fill in:

- Executive summary with post-fix scores.
- Acceptance criteria checklist (pass / fail / partial).
- Architecture review scores (SOLID, security, performance, testability, error handling).
- Test coverage analysis.
- Exercise test results — include when plugin changes were detected in Step 5a; cover skill exercised, method, AC evaluation, and captured output summary. Include the graceful-degradation note when exercise was skipped.
- **Steering Doc Verification Gates** — include when gates were extracted from `tech.md` in Step 1; list each gate's name, status, and evidence. Omit entirely when no `## Verification Gates` section exists.
- Fixes applied (what was found and how it was fixed, including the routing column).
- Remaining issues (items that could not be auto-fixed, with reasons).
- Recommendations.

Refer to `references/verification-gates.md` → "Gate-status aggregation" for how gate results constrain the overall Implementation Status row.

## Step 8: GitHub issue comment template

Post the verification results as an issue comment:

```bash
gh issue comment #N --body "[verification summary]"
```

Use this Markdown structure:

```markdown
## Verification Report

### Implementation Status: [Pass / Partial / Fail]

### Acceptance Criteria

- [x] AC1: [criterion] — Implemented in `path/to/file`
- [x] AC2: [criterion] — Implemented in `path/to/file`
- [ ] AC3: [criterion] — **Not implemented** / **Partial**

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

The Routing column records how the fix was applied: `skill-creator` when the fix was routed through `/skill-creator` per Step 6a, `direct` for standard Codex editing fixes.

### Remaining Issues

| Severity | Category | Location | Issue | Reason Not Fixed |
|----------|----------|----------|-------|------------------|
| [sev] | [cat] | `path/to/file` | [what is wrong] | [why deferred] |

### Recommendation

[Ready for PR / Needs fixes for remaining items / Major rework needed]
```
