# Root Cause Analysis: Reject non-canonical spec File(s) before worker dispatch

**Issue**: #379
**Date**: 2026-09-13
**Status**: Approved
**Author**: NMG
**Related Spec**: specs/374-recover-bounded-automatic-delivery-stops-without-loops/
---

## Root Cause

`publicationFileEntries` in `scripts/sdlc-safe-recoveries.mjs` parses each **File(s)** value as a whole declaration. It accepts an optional `plus new ` prefix, a quoted `` `path` `` or an unquoted token matching `[^\s`(),;]+` that contains `/` or `.` or is ALL_CAPS, optional parenthetical notes, and comma/semicolon-separated lists. It does not extract paths from surrounding prose. Imperative text such as `Create \`src/a.ts\`` fails that whole-declaration match and throws `publication_scope_unproven`.

`inspectPublicationScope` runs from the worker-side bind CLI in `workflows/write-code/WORKFLOW.md` after execute has already split a pane. `scripts/sdlc-execute.mjs` treats an issue as executable from `spec-created` plus Approved frontmatter (`specStatus` / `isSpecApproved`). `scripts/spec-created-label.mjs` and `scripts/publish-approved-spec.mjs` do not parse **File(s)**. Bind catch writes only `error.reasonCode` to stderr.

`workflows/write-spec/templates/tasks.md` shows placeholders (`[varies]`, `A or B`) that are not valid grammar. `/sdlc-upgrade-project` has no publication-files detector, so existing invalid packages stay unexecutable.

### Affected Code

| File | Lines | Role |
|------|-------|------|
| `scripts/sdlc-safe-recoveries.mjs` | `publicationFileEntries`, `inspectPublicationScope`, `runCli` catch | Whole-declaration parse; bind is first failure; stderr is reasonCode only |
| `scripts/sdlc-execute.mjs` | issue loop after `spec.approved` | Starts panes without File(s) preflight |
| `scripts/publish-approved-spec.mjs` | `commitPush`, `mergeSpec` | Approves packages without File(s) parse |
| `scripts/sdlc-upgrade.mjs` | `detectUpgrade` / `applyUpgrade` | No File(s) rewrite category |
| `workflows/write-spec/templates/tasks.md` | File(s) examples | Invalid placeholders copied into specs |

### Triggering Conditions

- Delivery-task **File(s)** value is prose-prefixed or otherwise not a whole declaration
- Issue is labeled spec-created and four files are Approved
- `/sdlc-execute` splits an implement pane before bind
- Upgrade is not run, or has no rewrite detector

---

## Fix Strategy

### Approach

Keep one parser. Export it. Fail closed on prose in live bind/preflight/publish. Add location fields. Run syntax validation at commit-push/merge (no git expansion). Run full `inspectPublicationScope` (including empty glob/dir) in execute before any `paneSplit`. Teach write-spec to emit only canonical lines and make template examples valid. Add an upgrade detector that rewrites only when every backtick-quoted span is already a valid path; never teach the live parser to mine prose.

For the one legacy boundary created before the external recovery store existed, inspect only the current outer verification JSON at the stable outer issue path. Treat a matching failed smoke result as migration input, not as delivery proof: require one retained-clone artifact under the platform temporary root, the matching clone-command artifact, one parseable baseline command per configured issue, and one exact queued execute command paired with a nonzero result status. Bind the current stable outer scope and request validation/config to that evidence, derive the nested run, immutable expected head, initial clone head, and queue from the retained clone, and create the failed store record with the store's exclusive atomic write.

The exclusive recovery-store write owns its lock only after `openSync(lock, "wx")` succeeds. A contender that receives `EEXIST` may clean up only its own temporary path and must not unlink the current writer's lock; the owner retains the existing atomic write/rename and lock cleanup sequence.

