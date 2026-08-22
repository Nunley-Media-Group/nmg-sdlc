# Design: Replace execute simplify with two branch-to-main review and fix panes

**Issue**: #208
**Date**: 2026-08-22
**Status**: Approved
**Author**: NMG
**Related Spec**: specs/194-move-start-and-execute-orchestration-into-controllers-behind-sibling-workers/

---

## Overview

Execute grows four first-class steps between implement and verify. Implement stays `s<N>-implement` running only write-code, but it must conventionally commit and push all implementation changes before its passed handoff. For each review worker, `runExecute` submits `/review` directly to the already-running host OMP TUI, selects PR-style review and literal `main` through Herdr key input, waits for the review response, then sends the compact persistence workflow to the same worker. Each fix worker first runs `scripts/sdlc-apply-review.mjs`; a model applies finding text only when that controller exits 3. Simplify is deleted from the live plugin surface.

`runExecute` remains the only pane launcher. It never spawns a nested OMP command and never synthesizes a passed handoff. Handoff JSON, no-findings short-circuit, commit subject, and push are controller-owned, same pattern as `runDeliver`. No new public `/sdlc-*` command. No execute-pane product edits.

## Architecture

```
s<N>-implement   write-code only → N-implement.json next=review1
s<N>-review1     interactive host /review (PR-style, main) → persist artifact → sdlc-review-main.mjs → N-review1.json next=fix1
s<N>-fix1        sdlc-apply-review.mjs [exit 3 → apply edits → --applied] → N-fix1.json next=review2
s<N>-review2     interactive host /review (PR-style, main) → persist artifact → sdlc-review-main.mjs → N-review2.json next=fix2
s<N>-fix2        sdlc-apply-review.mjs [exit 3 → apply edits → --applied] → N-fix2.json next=verify
s<N>-verify      verify-code
```

Split, `herdr agent start s<N>-<step> --kind omp`, `herdr agent prompt --wait`, stalled-prompt one Enter, `validateHandoff`, close on passed non-intervention idle/done, keep-open + `herdr notification show "nmg-sdlc stopped"` otherwise: unchanged from `runExecute`. Resume parses `herdr agent get` state from `result.agent.agent_status` and `result.agent.agentStatus` in addition to existing `state` shapes. A matching retained worker is safe to close only after its handoff validates as passed and non-intervention.

## Step machine

In `scripts/sdlc-execute.mjs` set both `VALID_STEPS` and `nextStep` order to:


`['start', 'implement', 'review1', 'fix1', 'review2', 'fix2', 'verify', 'deliver']`

`STEP_SKILL` maps `review1`/`review2` to `review-main` and `fix1`/`fix2` to `apply-review`. Remove `implement: ['simplify']`. If `STEP_EXTRA_WORKFLOWS.deliver` is still `['address-pr-comments']`, leave it. If no extras remain, delete `STEP_EXTRA_WORKFLOWS` and the extras concatenation in `workerPrompt`.

Worker-prompt CLI usage becomes exactly:

`Usage: node sdlc-execute.mjs worker-prompt --step <start|implement|review1|fix1|review2|fix2|verify|deliver> --issue N`

Handoff `step` must be in `VALID_STEPS`. Do not add statuses. Schema version stays 1.

### Interactive host review

For `review1` and `review2`, do not initially send `workerPrompt`. Submit the exact prompt `/review` to the host OMP agent. OMP presents `Review Mode`; the first choice in a fresh worker is `1. Review against a base branch (PR Style)`. Read the exact branch order with `git branch -a --format=%(refname:short)` and require an exact local `main` entry. Send only Enter to choose PR-style mode. Poll the worker's detection output until it contains the distinct `Select base branch to compare against` title; fail closed if that transition is not observed. Only then, in a second `agentSendKeys` call, send the required Down keys to the `main` row followed by Enter. Wait for the agent to enter `working`, then for it to settle. Never burst answers for both asynchronous menus in one call.

After the host review settles, send `workerPrompt` to the same worker. The review-main workflow must say that `/review` already ran and must persist the immediately preceding assistant response; it must never tell the model to invoke `omp`, `/review`, or another nested session. If the interactive review cannot be selected or settled, keep the worker pane open and stop with `review_failed`; do not create a passed handoff.

### Implement publication boundary

The write-code workflow stages every changed path except `.omp/`, creates one conventional implementation commit, and pushes the current issue branch before writing a passed implement handoff. A clean tree is accepted only when the branch commit is already published. Commit or push failure produces `status: failed`, `intervention: true`, `reasonCode: implementation_failed`, `next: null`. This makes `main...HEAD` review meaningful and prevents `review1` from observing uncommitted work.


## Review controller

Create `scripts/sdlc-review-main.mjs` (no equivalent exists). Export:

