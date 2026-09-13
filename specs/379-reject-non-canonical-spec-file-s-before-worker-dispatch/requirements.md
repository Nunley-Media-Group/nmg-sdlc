# Defect Report: Reject non-canonical spec File(s) before worker dispatch

**Issue**: #379
**Date**: 2026-09-13
**Status**: Approved
**Author**: NMG
**Related Spec**: specs/374-recover-bounded-automatic-delivery-stops-without-loops/

---

## Reproduction

1. Approve a spec whose delivery task declares `**File(s)**: Create \`src/a.ts\``.
2. Treat the issue as spec-created / executable.
3. Run `/sdlc-execute #N` so the implement worker starts.
4. The worker runs `node scripts/sdlc-safe-recoveries.mjs bind --issue N --step implement --spec specs/N-SLUG` before edits.

## Expected vs Actual

| | Description |
|---|-------------|
| **Expected** | Invalid **File(s)** is rejected during spec validation and again in execute controller preflight, before any pane or worker is created. The rejection is `publication_scope_unproven` and names the spec path, task ID, line number, exact invalid entry, and accepted syntax. A canonical `**File(s)**: \`src/a.ts\`` binds an allowed-path set containing only that path plus spec-owned paths. `/sdlc-upgrade-project` detects recoverable non-canonical lines in existing packages and, after approval, rewrites them to that grammar. |
| **Actual** | Execute dispatches the implement worker. Bind then fails with stderr `publication_scope_unproven` and no location. `/sdlc-write-spec` can publish the same syntax. Existing packages stay invalid until a human rewrites them. |

## Acceptance Criteria

### AC1: Invalid prose is rejected before workers

**Given** an Approved spec whose delivery task declares `**File(s)**: Create \`src/a.ts\``
**When** spec validation or execute controller preflight runs
**Then** the issue is not treated as executable, no pane or worker is created, and the failure is `publication_scope_unproven` with spec path, task ID, line number, exact invalid entry, and accepted syntax

### AC2: Canonical literal path binds

**Given** an Approved spec whose delivery task declares only `**File(s)**: \`src/a.ts\``
**When** publication scope is bound
**Then** the allowed-path set contains only that path plus spec-owned paths

### AC3: Bounded glob or directory for generated steps

**Given** a documented bounded repository-relative glob or directory declaration for generated BDD step files
**When** publication scope is bound
**Then** matching files under that declaration are authorized and unrelated files remain unauthorized

### AC4: Write-spec and public documentation use the parser grammar

**Given** `/sdlc-write-spec` producing an Approved `tasks.md` and a user consulting `README.md`
**When** the installed publication File(s) parser reads every delivery-task **File(s)** line
**Then** every declaration is accepted by that parser, and README concisely documents the canonical grammar, prose rejection, and pre-dispatch diagnostic behavior

### AC5: No regression of valid declarations

**Given** currently valid quoted paths, comma/semicolon lists, supported globs/directories, delivery-owner-only annotations, existing valid specs, and existing safe-recovery publication tests
**When** the grammar is shared and the new gates run
**Then** those cases remain green and authorization stays fail-closed

### AC6: Upgrade rewrites recoverable existing File(s)

**Given** an issue-owned `specs/{N}-{slug}/tasks.md` whose delivery-task **File(s)** line is rejected by `publicationFileEntries` but contains only backtick-quoted valid repository-relative paths plus surrounding prose
**When** `/sdlc-upgrade-project` detects and the operator approves `publication-files:<digest>`
**Then** those lines are rewritten to canonical **File(s)** declarations the shared parser accepts
**And** mixed unsafe quoted spans and unquoted prose-only lines are findings, not silent extracts
**And** a changed tree after approval fails `publication_files_plan_stale` without mutation
**And** the live parser still rejects the original prose without upgrade

### AC7: Recovered smoke delivery remains admissible without fixture replacement