After that write, use the normal retained-invocation reconciliation. The legacy record alone may omit the later `smoke-deliveries` file because the old provider could not create it after an automatic-review stop; all stronger independent checks remain mandatory: allowlisted origin, initial-head ancestry, exact run/issue/PR, a current passed nested verification JSON artifact at the immutable expected head, one identity-bound passed recovery session, one consumed `post_merge_observation`, expected-to-final-head ancestry, original baseline exclusion, and remote exact PR/head/MERGED plus issue CLOSED. The ordinary recovery Markdown fallback is disabled for this migration. Any ambiguity or mismatch rejects migration before a replacement clone or queue can launch.

A terminal tombstone remains anchored to its original outer identity. For the #379 verification-owned provider repair only, a later request may use the same stable run/project/spec/validation/config/queue when Git proves the stored outer head is an ancestor of the current head and the complete `git diff --name-only --no-renames -z` path set is limited to the smoke provider, its focused test, the four approved #379 spec files, and `CHANGELOG.md`. Controller, delivery, workflow, README/consumer-facing, non-ancestor, empty, malformed, or any other paths fail closed. The provider reruns ancestry and changed-path validation on every replay, including after recording `validationHead` and `validationIdentity`; those fields are audit metadata, never authority. Only after immutable baselines and exact remote PR/head/MERGED plus issue CLOSED proof revalidate does it persist the current validation identity, without replacing the original outer head or smoke proof.

### Changes

| File | Change | Rationale |
|------|--------|-----------|
| `scripts/sdlc-safe-recoveries.mjs` | Export parse + syntax constant; locate errors; empty glob/dir unproven; richer bind stderr | Shared grammar and diagnostics |
| `scripts/sdlc-execute.mjs` | Preflight inspectPublicationScope before paneSplit | AC1 timing |
| `scripts/publish-approved-spec.mjs` | parseDeliveryTaskFileLines before add/PR | Block spec-created of invalid File(s) |
| `scripts/sdlc-upgrade.mjs` | detect/apply `publication-files` | AC6 existing packages |
| `workflows/write-spec/WORKFLOW.md` | Canonical File(s) contract | AC4 |
| `workflows/write-spec/templates/tasks.md` | Valid example values | AC4 |
| `README.md` | Document canonical grammar and pre-dispatch diagnostics | Public user-facing contract required by AGENTS.md and AC4 |
| `steering/extensions/nmg-sdlc-smoke.mjs` | Persist externally keyed recovery/terminal state; authenticate nested recursion separately from delivery proof ownership; reconcile exact retained invocation evidence; revalidate narrowly approved #379 provider-fix head advancement on every terminal replay | Prevent replacement fixtures and historical/manual proof acceptance without perturbing original outer identity |
| `scripts/sdlc-execute.mjs` | Propagate `NMG_SDLC_SMOKE_RECOVERY` only to verify panes while preserving `NMG_SDLC_SMOKE_OWNED=1` for verify/deliver | Separate recursion authentication from smoke proof generation |
| `scripts/sdlc-deliver.mjs` | Include controller `runId` in the existing smoke-delivery proof | Durably bind proof to the exact nested controller after `run.json` cleanup |
| `scripts/sdlc-verify-steering.mjs`, `src/sdlc-verification-runtime.mjs` | Carry a stable explicit outer verification run/issue/spec identity into provider requests | Key recovery outside the identity-scanned checkout without depending on mutable dirty identity |
| `scripts/__tests__/nmg-sdlc-smoke.test.mjs`, `scripts/__tests__/sdlc-execute.test.mjs`, `scripts/__tests__/sdlc-deliver.test.mjs`, `scripts/__tests__/sdlc-verification-runtime.test.mjs` | Cover persistence identity stability, token propagation, exact recovery, terminal replay, cleanup, lock ownership, bounded provider-fix head advancement, repeated revalidation, and ancestry/path tamper rejection | AC7 regression boundary |
| `steering/extensions/nmg-sdlc-smoke.mjs` | Parse the exact pre-store failed outer verification envelope, atomically seed one failed record, and reconcile it through retained-clone/local/remote validators | Recover the real #379/#109 legacy invocation without trusting prose, unrelated history, or replacement work |

### Blast Radius