```js
export function runReviewMain({ issue, step, cwd, run, fs, result })
```

`run(command, args, options?)` returns `{ status, stdout, stderr }` and is the only git invocation. Defaults use `spawnSync` with UTF-8 and the supplied root. Tests inject `run`/`fs`.

CLI: `node scripts/sdlc-review-main.mjs --issue N --step review1|review2 [--result review_failed]`

N accepts `N` or `#N` matching `^#?([1-9]\d*)$`. Unknown, missing, or conflicting arguments print `Usage: node scripts/sdlc-review-main.mjs --issue N --step review1|review2 [--result review_failed]`, exit 2, write no handoff.

Exit 0 passed handoff, 1 failed/intervention handoff, 2 invalid CLI.

Sequence:

1. Require `step` is `review1` or `review2`. Else usage, exit 2.
2. If `result === 'review_failed'`, write failed handoff `reasonCode: review_failed`, `intervention: true`, `next: null`, print `NMG_SDLC_HANDOFF: .omp/sdlc/handoffs/<N>-<step>.json`, exit 1.
3. Artifact path `.omp/sdlc/reviews/<N>-<step>.md`. Missing → same `review_failed` handoff, exit 1.
4. If file trim is empty, rewrite body to exactly `No findings.\n`.
5. Write passed handoff: schema version 1, `status: passed`, `intervention: false`, `reasonCode: null`, `artifacts: [".omp/sdlc/reviews/<N>-<step>.md"]`, `next: "fix1"` or `"fix2"`. Print the handoff marker. Exit 0.

Findings never fail this controller. The model does not write handoff JSON.

## Apply-review controller

Create `scripts/sdlc-apply-review.mjs` (no equivalent exists). Export:

```js
export function runApplyReview({ issue, step, cwd, run, fs, applied })
```

CLI: `node scripts/sdlc-apply-review.mjs --issue N --step fix1|fix2 [--applied]`

Invalid CLI prints `Usage: node scripts/sdlc-apply-review.mjs --issue N --step fix1|fix2 [--applied]`, exit 2, write no handoff.

Exit 0 passed, 1 failed, 2 usage, 3 apply required.

Preceding review is `review1` when step is `fix1`, else `review2`. Artifact `.omp/sdlc/reviews/<N>-<preceding>.md`. `next` is `review2` from `fix1`, `verify` from `fix2`.

Sequence:

1. Missing artifact → failed `review_artifact_missing`, `intervention: true`, `next: null`, exit 1.
2. After trim, empty or exactly `No findings.` → no `git` calls, passed handoff, exit 0.
3. Findings exist and `applied` is false → print one `NMG_SDLC_APPLY_REVIEW: ` line plus compact JSON `{ "schemaVersion": 1, "kind": "apply_review_required", "issue": N, "step": "fix1"|"fix2", "artifactPath": ".omp/sdlc/reviews/<N>-<preceding>.md", "handoffPath": ".omp/sdlc/handoffs/<N>-<step>.json" }`, write no handoff, exit 3.
4. `applied` true and `git status --porcelain` empty → no commit, no push, passed handoff, exit 0.
5. `applied` true and porcelain non-empty → `git add` every porcelain path except anything under `.omp/`; commit subject exactly `fix: apply review1 findings for #<N>` or `fix: apply review2 findings for #<N>`; `git push` with no force. Success → passed handoff, exit 0. Any git failure → `apply_review_failed`, `intervention: true`, `next: null`, exit 1.

Without `--applied` the controller never commits or pushes.

## Compact review-main workflow

Create `workflows/review-main/WORKFLOW.md`. Frontmatter `name: review-main`. Exact body after frontmatter:

```markdown
# Review Main

Never call `ask`. Do not write handoff JSON, commit, or push.

1. The host OMP `/review` has already run interactively in this worker against literal `main`. Do not invoke `/review`, `omp`, or a nested agent.
2. Write `.omp/sdlc/reviews/<N>-<step>.md` from the immediately preceding assistant review response, where `<step>` is `review1` or `review2` from this worker. If that response reports no findings, the file body is exactly `No findings.` plus a trailing newline. Otherwise write the findings text only.
3. Run `node scripts/sdlc-review-main.mjs --issue N --step <step>`.
4. If the preceding host review did not complete, skip the artifact write and run `node scripts/sdlc-review-main.mjs --issue N --step <step> --result review_failed`.
5. Print the controller's `NMG_SDLC_HANDOFF:` line unchanged. Stop.
```

## Compact apply-review workflow

Create `workflows/apply-review/WORKFLOW.md`. Frontmatter `name: apply-review`. Exact body after frontmatter:

