# Tasks: Replace execute simplify with two branch-to-main review and fix panes

**Issue**: #208
**Date**: 2026-08-22
**Status**: Approved
**Author**: NMG
**Related Spec**: specs/194-move-start-and-execute-orchestration-into-controllers-behind-sibling-workers/

---

## Summary

| Phase | Tasks | Status |
|-------|-------|--------|
| Pipeline | 2 | [ ] |
| Workflows | 3 | [ ] |
| Surface | 2 | [ ] |
| Verification | 1 | [ ] |
| **Total** | 8 | |

---
### T001: Extend execute step machine

**File(s)**: `scripts/sdlc-execute.mjs`
**Type**: Modify
**Depends**: None
**Acceptance**:
- [ ] `VALID_STEPS` and `nextStep` order are `start`, `implement`, `review1`, `fix1`, `review2`, `fix2`, `verify`, `deliver`
- [ ] `STEP_SKILL` maps `review1`/`review2` to `review-main` and `fix1`/`fix2` to `apply-review`
- [ ] `implement: ['simplify']` is removed; deliver extras are left as found
- [ ] Worker-prompt usage lists `start|implement|review1|fix1|review2|fix2|verify|deliver`
- [ ] Handoff validation accepts the new step names and rejects unknown steps

### T002: Add review-main controller

**File(s)**: `scripts/sdlc-review-main.mjs`, `scripts/__tests__/sdlc-review-main.test.mjs`
**Type**: Create
**Depends**: T001
**Acceptance**:
- [ ] Exports `runReviewMain({ issue, step, cwd, run, fs, result })`
- [ ] CLI is `--issue N --step review1|review2 [--result review_failed]`
- [ ] Invalid CLI prints the exact usage, exits 2, writes no handoff
- [ ] Missing artifact or `--result review_failed` writes `review_failed` intervention handoff and exits 1
- [ ] Existing artifact, including findings, writes passed handoff with `next` `fix1` or `fix2` and never fails on findings
- [ ] Empty artifact is rewritten to `No findings.\n`
- [ ] Tests inject `run`/`fs`; no live git

### T003: Add apply-review controller

**File(s)**: `scripts/sdlc-apply-review.mjs`, `scripts/__tests__/sdlc-apply-review.test.mjs`
**Type**: Create
**Depends**: T002
**Acceptance**:
- [ ] Exports `runApplyReview({ issue, step, cwd, run, fs, applied })`
- [ ] CLI is `--issue N --step fix1|fix2 [--applied]`
- [ ] Invalid CLI prints the exact usage, exits 2, writes no handoff
- [ ] Missing artifact writes `review_artifact_missing`; `No findings.` / blank writes passed with zero git
- [ ] Findings without `--applied` print one `NMG_SDLC_APPLY_REVIEW:` packet and exit 3 with no handoff
- [ ] `--applied` plus empty porcelain writes passed with no commit and no push
- [ ] `--applied` plus dirty porcelain commits `fix: apply review1 findings for #<N>` or `fix: apply review2 findings for #<N>`, pushes without force, skips `.omp/` paths
- [ ] Git failure writes `apply_review_failed`; tests inject `run`/`fs`

### T004: Compact review and apply workflows around controllers

**File(s)**: `workflows/review-main/WORKFLOW.md`, `workflows/apply-review/WORKFLOW.md`
**Type**: Create
**Depends**: T002, T003
**Acceptance**:
- [ ] Bodies match the compact texts in design.md
- [ ] Workflows never tell the model to write handoff JSON, `git commit`, or `git push`
- [ ] Frontmatter names are `review-main` and `apply-review`; not registered as public `/sdlc-*` commands
- [ ] `workerPrompt({ step: 'review1', issue: 42 })` contains `# Review Main` and `sdlc-review-main.mjs`
- [ ] `workerPrompt({ step: 'fix1', issue: 42 })` contains `# Apply Review` and `sdlc-apply-review.mjs`
- [ ] `skill://skill-creator` is resolved and followed before these bundled creates

### T005: Stop implement from running simplify

**File(s)**: `workflows/write-code/WORKFLOW.md`, `agents/spec-implementer.md`
**Type**: Modify
**Depends**: T001
**Acceptance**:
- [ ] Write-code no longer has `## Bundle Simplify In-Process` and no longer mentions bundling simplify
- [ ] Implement success handoff `next` is `review1`
- [ ] Spec-implementer description is `Implement approved spec tasks.` and has no inlined simplify step
- [ ] `workerPrompt({ step: 'implement', issue: 42 })` does not contain `# Simplify`

### T006: Delete live simplify workflow and retarget inventory

**File(s)**: `workflows/simplify/`, `scripts/verify-current-specs.mjs`, `references/rewrite-contract.json`, `references/rewrite-contract.md`
**Type**: Delete | Modify
**Depends**: T005
**Acceptance**:
- [ ] `workflows/simplify/` is absent
- [ ] `WORKFLOW_CAPABILITY` has no `simplify` row and maps `review-main` and `apply-review` to `execute`
- [ ] Capability count remains 15; `simplify` capability `sources` is `specs/106-simplify-skill/`
- [ ] `specs/106-simplify-skill/` remains on disk; `CAPABILITY_SPEC` still maps `simplify` to 106
- [ ] `node scripts/verify-current-specs.mjs` exits 0

### T007: Remove simplify from public and steering surfaces

**File(s)**: `README.md`, `steering/product.md`, `scripts/__tests__/interactive-plan-contract.test.mjs`, `scripts/__tests__/exercise-contribution-guide.test.mjs`, `scripts/skill-inventory.baseline.json`
**Type**: Modify
**Depends**: T006
**Acceptance**:
- [ ] README execute prose and command table do not list simplify as an execute or write-code stage
- [ ] Product Must Have / pipeline lines no longer require bundled simplify on write-code
- [ ] Interactive plan AUTOMATED list is start-issue, write-code, review-main, apply-review, verify-code, open-pr, address-pr-comments
- [ ] Contribution-guide expected strings no longer say `code -> simplify -> verify`
- [ ] `node scripts/skill-inventory-audit.mjs --check` exits 0

### T008: Cover the new queue and controller paths

**File(s)**: `scripts/__tests__/sdlc-execute.test.mjs`, `scripts/__tests__/rendered-prompt-bytes.test.mjs`, `scripts/__tests__/simplify-contract.test.mjs`, `scripts/__tests__/sdlc-review-main.test.mjs`, `scripts/__tests__/sdlc-apply-review.test.mjs`
**Type**: Modify
**Depends**: T001-T007
**Acceptance**:
- [ ] `nextStep(['start', 'implement'])` is `review1`; after both fix steps the next step is `verify`
- [ ] Failed or intervention `review1` does not launch `fix1`, `review2`, `fix2`, `verify`, or `deliver`
- [ ] No-findings apply-review path asserts zero `git commit` and zero `git push` with a passed handoff
- [ ] Findings without `--applied` exit 3 and write no handoff
- [ ] Implement prompt excludes `# Simplify`; review prompts contain `# Review Main`; fix prompts contain `# Apply Review`
- [ ] New/changed worker prompt ceilings are measured UTF-8 size + 256; unrelated automated-body ceilings are unchanged
- [ ] Former simplify-contract file asserts `workflows/simplify/` is gone
- [ ] Focused execute, review-main, apply-review, prompt-byte, interactive-plan, contribution-guide, current-specs, and plugin-surface tests exit 0


---

## Change History

| Issue | Date | Summary |
|-------|------|---------|
| #208 | 2026-08-22 | Initial feature spec |
