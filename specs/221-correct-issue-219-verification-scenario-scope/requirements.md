# Defect Report: Correct issue 219 verification scenario scope

**Issue**: #221
**Date**: 2026-08-22
**Status**: Approved
**Author**: NMG
**Related Spec**: specs/219-harden-execute-against-transient-herdr-lifecycle-races/

## Problem

The merged verification report for issue #219 records eight feature scenarios and omits SCN009 from its machine-readable regression scope even though the approved feature contains nine scenarios and the 63-test focused suite covers SCN009.

## Acceptance Criteria

### AC1: Scenario scope is accurate

The issue #219 verification report states nine feature scenarios and nine passing outcomes, lists SCN009 in the regression scope manifest, and includes SCN009 in regression and BDD evidence.

### AC2: Existing evidence is preserved

The correction retains the verified 63 focused tests, 365 full-suite tests, successful plugin-surface and hygiene gates, and the fault-injected end-to-end delivery evidence.

### AC3: Correction is validated

Relevant spec/evidence validation and repository contribution checks pass without changing runtime behavior.
