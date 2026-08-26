# Design: Publish verification reports before delivery

**Issue**: #282
**Date**: 2026-08-26
**Status**: Approved
**Author**: NMG
**Related Spec**: specs/7-verify-code-skill/

---

## Overview

Add `scripts/sdlc-finalize-verification.mjs` as the deterministic boundary between report generation and the verify handoff. Verify-code writes the report, then invokes this controller with issue, spec path, and outcome. The controller validates identity and status, publishes only the report when appropriate, proves a clean synchronized branch, and writes the complete verify handoff.

## Success Flow

1. Resolve the active issue-owned approved spec and exact report path.
2. Validate the report is a regular non-symlink file under that spec.
3. Inspect porcelain excluding `.omp/`; reject every path except the report.
4. If the report differs from HEAD, stage only it, commit `docs: record verification for #N`, and push without force.
5. If it is already identical to HEAD, create no commit.
6. Require current branch ownership, configured upstream, zero ahead/behind divergence, and a clean non-runtime tree.
7. Write a passed verify handoff with the report artifact and `next: deliver`.

## Failure Flow

Invalid arguments write nothing. Verification outcomes below success, unexpected dirty paths, unsafe report identity, or git failures produce a failed intervention handoff with a stable reason. The controller never rewrites the report or stages product paths.

## Workflow Integration

Verify-code stops writing handoff JSON itself. After generating and commenting the report, it invokes the controller and prints its marker unchanged. Execute continues to validate the controller-owned handoff through the existing contract.

## Affected Paths

- `scripts/sdlc-finalize-verification.mjs`: publication and handoff controller.
- `scripts/__tests__/sdlc-finalize-verification.test.mjs`: deterministic git fixtures.
- `workflows/verify-code/WORKFLOW.md` and `commands/sdlc-verify-code.md`: controller invocation.
- `README.md`, `CHANGELOG.md`, and relevant verification references: lifecycle contract.

## Verification Strategy

- Focused controller tests with temporary Git repositories and remotes.
- Execute handoff regression proving delivery follows a clean verify head.
- Generated-surface and plugin compatibility checks.
- Full scripts test suite and deterministic steering validation.

## Change History

| Issue | Date | Summary |
|-------|------|---------|
| #282 | 2026-08-26 | Initial approved bug-fix design |