**Given** the registered smoke provider records an immutable closing-PR baseline, retained-clone identity, configured issue queue, validation/config identity, and nested controller run identity outside the identity-scanned checkout
**And** that exact nested execute returns nonzero before controller-owned recovery completes
**When** the same stable outer verification run evaluates the provider again, even if only report/evidence dirtiness changed
**Then** it reuses the original clone and baseline without cloning, launching a replacement issue, or accepting `NMG_SDLC_SMOKE_OWNED` as an outer bypass
**And** it requires the same nested run ID and issue/PR identity, the original expected verified head, a matching consumed `post_merge_observation`, current passed verification evidence, an identity-bound passed recovery-session delivery handoff when present, a delivery-helper-authored proof for the final head, expected-head ancestry to that final head, remote PR `MERGED`, issue `CLOSED`, and exclusion from the original baseline
**And** first success persists immutable accepted proof as cleanup-pending before removing the retained clone, advances to terminal-clean only after deletion succeeds, and makes same-key cleanup/terminal reruns revalidate stored proof remotely without recreating the clone or queue
**And** missing, stale, malformed, historical, unrelated, non-ancestor, config/issue/run/PR/head-mismatched, or manually claimed proof preserves the nonzero failure
**And** ordinary zero-exit delivery remains valid when cleanup removed `run.json`, but a present invalid `run.json` fails closed and all smoke-delivery proofs bind to one exact nested run ID
**And** when that stable recovery key predates the external store, it may seed exactly once from only the current outer `.omp/sdlc/verification/<outerIssue>.json`: the artifact must contain one exact failed `repository.nmg-sdlc-smoke` result for the stable outer issue/project/spec, validation/config, and configured queue; exactly one allowlisted retained clone; one complete baseline command per issue; and exactly one nonzero nested execute command/status
**And** the seeded legacy record is admissible without a `smoke-deliveries` proof only when the retained clone independently proves allowlisted origin and ancestry, exact nested run/issue/PR and immutable verified head, a current passed `.omp/sdlc/verification/<nestedIssue>.json` artifact, identity-bound passed recovery-session delivery, one matching consumed `post_merge_observation`, expected-head ancestry, and a new baseline-excluded remote exact-head merged PR with the issue closed; Markdown verification prose never substitutes for that JSON artifact
**And** Markdown prose, unrelated verification files or history, duplicate clone/execute evidence, incomplete baseline evidence, and mismatched or tampered outer, validation, config, queue, clone, run, issue, PR, or head identity never seed recovery and never launch a replacement
**And** an external recovery-store writer unlinks the exclusive lock only when that invocation acquired it; a losing `openSync(lock, "wx")` contender leaves the owner lock intact, later contenders remain blocked until owner release, and owner cleanup permits the next atomic write
**And** a terminal tombstone may validate a later #379 provider-fix head only for the same outer run/project/spec/validation/config/queue, when the stored outer head is an ancestor and every intervening changed path is limited to the approved smoke provider, its test, this spec package, and changelog; every replay rechecks ancestry, changed-path scope, immutable baseline, and exact remote merged-PR/closed-issue proof, preserves the original outer identity, and records the current validation identity separately

## Functional Requirements

| ID | Requirement | Priority |
|----|-------------|----------|
| FR1 | Share one canonical **File(s)** grammar across authoring, validation, publication binding, and upgrade rewrite | Must |
| FR2 | Fail closed: no prose mining in the live parser and no implicit scope broadening | Must |
| FR3 | `/sdlc-write-spec` emits only canonical **File(s)** declarations | Must |
| FR4 | Validate delivery-task **File(s)** before spec-created/executable and again before worker dispatch | Must |
| FR5 | `publication_scope_unproven` reports spec path, task ID, line, exact invalid entry, and accepted syntax | Must |
| FR6 | Preserve compatibility with currently valid quoted paths, lists, globs/directories, and delivery-owner-only annotations | Must |
| FR7 | Deterministic regression coverage listed in the test plan | Must |
| FR8 | Workflow, reference, and public README documentation state the canonical **File(s)** syntax and pre-dispatch failure behavior | Must |
| FR9 | `/sdlc-upgrade-project` detects and, after approval, rewrites recoverable existing **File(s)** lines; unrecoverable lines are findings | Must |
| FR10 | Persist smoke recovery state outside the identity-scanned checkout under a stable outer verification run/project/spec/issue key; bind immutable validation/config/queue/baseline/clone/nested-run evidence; reconcile nonzero recovery and idempotent terminal reruns only from exact controller-owned local evidence plus bounded remote MERGED/CLOSED proof; preserve ordinary zero-exit proof semantics and reject outer ownership bypass; when and only when the stable key has no record, atomically upgrade an exact pre-store failed smoke result from the current outer verification JSON and require all retained-clone, baseline, nested-run, recovery-session, post-merge, ancestry, and remote identity proofs without consulting Markdown or unrelated history; permit a terminal #379 provider-fix head advance only across an ancestor chain whose complete diff is confined to the approved provider/test/spec/changelog paths, rechecking that chain and remote proof on every replay while preserving original audit identity | Must |

## Out of Scope

- Making invalid prose succeed by extracting embedded paths in the live parser or bind path
- Epic or spike types
- Changing stage-publication reconcile/push ownership beyond shared parse, diagnostics, preflight timing, and the upgrade rewrite
- Rewriting consumer specs during #379 implementation; upgrade after approval is the repair path, including packages such as `specs/81-stale-displayroute-error/`

## Change History

| Issue | Date | Summary |
|-------|------|---------|
| #379 | 2026-09-13 | Initial defect report |
| #379 | 2026-09-13 | Spec revised before delivery: clarified the user-facing README obligation for canonical grammar and pre-dispatch diagnostics |
| #379 | 2026-09-13 | Pre-delivery review1 clarification: scope validation applies at new implement dispatch; bounded globs, unambiguous upgrade recovery, supported annotations, valid-package label backfill, and source line endings remain fail-closed or preserved as specified |
| #379 | 2026-09-13 | Verification remediation: require proof-first smoke classification when execute exits nonzero after a workflow-owned recovery |
| #379 | 2026-09-13 | Final verification remediation: authorized a fail-closed, JSON-only upgrade of the exact pre-recovery-store smoke failure into the stable recovery store |
| #379 | 2026-09-13 | Recovery-store concurrency remediation: exclusive lock cleanup is limited to the writer that acquired the lock |
| #379 | 2026-09-13 | Terminal-proof remediation authorized bounded provider-fix head advancement with per-replay ancestry, path, and remote-proof validation |
