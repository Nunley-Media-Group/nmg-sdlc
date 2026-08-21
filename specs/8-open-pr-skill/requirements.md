# Requirements: Open and Merge Pull Request

**Issue**: #8
**Date**: 2026-08-20
**Status**: Approved
**Author**: NMG

---

## Current Contract

Deliver one verified issue through exact-head pull-request merge and issue closure. This package is the current 3.0.0 capability contract; superseded implementation history remains available in Git.

## Acceptance Criteria

### AC1: Current behavior

Given a verified exact head, when delivery begins, then version metadata and changelog remain synchronized before the PR is opened.

### AC2: Current behavior

Given CI or eligible bot review findings, when the PR is open, then bounded remediation runs against the same head.

### AC3: Current behavior

Given human review or ambiguous findings, when encountered, then delivery fails with intervention instead of resolving them automatically.

### AC4: Current behavior

Given the exact head merges, when finalizing, then success requires the PR merged and the executable issue closed before branch deletion.

## Normative Sources

- Surface: `/sdlc-open-pr #N`
- Implementation: `skills/open-pr/; skills/address-pr-comments/`
- Verification: `scripts/__tests__/open-pr-delivery-contract.test.mjs; scripts/__tests__/sdlc-commands.test.mjs`
