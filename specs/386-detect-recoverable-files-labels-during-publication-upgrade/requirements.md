# Defect Report: Detect recoverable Files labels during publication upgrade

**Issue**: #386
**Date**: 2026-09-13
**Status**: Approved
**Author**: NMG
**Related Spec**: specs/383-reject-missing-near-miss-or-duplicate-delivery-file-declarations/

---

## Reproduction

1. Create an Approved issue spec with admitted tasks T001–T004.
2. Give each task exactly one valid publication declaration labeled `**Files**:` instead of canonical `**File(s)**:`.
3. Run `detectUpgrade()` with issue-dependency collection disabled to isolate publication detection.
4. Observe that no `publication-files:<digest>` action is emitted.
5. Run `parseDeliveryTaskFileLines()` and observe the correct fail-closed `publication_scope_unproven` result.

PathCast issue #108 contains this exact four-task shape. Installed nmg-sdlc 3.21.3 at merged `main` commit `e9f433749bce13f3c53d19b9ce2e814992863a3b` cannot propose the safe canonical rewrite.

## Expected vs Actual

| | Description |
|---|-------------|
| **Expected** | Upgrade detection recognizes one safely recoverable `**Files**:` declaration per admitted task, emits a digest-bound exact-label rewrite, and leaves delivery parsing fail-closed until apply produces canonical `**File(s)**:` declarations. |
| **Actual** | `publicationFilesUpgrade()` scans only canonical labels, so it omits the package and offers no approved repair path. |

## Acceptance Criteria

### AC1: Singular Files near miss is detected

**Given** an Approved spec whose admitted task has exactly one `**Files**:` declaration and no canonical declaration
**When** `detectUpgrade()` runs with unrelated dependency collection disabled
**Then** it emits an actionable `publication-files:<digest>` item whose exact rewrite changes only the label to `**File(s)**:` and preserves the validated declaration value

### AC2: PathCast-shaped package rewrites exactly four labels

**Given** a four-task T001–T004 package shaped like PathCast issue #108 with one recoverable `**Files**:` declaration per task
**When** its detected publication action is approved and applied
**Then** exactly four labels become `**File(s)**:`, every declared path and unrelated byte remains unchanged, and repeat detection proposes no publication rewrite

### AC3: Unsafe declaration states remain untrusted

**Given** an admitted task with a missing declaration, duplicate file-like declarations, mixed canonical and near-miss declarations, an ambiguous file-like label, a malformed value, or hidden metadata
**When** upgrade detection runs
**Then** it emits no rewrite that could establish publication authority for that task and records a located finding when a file-like declaration is present

### AC4: Delivery parser contract is unchanged

**Given** the PathCast-shaped package before upgrade
**When** `parseDeliveryTaskFileLines()` evaluates it
**Then** it rejects the package with `publication_scope_unproven`

**And given** the same package after the approved digest-bound rewrite
**When** the parser evaluates it
**Then** it returns the complete intended path set without authorization broadening

### AC5: Canonical value recovery remains intact

**Given** an admitted task with exactly one canonical `**File(s)**:` declaration whose value needs an already-supported safe normalization
**When** upgrade detection and apply run
**Then** existing canonical recovery behavior remains unchanged
**And** the Unreleased changelog records the issue-owned defect fix

## Functional Requirements

| ID | Requirement | Priority |
|----|-------------|----------|
| FR1 | Detect exactly one supported `**Files**:` near miss inside an admitted `### TNNN:` task block | Must |
| FR2 | Reuse `publicationFileEntries()` and existing safe value recovery rather than adding a second path grammar | Must |
| FR3 | Emit exact canonical `**File(s)**:` output under the existing source and plan digests | Must |
| FR4 | Refuse missing, duplicate, mixed canonical/near-miss, ambiguous, malformed, hidden, and otherwise unsafe declarations | Must |
| FR5 | Preserve `parseDeliveryTaskFileLines()` and issue #383's fail-closed delivery contract | Must |
| FR6 | Prove the PathCast-shaped four-task pre-state, approved apply, post-state, exact path set, and repeat-run behavior | Must |
| FR7 | Keep dependency-graph collection out of scope unless focused reproduction independently proves it blocks publication detection | Must |
| FR8 | Record the pending issue-owned fix in the Unreleased changelog | Must |

## Out of Scope

- Accepting `**Files**:` in delivery parsing
- Mutating PathCast or installing the plugin
- Changing issue dependency detection or the GitHub graph
- Changing workflow, review, delivery, lease, recovery, or publication ownership
- Recovering any label other than the exact supported `**Files**:` near miss

## Change History

| Issue | Date | Summary |
|---|---|---|
| #386 | 2026-09-13 | Initial approved defect report |