```markdown
# Apply Review

Never call `ask`. Do not write handoff JSON, commit, or push.

1. Run `node scripts/sdlc-apply-review.mjs --issue N --step <fix1|fix2>`.
2. Exit 0 or 1: stop. The controller already wrote the handoff.
3. Exit 3: apply only the findings in the packet `artifactPath`. No drive-by cleanup. Then rerun `node scripts/sdlc-apply-review.mjs --issue N --step <fix1|fix2> --applied`.
4. Exit 2: stop.
```


## Implement cutover

`workflows/write-code/WORKFLOW.md`: delete `## Bundle Simplify In-Process`. Description must not say it bundles simplify. Success handoff `next` is `review1`. Summary must not say the work was simplified. Printed next line is not `/sdlc-verify-code`.


Before `## Write Handoff`, add `## Commit and Push Implementation`: inspect porcelain, exclude `.omp/`, stage all implementation/spec/test/documentation paths, commit with a conventional subject describing #N, and run `git push`. If the tree is already clean, prove the current branch has an upstream at the same commit. Any add, commit, upstream, or push failure writes a failed intervention handoff and stops. Only then may the passed implement handoff be written.
`agents/spec-implementer.md`: description `Implement approved spec tasks.` Remove the “then follow the inlined simplify workflow” step. Keep skill-creator, no-ask, implement handoff, stop.

Delete the entire `workflows/simplify/` directory.

## Inventory and docs

`scripts/verify-current-specs.mjs`:

- Remove `['simplify', 'simplify']` from `WORKFLOW_CAPABILITY`.
- Add `['review-main', 'execute']` and `['apply-review', 'execute']`.
- Keep `CAPABILITY_SPEC` `['simplify', 106]` and keep `106-simplify-skill` in `CURRENT_SPEC_DIRECTORIES`.

`references/rewrite-contract.json` capability `simplify`: set `sources` to `["specs/106-simplify-skill/"]`. Keep 15 capabilities. Update the matching sources line in `references/rewrite-contract.md`.

`README.md`: execute stages become implementation (write-code), two host `/review` plus fix panes against `main`, verification, delivery. Remove the command-table row that lists simplify as internal to write-code. Queue text becomes start → implement → review1 → fix1 → review2 → fix2 → verify → deliver.

`steering/product.md`: Must Have “write-code + bundled simplify” becomes write-code then two host reviews with fix panes. Skill pipeline line `write-code → implementation covering approved tasks + bundled simplify` becomes write-code covering approved tasks only.

`scripts/__tests__/interactive-plan-contract.test.mjs` `AUTOMATED`: drop `simplify`; add `review-main` and `apply-review`.

Replace `scripts/__tests__/simplify-contract.test.mjs` with a contract that `workflows/simplify/` does not exist and `workerPrompt({ step: 'implement', issue: 42 })` does not contain `# Simplify`.

Update `scripts/__tests__/exercise-contribution-guide.test.mjs` strings that still say `code -> simplify -> verify` so they match the new pipeline.

`scripts/__tests__/rendered-prompt-bytes.test.mjs` and `scripts/__tests__/sdlc-execute.test.mjs`: implement prompt must not contain `# Simplify`. `nextStep(['start', 'implement'])` is `review1`. After `['start','implement','review1','fix1','review2','fix2']` it is `verify`. Add prompt-byte ceilings for `review1`, `fix1`, `review2`, `fix2` equal to measured post-change UTF-8 size + 256. Re-measure the implement ceiling the same way. Do not change unrelated `AUTOMATED_BODY_CEILINGS`.

If #195 already removed deliver `# Address PR Comments` extras, do not put them back. If they are still present, leave those assertions.

Regenerate `scripts/skill-inventory.baseline.json` only as required by `node scripts/skill-inventory-audit.mjs --check` after the workflow deletions/additions.

Resolve and read `skill://skill-creator` before editing any `workflows/**`, `references/**`, or `agents/*.md` file.

## Testing strategy

| Layer | Coverage |
|-------|----------|
| nextStep / VALID_STEPS | order includes the four new steps; implement no longer jumps to verify |
| workerPrompt | implement excludes `# Simplify`; review/fix prompts name the compact headings and controller CLIs |
| runExecute | after passed implement, launches `sN-review1` then `sN-fix1` then `sN-review2` then `sN-fix2` then verify; failed review1 does not start fix1 |
| runReviewMain | missing artifact / `--result review_failed` vs passed-with-findings |
| runApplyReview | no-findings zero git; exit 3 packet; `--applied` dirty commit/push; `--applied` clean no commit |
| surface | `workflows/simplify/` absent; README/command table have no simplify execute stage |
| prompt-byte | new/changed worker ceilings = measured + 256 |


---

## Change History

| Issue | Date | Summary |
|-------|------|---------|
| #208 | 2026-08-22 | Initial feature spec |
