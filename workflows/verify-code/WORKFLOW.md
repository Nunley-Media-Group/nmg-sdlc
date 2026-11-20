---
name: verify-code
description: "Verify approved specs at the exact source head: review first against a checklist that must be complete, hand every finding back in one pass, then run the pre-merge steering validations once, publish a truthful report, and produce a full-green handoff. Pending PR-only evidence creates a draft before final Pass; Fail, Partial, Incomplete and stale results return to diagnosis."
---

# Verify Code

Verification has two phases, always in this order:

1. **Review** — read the change against the Approved spec and complete the review checklist. No steering validation runs in this phase. Every finding goes back to implement in one handoff whenever one of them is `blocking`, `major` or `minor`.
2. **Gate** — run the pre-merge steering validations once, write the report and finalize.

A review that hands back ends verification before any validation starts. Defects that reading the code and a small probe can find must be found here, not one per gate cycle.

Under `/sdlc-execute` the worker header names the phase (`Verify phase: review` or `Verify phase: gate`); do only that phase. The gate phase is dispatched when the branch is at the head of the repository's merge queue, with the default branch already integrated and the version already prepared, so the validations run once against what will merge. Standalone `/sdlc-verify-code #N` runs the review and, when it passes, continues into the gate.

No user questions.

## Spec and Context Load

1. Resolve N from arg or current branch name (^\d+-).

2. A leftover `spike` label is not a skip or fail reason. Verify the approved `specs/{N}-{slug}/` package.

3. Resolve spec dir: glob "specs/", first dir whose basename starts with "N-" (leading number match).
   Read frontmatter **Issue**: #N and **Status**: Approved from requirements.md design.md tasks.md feature.gherkin (as applicable).
   Any mismatch or missing Approved → failed handoff reasonCode:"spec_not_approved" intervention:true step:"verify"

4. Load and validate `steering/manifest.json` and its registered modules/snippets/extensions. `steering_manifest_missing` or any invalid runtime is an `Incomplete` ceiling. Do not fall back to `steering/product.md`, `steering/tech.md`, or `steering/structure.md`.