- **Direct impact**: recoveries parser, execute preflight and verify-pane environment, publish helper, delivery smoke proof, verification request identity, upgrade detect/apply, write-spec templates/workflow, upgrade-project workflow, provider recovery state, and README publication guidance
- **Indirect impact**: write-code/verify bind still call inspectPublicationScope; valid specs unchanged; invalid existing specs become executable only after approved upgrade rewrite; successful smoke recovery retains only an external immutable tombstone after clone cleanup
- **Risk level**: Medium — preflight and empty-glob tightening can fail previously “passed bind with spec-only paths” cases; recovery now fails closed on missing/tampered baseline, run, session, verification, ancestry, terminal, or remote evidence

---

## Regression Risk

| Risk | Likelihood | Mitigation |
|------|------------|------------|
| Valid quoted/list/glob/annotation cases break | Low | Keep existing inspectPublicationScope fixture; add explicit valid rows |
| Empty glob now unproven while spec files exist | Med | Required by issue; test it; write-spec still allows undeclared-yet literals via parse-only publish |
| Upgrade extracts unsafe paths | Low | Mixed invalid quoted spans → finding, no rewrite; live parser unchanged |
| Nonzero smoke exit masks a completed recovered delivery | Med | Persist baseline/clone/run outside the checkout; for the pre-store boundary, admit only one exact failed outer verification JSON with complete command evidence; bind final proof to the original run/PR and expected-head ancestry; require verification/session/recovery evidence plus bounded MERGED/CLOSED observation; tombstone terminal result before clone cleanup |
| Recovery state perturbs its own lookup identity | Med | Stable key uses explicit outer verification run plus real project/spec/issue; store remains outside checkout; regression recomputes identity and lookup before/after persistence |
| A losing recovery writer removes the owner's lock | Med | Guard lock unlink with successful descriptor acquisition; contend with a real owner process and prove a second contender remains blocked until owner release |
| Terminal proof trusts a later or previously recorded validation head without rechecking history | Med | Revalidate stored-head ancestry and the complete exact allowlisted path set on every replay; persist current validation identity only after remote proof passes |
| Bare smoke ownership suppresses the outer gate | Low | Keep `NMG_SDLC_SMOKE_OWNED=1` only for proof generation and require a separate provider-created token validated against exact clone/run state |
| Circular imports | Low | recoveries must not import execute or publish-approved-spec |

---

## Alternatives Considered

| Option | Description | Why Not Selected |
|--------|-------------|------------------|
| Mine paths from prose in publicationFileEntries | Make `Create \`src/a.ts\`` bind | Violates fail-closed authorization |
| Rewrite consumer specs in this delivery | Fix #81 in nmg-sdlc implement | Out of scope for implement; upgrade is the approved rewriter |
| Validate only at bind | Keep execute dispatch | Does not meet AC1 pane timing |

---

## Validation Checklist

Before moving to TASKS phase:

- [x] Root cause is identified with specific code references
- [x] Fix is minimal — no unrelated refactoring
- [x] Blast radius is assessed
- [x] Regression risks are documented with mitigations
- [x] Fix follows existing project patterns (per `structure.md`)

## Change History

| Issue | Date | Summary |
|---|---|---|
| #379 | 2026-09-13 | Initial defect report |
| #379 | 2026-09-13 | Spec revised before delivery: added the public README grammar and pre-dispatch diagnostics obligation |
| #379 | 2026-09-13 | Verification remediation aligned the mutable smoke provider with its registered proof-first nonzero-exit contract |
| #379 | 2026-09-13 | Pre-delivery review1 clarification: place validation at new implement dispatch, require a non-magic glob prefix, preserve safe annotations and line endings, reject ambiguous recovery, and withhold label backfill from invalid packages |
| #379 | 2026-09-13 | Final remediation added a one-time, fail-closed migration for the exact pre-recovery-store outer verification layout |
| #379 | 2026-09-13 | Terminal-proof remediation added a narrow, replay-validated provider-fix head advancement rule |
