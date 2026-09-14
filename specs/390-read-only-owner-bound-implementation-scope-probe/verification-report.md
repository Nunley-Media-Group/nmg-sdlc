# Verification Report: Read-only owner-bound implementation scope probe

**Issue**: #390
**Date**: 2026-09-14
**Status**: Passed
**Spec**: `specs/390-read-only-owner-bound-implementation-scope-probe/`

## Acceptance Results

| Criterion | Result | Evidence |
|-----------|--------|----------|
| AC1 | Pass | API and CLI fixture bind the actual Git branch, active run, and exactly one matching incomplete owner; mismatches fail closed. |
| AC2 | Pass | Exact PathCast exercise compares SHA-256 and base64 bytes before/after, observes no controller lock, and leaves run, recovery, handoff, spec, product, and `.pi-glla` state unchanged. |
| AC3 | Pass | Structured scope has exactly five fields and separates tracked, explicitly untracked, task provenance, read-only, and combined allowed paths. |
| AC4 | Pass | Exact PathCast T001-T004 fixture returns 18 allowed, 12 tracked, six untracked evidence paths, one stale-branch discrepancy, and no writable spec path. |
| AC5 | Pass | Closed path-annotation grammar accepts only Create, Modify, Delete, Download untracked, Generate untracked, and the minimal current-spec/test non-operation allowlist; case-insensitive archive/rename/move/recursive-delete and comma/slash/pipe/`or` combinations fail with located `publication_scope_unproven`. |
| AC6 | Pass | Safe-recovery, execute, apply-review, and delivery suites pass with explicit apply-review and deliver regressions proving rejected annotations never reach a consumer allowlist. |
| AC7 | Pass | README, write-code workflow, changelog, plugin surface, current spec archive, workflow inventory stability, version sync, and contribution evidence are verified. |

## Commands and Outcomes

- `cd scripts && npm test -- --runInBand __tests__/extension-commands.test.mjs __tests__/rendered-prompt-contract.test.mjs __tests__/sdlc-execute-supervisor.test.mjs` — passed: three suites, 30 tests.
- `cd scripts && npm test -- --runInBand __tests__/sdlc-safe-recoveries.test.mjs __tests__/sdlc-execute.test.mjs __tests__/sdlc-apply-review.test.mjs __tests__/sdlc-deliver.test.mjs` — passed: four suites, 534 tests (106 safe-recoveries, 295 execute, 17 apply-review, 116 deliver).
- `cd scripts && npm test -- --runInBand` — passed: 55 suites passed, one suite skipped; 1,298 tests passed and two skipped (1,300 total).
- `cd scripts && npm test -- --runInBand __tests__/sdlc-safe-recoveries.test.mjs -t "reports exact PathCast 18/12/6 scope"` — passed: one disposable real-Git PathCast-state copy exercise; 105 unrelated tests skipped by name filter.
- `node scripts/verify-plugin-surface.mjs --root . --label repository` — passed.
- `node scripts/verify-current-specs.mjs` — passed: 79 genuine issue specs, 16 required archive specs, 16 rewrite capabilities, 16 active workflow mappings, one deprecated stub.
- `node scripts/skill-inventory-audit.mjs --check` — passed: 43 items mapped.
- Resolved `skill://skill-creator` validator against a disposable `SKILL.md` copy of `workflows/write-code/WORKFLOW.md` — passed: `write-code`, 122 lines.
- VERSION/package comparison — passed at `3.21.3`; no implementation-time bump.
- Active #390 structured scope inspection — passed with 13 tracked, zero untracked, 13 allowed, four read-only spec inputs, four task records, and `verification-report.md` excluded from `allowedPaths`.
- Rendered workflow inspection — passed: operative `probe` precedes subject-bound `bind`, which precedes `reconcile`; runtime materialization leaves no `<plugin-root>` token, and the unchanged legacy sentence remains explicitly historical.
- Changed JavaScript syntax checks, contribution evidence, and `git diff --check` — passed.
- Temporary contribution input and `scripts/node_modules` dependency link were removed after validation.

## Failed Required Check Remediation

- GitHub Actions run `34811188311`, job `103872706457`, failed at head `cd5eb7f4867286e065c71b2fa30c519fe2ca9b24`: three suites failed, 1,295 tests passed, and two were skipped.
- `extension-commands.test.mjs` still required the legacy subjectless `bind` and abbreviated `reconcile` source strings.
- `rendered-prompt-contract.test.mjs` still required the legacy sentence `A clean subjectless bind establishes the approved owner/path scope before edits`.
- `sdlc-execute-supervisor.test.mjs` expected missing-subject and wrong-issue binds to report `publication_subject_unproven`, but its empty task fixture failed the stricter scope parser first with `publication_scope_unproven`.
- Root cause: the #390 runtime cutover correctly required pre-edit probing and subject-bound publication, but removed legacy source wording still pinned by two unchanged repository contracts, while the supervisor's synthetic valid-subject fixture supplied no canonical writable task authority.
- Remediation: the two unauthorized contract tests are restored byte-identical to failed-CI/pre-remediation head `cd5eb7f4867286e065c71b2fa30c519fe2ca9b24`. The authorized workflow keeps operative `probe` → subject-bound `bind` → `reconcile`, preserves literal `<plugin-root>` command operands, and labels the old sentence and subjectless command explicitly false/obsolete. The authorized supervisor fixture gives `src/code.mjs` canonical `Modify` authority, commits that file, dirties that file for bind, and preserves both subjectless and wrong-issue assertions. Implement `bind` continues to reject missing or invalid subjects before lease or scope inspection.
- Exact failed-suite rerun — passed: three suites and 30 tests.