5. Read the verification report template from references/report-format.md and checklists/* for the architecture areas.

Before reviewing, running verification, modifying code, or generating a report, bind the durable verify owner:

```bash
node "<plugin-root>/scripts/sdlc-safe-recoveries.mjs" bind --issue N --step verify --spec specs/N-SLUG [--controller-run-id R]
```

Use the exact worker-header invocation id when present; omit it only for standalone work. Require `NMG_SDLC_PUBLICATION` with `passed:true` from current issue, branch, Approved spec and publication scope. The lease is only a mutex; historical owner records and `run.json` never authorize or veto verification.

When the worker header provides a non-empty controller run id, replace every bracketed `[--controller-run-id R]` below with `--controller-run-id R` using that exact value. Omit the option only for standalone verification.

## Phase 1: Review

### Open the checklist

```bash
node "<plugin-root>/scripts/sdlc-review.mjs" init --issue N --spec specs/N-SLUG --base main [--controller-run-id R]
```

This writes `.nmg-sdlc/verification/N-review.json` for the current HEAD and prints its rows. The checklist holds one row for:

- each acceptance criterion of the issue's delivery slice (`AC1`, …);
- each functional requirement (`FR1`, …);
- each error and state path the design names (`DP1`, …). When none could be extracted there is a single `DP0` row: read design.md, add one `design-path` row per error or state path it names, then record `DP0`;
- `CONSUMERS`: every consumer of an identifier, job name or contract the change introduces or extends. Find them (search for each new or changed name across code, configuration, workflows, CI and documentation), add one `consumer` row per consumer found, then record `CONSUMERS`. A new name that nothing registers, schedules, imports or documents is a finding.

`mode` is `full` or `scoped`:

- `full` — evaluate every row.
- `scoped` — this review follows a repair of an earlier review's findings, and the repair stayed inside the files those findings named. Rows marked `carried` keep their earlier verdict. Re-check each listed `previousFindings` entry, the rows with no verdict, and the `REPAIR` row, which covers the repair diff (`repairPaths`) for new defects.
- When the repair touched files outside the findings' scope, `init` reports `fullReviewBecause` and the review is `full` again.

To see the scope without opening a checklist, run `node "<plugin-root>/scripts/sdlc-review-scope.mjs" --issue N`. It is read-only and prints `{ "mode": "scoped", "priorHead", "findings", "repairPaths" }`, or `{ "mode": "full" }` with `outsidePaths` when the repair reached outside the findings' files.

### Run the three lenses

The review is three lenses over the same change. Run them in parallel as subagents where a subagent tool is available, each given the spec, the diff against the base and its lens; otherwise run them one after the other. Merge their results into the one review record.

| Lens | It answers |
|------|-----------|
| `acceptance` | Walk every acceptance criterion and functional requirement from the entry point a user or caller actually uses to the observable result. Does the change do what each one says? Did every task produce what it lists? |
| `failure-paths` | For every error and state path the design names, and every consumer: what happens on failure, on empty or malformed input, on a retry, on a crash between two steps, on concurrent use? Apply the security, performance and error-handling checklists. |
| `test-quality` | Does each criterion's test exercise the path the criterion is about, or a mock of it? Would the tests fail if the behaviour were wrong? Apply the testability and SOLID checklists. |

Use `Grep` and `Read` for evidence, and small probes (a focused test, a one-off script, a single command) where reading is not enough. Do not run the repository suite or any steering validation in this phase.

A command that steering marks as heavy, or any probe that is heavy on the machine, takes a slot from the host-wide pool:

```bash
node "<plugin-root>/scripts/sdlc-heavy-pool.mjs" run --label "probe #N" -- <program> [args...]
```

For plugin changes (detect via git diff on workflows/ and agents/) follow exercise-testing.md: from a disposable project run `node "<plugin-root>/scripts/exercise-claude.mjs" --cwd <project> -- /sdlc-NAME [args]`, which loads this checkout through `claude -p --plugin-dir <plugin-root>`. Preserve the prior dry-run contract and use state-based termination without a wall-clock deadline.

### Record every row, lens and finding

Edit `.nmg-sdlc/verification/N-review.json`:

- Every row gets a `verdict` (`pass`, `fail`, `partial`, `not_applicable`) and `evidence` naming what was read or run (file and line, command and result).
- Every acceptance row also gets `exercised`: `real_entry_point` when its test drives the real entry point, `mocked` when its tests mock the path the criterion is about, `not_exercisable` when the project cannot exercise it. Exercise each criterion through the real entry point where the project allows it.
- Every lens gets `status: "complete"` and a one-line `summary`.
- Every defect is one entry in `findings`: `{ "id", "lens", "severity", "rows", "files", "summary" }`. `severity` is `blocking`, `major`, `minor` or `info`; `rows` names the checklist rows it breaks; `files` names every file a repair would touch. Record all of them — do not stop at the first, and do not hold minor ones back for a later pass.

Under `/sdlc-execute`, do not edit source in this phase: findings go back to implement. Standalone, a safe and local fix may be applied (invoke the `skill-creator` skill with the `Skill` tool before any skill-bundled edit); a fix moves HEAD, so run `init` again afterwards.

### Close the review

```bash
node "<plugin-root>/scripts/sdlc-review.mjs" finalize --issue N --spec specs/N-SLUG [--controller-run-id R]
```

- `NMG_SDLC_REVIEW_REFUSED` with `reasonCode: "review_checklist_incomplete"` — a row, lens or finding is unevaluated; no handoff was written. The output names each one in `unevaluated`. Evaluate them and run `finalize` again. A review cannot be handed back, or passed, with a row left blank.
- A failed handoff with `reasonCode: "review_findings"` and `next: "implement"` — at least one finding is `blocking`, `major` or `minor`, or a row is `fail` or `partial`. The handoff and `.nmg-sdlc/verification/N-review.md` carry every finding. Print the `NMG_SDLC_HANDOFF:` line unchanged and stop: no validation runs.
- A passed handoff with `next: "verify"` — the review has no finding above `info`. The record and the handoff list in `mockedEntryPoints` each criterion whose tests mock the path under test, and the summary names them and any `info` note. Under `/sdlc-execute`, print the `NMG_SDLC_HANDOFF:` line unchanged and stop; the controller queues the branch and dispatches the gate. Standalone, continue with phase 2.

## Phase 2: Gate

Run this phase only after a passed review of the current source. Do not repeat the review.

When `steering/manifest.json` declares the top-level `selection`, first resolve the change selection, so any work it names (such as a project snippet's live surface exercises) can run before the gate:

```bash
node "<plugin-root>/scripts/sdlc-verify-steering.mjs" --project . --issue N --spec specs/N-SLUG --base main --mode select [--controller-run-id R]
```

It prints `{ ok: true, selection }` and stores the selection; the gate below reuses it while the head, the change, the steering and the prompt are unchanged, so headless Claude is asked once per gate run. Then run the gate:

```bash
node "<plugin-root>/scripts/sdlc-verify-steering.mjs" --project . --issue N --spec specs/N-SLUG --base main [--controller-run-id R]
```

Read `.nmg-sdlc/verification/N.json`. The same runner is mandatory for interactive and execute verification. It runs the pre-merge validations (`--tier pre-merge`, the default):

- In a project whose validations declare no `tier`, every required validation runs, as before, and each result records `tier: null` and `selection: null`.
- In a project that declares tiers, the `change` tier runs and the `full` tier is recorded as skipped before merge; `/sdlc-verify-full` runs it on demand.
- With a top-level `selection`, one headless Claude call (the bundled `gate:selection` prompt plus project snippets routed to it, on the `steering/sdlc-models.json` `selection` model, default `haiku` at `xhigh`) answers `{ mode, tests, surfaces }` for the change. A `change`-tier `builtin.command` validation with `selection: true` runs its command with the selected tests appended to its `args`. A changed path matching `fallbackPaths`, a failed, timed-out or malformed call, or an `all` answer runs everything (`fallback_path`, `selection_failed`, `selection_all`). Each result records `tier` and `selection`: `{ provider, reason, fallbackPath, selectedCount }`; the artifact's top-level `selection` records the prompt provenance, model, effort, reason, tests, surfaces, `requiredSurfaces`, `guidanceSupplied` and `rejection`.
- A validation named in a surface's `validations` runs only when one of its surfaces is selected; otherwise it passes as `surface_not_selected`. Project providers receive `changedPaths` and `selection: { mode, reason, surfaces }`.
- The selection is checked deterministically. A changed path outside `docPaths` matching a surface's `sources` must have that surface selected (`selection_surface_missing`). An empty selection passes (`selection_empty`) only when every changed path matches `docPaths`; otherwise it is `selection_empty_code_change`. After the selected tests pass, the `steering/test-coverage.json` coverage command runs for them, and every changed executable (or non-blank) line of a reported path must be hit (`selection_uncovered`, recorded as `coverage: { changedLines, hitLines, uncovered }`). Every changed path must be accounted for by the coverage report, a selected test, a selected surface, `docPaths` or `fallbackPaths` (`selection_unaccounted`); a path the change deletes is accounted for, since nothing of it is left to cover. A rejection fails the affected validations and names the surfaces, lines or paths.
- A validation marked `heavy` waits for a slot in the host-wide heavy-job pool; the result records `heavy: { slot, waitedMs }`.

Use the `coverage` summary to distinguish zero declarations from missing evidence: `declared: 0`, `recorded: 0`, and `complete: true` is a complete gate with no project-specific validations, while `complete: false` means declared results are missing, duplicated, or unknown and caps overall status at `Incomplete`. A required `failed` result caps status at `Fail`; required `incomplete`, runtime/provider/config errors, crashes, explicit cancellation, confirmed process loss, malformed output, stale identities, or applicable provider self-skips cap it at `Incomplete`. `Pass` and `PR Evidence Pending` are forbidden unless coverage is complete and every applicable required validation has a terminal result.

Required local `builtin.command` validations run first; if any fail or are incomplete, later project providers are recorded as required `incomplete` with summary `deferred until required local validations pass`.

PR-only obligations: if present use the readiness rules from references (PR Evidence Pending allowed only when all local pass).

### Generate and persist the report

Include exactly one standalone `**Verification head**: <40-character current HEAD>` line for every newly generated report, including initial verification and mixed local/external failure.

Use references/report-format.md + checklists/report-template.md to build:
specs/N-SLUG/verification-report.md

With sections: executive summary, deterministic steering artifact and ceiling, AC checklist with evidence (from the review record, naming each criterion whose tests mock the path under test), architecture scores + findings (score each checklist area 1-5 from the lens results, average reported), test results with each validation's tier and selection, real smoke lifecycle evidence when required (repository.nmg-sdlc-smoke preserved), fixes, remaining issues, overall status (Pass | PR Evidence Pending | Partial | Fail | Incomplete)

Write the file using write tool or node cat.

Then:
```bash
gh issue comment N --body "$(cat specs/N-SLUG/verification-report.md | head -c 20000)"
```

### Finalize verification

The controller owns report publication and the verify handoff. Never write handoff JSON, commit, or push directly.

Run:

```bash
node "<plugin-root>/scripts/sdlc-finalize-verification.mjs" --issue N --spec specs/N-SLUG [--queue-gate] [--controller-run-id R]
```

Pass `--queue-gate` in the gate phase under `/sdlc-execute`; standalone verification omits it. With it, a gate that is not green, other than PR Evidence Pending, fails with `reasonCode: "queue_gate_failed"` instead of `verification_not_ready`.

A gate whose artifact records a selection `rejection` finalizes, with or without `--queue-gate`, as `reasonCode: "selection_escalation"`, `intervention: false`, `next: "verify"` and `escalation: { kind: "selection", reasonCode, uncovered, missingSurfaces, unaccounted }`. A selection gap is not a code defect: report it truthfully and do not edit source or steering to make it pass. `/sdlc-execute` presents it to its supervising session, and that session's redispatch guidance is appended to the rerun's selection prompt.

The finalizer requires complete passing manifest-registered results, exact source/steering/spec identity, and the current truthful Pass report. A failed push is reconciled by the actual clean commit and exact upstream head with no force and no one-use allowance. Reinvocation with an unchanged report-only publication acknowledges the same passing source-parent gate without another commit; a changed implementation head requires the full registered gate.

Print the controller's `NMG_SDLC_HANDOFF:` line unchanged. A passed handoff exists only after the exact Pass report and complete passing registered results are published at the source head and the branch is synchronized. Fail, Partial and Incomplete remain failed handoffs and route to implementation diagnosis. Under `/sdlc-execute` a failed gate (`queue_gate_failed`) takes the branch out of the merge queue, so the next entry proceeds. PR Evidence Pending requests draft evidence collection without ready or merge, then fresh final verification.

`spec_not_approved`, `verification_publish_failed`, lease failure, missing/unsafe report or artifact, and unavailable required steering evidence remain blockers. Never rewrite a handoff to bypass live scope, current registered evidence or publication identity. Every Fail/Partial/Incomplete or failed required local result returns to diagnosis and reruns the gate after the cause changes; never promote a pending or failed report to passed handoff without fresh green at the exact source head.

## Smoke Requirement

The registered `repository.nmg-sdlc-smoke` (and project.nmg-sdlc-smoke) is always-applicable when declared; require its real passing result (with local prerequisites green) for full-green verification. Diagnose provider failure and repair the cause; never replay unchanged smoke for attempt consumption.
