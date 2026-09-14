# Defect Report: Read-only owner-bound implementation scope probe

**Issue**: #390
**Date**: 2026-09-13
**Status**: Approved
**Author**: NMG
**Related Spec**: specs/383-reject-missing-near-miss-or-duplicate-delivery-file-declarations/

---

## Reproduction

1. Use the installed plugin against PathCast issue #108 after its singular Approved package has canonical `**File(s)**:` declarations.
2. Call `inspectPublicationScope({ cwd, issue: 108, spec, step: 'implement' })`.
3. Observe a flat 22-path writable list: 18 task paths plus all four spec package files.
4. Attempt to establish owner-bound scope with the documented `bind` command and observe controller-lease acquisition plus possible safe-recovery owner writes.
5. Observe `.omp/sdlc/run.json.branch` report `main` while Git and the unique incomplete recovery-owner tuple report `108-establish-claim-specific-ip-and-product-safety-guardrails`.

## Expected vs Actual

| | Description |
|---|-------------|
| **Expected** | A native owner-bound probe reads the current Git branch, execute checkpoint, unique incomplete recovery owner, and singular Approved task authority without locks or writes. It reports branch disagreement and returns structured implementation scope whose `allowedPaths` contains only task-authorized tracked and explicitly untracked evidence paths. |
| **Actual** | Scope is a flat list widened by four read-only spec inputs, while the only documented owner-bound command is state-changing and can hide the distinction between stale checkpoint branch data and actual owner-bound checkout state. |

## Acceptance Criteria

### AC1: Native read-only owner binding

**Given** an issue, `implement` step, exact singular Approved spec path, and controller run id
**When** the API or `probe` CLI inspects publication scope
**Then** it derives the actual Git branch, current run identity/state, and exactly one matching incomplete safe-recovery owner tuple without caller-supplied recovery or branch overrides
**And** missing, mismatched, detached, or ambiguous issue, step, run, owner, project root, or current branch fails closed

### AC2: No mutation or lease acquisition

**Given** valid or invalid probe input
**When** the probe completes or fails
**Then** it never acquires a controller lock, consumes or creates a recovery record, or writes run, handoff, recovery, spec, product, `.pi-glla`, index, commit, or working-tree data
**And** before/after bytes and hashes of the observed state remain identical

### AC3: Structured task authority

**Given** canonical delivery tasks containing writable, read-only, and explicitly untracked evidence declarations
**When** implementation scope is inspected
**Then** the scope contains exactly `trackedWritablePaths`, `untrackedEvidencePaths`, `taskOperations`, `readOnlyPaths`, and `allowedPaths`
**And** `allowedPaths` is the sorted union of tracked writable and explicitly untracked evidence paths
**And** the four spec files and every `**Read-only**` or `**Acquire**` input not separately writable remain only in `readOnlyPaths`

### AC4: PathCast #108 regression

**Given** the exact canonical PathCast T001-T004 task fixture, stale run branch `main`, actual owner branch `108-establish-claim-specific-ip-and-product-safety-guardrails`, and matching controller/owner id
**When** the probe runs against a disposable real Git copy
**Then** it reports one branch discrepancy, a uniquely bound owner, 12 tracked writable paths, six explicitly Download/Generate untracked evidence paths, and exactly 18 allowed paths
**And** no spec path is writable or allowed

### AC5: Deterministic parser precedence and rejection

**Given** a path that is read-only in one task and writable in another, duplicate path operations, or Create followed by Modify
**When** task operations are reduced
**Then** writable task authority takes precedence over read-only input status, all task-relative provenance remains observable, and the final classification is deterministic
**And** missing, near-miss, duplicate, ambiguous, or unsupported canonical declarations fail `publication_scope_unproven` with existing location diagnostics

### AC6: Clean consumer migration

**Given** execute preflight, write-code mutation authorization, review-fix publication, delivery reconciliation, and state-changing bind/reconcile consumers
**When** they inspect or enforce implementation scope
**Then** each authorizes mutation only with structured `allowedPaths`
**And** existing `bind` and `reconcile` actions remain available but consume the corrected structured scope without re-adding spec files or compatibility aliases

### AC7: Documentation and release evidence

**Given** the new public CLI/API behavior
**When** repository checks run
**Then** README and write-code workflow document the read-only probe, owner-bound arguments, structured JSON, discrepancy behavior, and later state-changing bind boundary
**And** changelog, plugin surface, current/stability checks, contribution evidence, version synchronization, focused tests, disposable PathCast exercise, and diff hygiene pass
**And** the full-CI supervisor valid-subject bind fixture declares canonical `File(s): src/code.mjs (Modify)`, dirties `src/code.mjs`, and preserves subjectless and wrong-issue rejection assertions
**And** extension-command and rendered-prompt tests receive no new implementation authority because their expectations are satisfied through the authorized write-code workflow
**And** the verification report is delivery-owner evidence and never enters implementation `allowedPaths`

## Functional Requirements

| ID | Requirement | Priority |
|----|-------------|----------|
| FR1 | Export a read-only owner-bound scope API and `probe` CLI accepting only issue, implement step, exact spec, and controller run id | Must |
| FR2 | Read and validate Git branch, run checkpoint, and one safe-recovery owner without lease or filesystem mutation | Must |
| FR3 | Return the five-field structured scope and separate binding/discrepancy evidence | Must |
| FR4 | Parse explicit Create/Modify/Delete and Download/Generate untracked operations with task and source-line provenance | Must |
| FR5 | Collect spec, `Read-only`, and `Acquire` inputs as read-only only unless separately writable | Must |
| FR6 | Preserve strict canonical declaration cardinality and fail-closed diagnostics | Must |
| FR7 | Migrate every scope consumer to `.allowedPaths`; retain no flat-list or spec-seeding path | Must |
| FR8 | Prove exact PathCast 18/12/6 behavior and byte-identical probe state in a disposable Git fixture | Must |
| FR9 | Update public/workflow/changelog surfaces without an implementation-time version bump | Must |
| FR10 | Correct only the obsolete supervisor valid-subject fixture with canonical task authority and a dirty authorized implementation file while preserving its rejection cases | Must |
| FR11 | Keep verification-report evidence delivery-owner only and outside implementation `allowedPaths`; authorize no additional extension-command or rendered-prompt test path | Must |

## Out of Scope

- Repairing PathCast `.omp/sdlc/run.json.branch`, recovery ownership, or issue #108 product files
- Acquiring leases, creating owners, consuming recovery records, committing, pushing, opening a pull request, merging, closing, publishing, or installing
- Changing canonical `**File(s)**:` path grammar or the publication-only upgrade contract
- Adding branch override, session-token, prior-incomplete, or explicit recovery arguments to the probe
- Simplification or independent review

## Change History

| Issue | Date | Summary |
|-------|------|---------|
| #390 | 2026-09-13 | Initial approved defect report |
| #390 | 2026-09-14 | Added the full-CI supervisor fixture remediation and explicit delivery-owned evidence boundary |