## Independent-Review Findings

- **HIGH — open path-annotation operation grammar: remediated.** The parser no longer treats unknown parenthetical notes as task-Type fallback. Exact supported operations remain case-insensitive for existing canonical lowercase declarations; all unsupported operation-bearing notes and ambiguous combinations fail closed with task/file/line diagnostics. `delivery-owner only` remains excluded. Current-spec/test notes are an explicit finite allowlist.
- **HIGH — incomplete execute checkpoint accepted by probe: remediated.** The probe validates schema, canonical project root, run id, run-level issue membership, unique positive issues, current issue/step, 40-character lowercase hexadecimal head, positive revision, branch, completed/failed structures, complete worker tuples, and the active-run invariant `nextStep(completed[currentIssue]) === currentStep` before selecting an owner or inspecting scope. Every `completed[issue]` is additionally bounded to `VALID_STEPS.length` and must equal the exact ordered prefix `steps.every((step, index) => step === VALID_STEPS[index])`. Public-API cases use the deliberately unapproved `specs/not-approved` path and reject reordered `["review1", "start"]`, skipped/future `["start", "review1"]`, current-step mismatch `["start", "implement"]`, duplicate, overlong, and invalid non-current-issue arrays as `recovery_owner_ambiguous`; a run spy observes only the prerequisite branch lookup and no scope-inspection Git call. The complete stale-branch PathCast checkpoint with `completed: { 108: ["start"] }` succeeds only with its explicit branch discrepancy.

## Final-Tree Revalidation

The final production and regression tree passed the four focused suites and exact PathCast exercise listed above: 106 safe-recoveries, 295 execute, 17 apply-review, and 116 delivery tests (534 total). The amended supervisor fixture succeeds only after dirtying its canonical task-authorized `src/code.mjs`; its subjectless and wrong-issue cases still fail `publication_subject_unproven`. The unchanged extension and rendered-prompt contracts pass through accurate explicitly obsolete workflow wording, not test edits. Apply-review and delivery each have a consumer-level regression that presents an `Archive` path annotation and observes `publication_scope_unproven` before commit, push, or merge-tree execution. Public `probePublicationScope` regressions use an unapproved spec and reject reordered, skipped/future, current-step-mismatched, duplicate, overlong, and invalid non-current-issue completed-step arrays before spec inspection or writable authority; their run spy sees only the branch lookup and no scope-inspection Git call. The PathCast exercise confirms a structurally complete active checkpoint, 18/12/6 scope, unchanged protected bytes and SHA-256 hashes, and no controller lock.

## Changed-Path Alignment

- Behavior for `scripts/sdlc-safe-recoveries.mjs`: returns structured scope and exposes a native no-write owner-bound probe.
- Behavior for `scripts/sdlc-execute.mjs`: establishes the implement owner under the controller lease before worker dispatch and consumes structured inspection.
- Behavior for `scripts/sdlc-apply-review.mjs`: authorizes review-fix publication only through `scope.allowedPaths`.
- Behavior for `scripts/sdlc-deliver.mjs`: authorizes mergeability reconciliation only through `scope.allowedPaths`.
- Behavior for `scripts/__tests__/`: covers the probe, exact fixture, parser precedence, controller owner establishment, supervisor task authority, and existing consumers. Final blobs for `extension-commands.test.mjs` and `rendered-prompt-contract.test.mjs` equal failed-CI/pre-remediation head `cd5eb7f4867286e065c71b2fa30c519fe2ca9b24` and have zero aggregate feature-base diff.
- Behavior for `scripts/__fixtures__/pathcast-108-publication-scope/`: preserves the exact canonical PathCast #108 T001-T004 task input.
- Behavior for `workflows/write-code/WORKFLOW.md`: runs read-only `probe` before edits, state-changing subject-bound `bind` only at publication, then `reconcile`; legacy source strings are explicitly obsolete compatibility wording.
- Behavior for `README.md`: documents CLI/API arguments, structured JSON, discrepancies, and mutation boundary.
- Behavior for `CHANGELOG.md`: records the unreleased defect fix.
- Behavior for `specs/390-read-only-owner-bound-implementation-scope-probe/`: records the singular Approved contract, amendment, and delivery-owned verification evidence.
- Scope proof: aggregate feature base `37037a7bca9bba4e2567de92014d17c768991471` to final head contains exactly 18 changed paths—all 14 paths declared by T001-T004 plus the four issue-owned specification documents—and no undeclared path. Failed-CI/pre-remediation head `cd5eb7f4867286e065c71b2fa30c519fe2ca9b24` to final head contains nine declared or amendment-spec paths and excludes both unauthorized tests. The active implementation scope contains 13 writable paths because delivery-owned `verification-report.md` and the four spec inputs remain excluded.

## Steering Alignment

- Product: preserves issue/spec traceability, exact mutation scope, read-only diagnostics, and worker isolation.
- Technical: uses Node ESM built-ins, argument arrays, stable reason codes, no dependencies, and cross-platform `node:path` handling.
- Structure: keeps deterministic inspection in `scripts/`, workflow behavior in `workflows/write-code/`, public guidance in README, and issue authority in one singular spec package.

## Residual Risks

- Operation classification intentionally requires explicit `Download untracked` or `Generate untracked` annotations for untracked authority; older specs without those annotations remain tracked-scope semantics.
- The probe reports stale checkpoint branch metadata but does not repair it. Controller/state repair remains outside #390.
- The probe is cooperative read-only observation; another process can mutate repository state after the probe returns. Publication bind/reconcile revalidate later under the controller lease.
