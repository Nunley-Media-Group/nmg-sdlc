# Tasks: Add /address-pr-comments Skill

**Issues**: #86
**Date**: 2026-04-22
**Status**: Planning
**Author**: Rich Nunley

---

## Summary

This skill is a Claude Code plugin resource, not a stack-layered application. "Backend" is reinterpreted as skill-bundle authoring (`SKILL.md` + `references/`), and "Frontend" is omitted — the skill has no GUI, only a slash-command invocation. The phasing below matches the actual shape of the work. Every skill-bundled file (anything under `skills/address-pr-comments/`) MUST be authored through `/skill-creator` per the architectural invariant in `steering/tech.md` and `steering/structure.md` — the `/skill-creator` calls are explicit in each task.

| Phase | Tasks | Status |
|-------|-------|--------|
| Setup | 1 | [ ] |
| Skill Authoring (Backend) | 6 | [ ] |
| Integration | 3 | [ ] |
| Testing | 2 | [ ] |
| **Total** | **12** | |

---

## Phase 1: Setup

### T001: Add Automated-Reviewer Allow-List Config to steering/tech.md

**File(s)**: `steering/tech.md`
**Type**: Modify
**Depends**: None
**Acceptance**:
- [ ] `steering/tech.md` contains a new subsection (under **External Services** or a new **Automated Review** heading) that declares the reviewer-identity allow-list using the same shape as the existing **Version Bump Classification** table (a markdown-readable config block that the skill reads as data)
- [ ] The default value includes `bots: true` and `logins: ["claude[bot]"]`
- [ ] Editing the allow-list does NOT require a skill edit — the skill will read this section at runtime (per FR10 and Design § Configuration Surface)
- [ ] The section links back to `/address-pr-comments` so future maintainers see who consumes the config

**Notes**: Matches the pattern `/open-pr` uses to read the **Version Bump Classification** table from this same steering doc.

---

## Phase 2: Skill Authoring (Backend)

All files in this phase live under `skills/address-pr-comments/` and MUST be created via `/skill-creator`. The `/skill-creator` call for each task receives the design decisions and progressive-disclosure pointers listed in the task's Acceptance list. No hand-editing fallback.

### T002: Author skills/address-pr-comments/SKILL.md Skeleton

**File(s)**: `skills/address-pr-comments/SKILL.md`
**Type**: Create
**Depends**: T001
**Acceptance**:
- [ ] Authored via `/skill-creator` (no hand-authoring)
- [ ] YAML frontmatter: `name: address-pr-comments`, `description` matching the trigger-phrase pattern used by sibling SDLC skills, `argument-hint: [#issue-or-pr-number] [--max-rounds=N]`, `allowed-tools: Read, Glob, Grep, Task, Write, Edit, AskUserQuestion, Bash(gh:*), Bash(git:*), Bash(sleep:*)`, `model: opus`, `effort: high`
- [ ] Contains pointers (in the skill-creator reference-pointer grammar) to `../../references/legacy-layout-gate.md` and `../../references/unattended-mode.md` at workflow start
- [ ] Contains per-skill reference pointers to `references/fetch-threads.md`, `references/classification.md`, `references/fix-loop.md`, `references/escalation.md`, `references/polling.md` — each with its `when` triggering condition
- [ ] Numbered Workflow section lists Steps 1–5 matching Design § Component Diagram (preconditions → fetch → classify → fix/escalate → push → poll/loop)
- [ ] `## Integration with SDLC Workflow` section places the skill after `/open-pr #N` and before `/run-retro`
- [ ] File is ≤ 500 lines (per `steering/tech.md` → Skills best practices)

**Notes**: Seventh step in the SDLC pipeline. Description should explicitly disclaim "not for human-reviewer comments" and "does not create PRs" to prevent misfire.

### T003: Author references/fetch-threads.md

**File(s)**: `skills/address-pr-comments/references/fetch-threads.md`
**Type**: Create
**Depends**: T002
**Acceptance**:
- [ ] Authored via `/skill-creator`
- [ ] Contains the full `gh api graphql -f query=…` invocation shape for `repository(owner,name).pullRequest(number).reviewThreads(first:100) { nodes { id, isResolved, comments(first:50) { nodes { body, author{login, __typename}, path, line, diffHunk, databaseId } } } }`
- [ ] Describes the reviewer-identity filter: `author.__typename == "Bot"` OR `author.login` in the allow-list read from `steering/tech.md`
- [ ] Covers AC3 (review-clean exit) and AC4 (no-reviewer exit) with distinguishable output messages
- [ ] Documents the > 100 threads fallback (warn and process first page per Design § Performance Considerations)
- [ ] All `gh api` invocations use `-F` / `-f` flags — no string-interpolated shell commands

### T004: Author references/classification.md

**File(s)**: `skills/address-pr-comments/references/classification.md`
**Type**: Create
**Depends**: T002
**Acceptance**:
- [ ] Authored via `/skill-creator`
- [ ] Defines the three classifications (`clear-fix`, `ambiguous`, `disagreement`) with the exact criteria from requirements.md AC5
- [ ] Requires each classification to carry a one-sentence rationale
- [ ] Lists reviewer-specific heuristics: `reply:` suggestions and single-file pointers lean toward `clear-fix`; open-ended questions and preference comments lean toward `ambiguous`; comments that contradict spec'd behaviour lean toward `disagreement`
- [ ] Gives worked examples (3–5) of comments classified each way

### T005: Author references/fix-loop.md

**File(s)**: `skills/address-pr-comments/references/fix-loop.md`
**Type**: Create
**Depends**: T002
**Acceptance**:
- [ ] Authored via `/skill-creator`
- [ ] Describes the per-thread `clear-fix` flow: invoke `/write-code` in-session with synthetic task context (thread body, file path, line range, diff hunk); invoke `/verify-code` after `/write-code` returns
- [ ] Specifies the postcondition gate (AC7): commit SHA changed, fix commit touches the referenced file, `/verify-code` reports no regressions
- [ ] Specifies the commit-message convention: Conventional-Commits `fix: address review finding on {file}:{line}`
- [ ] Specifies the reply-and-resolve path: `gh api POST /repos/{owner}/{repo}/pulls/{pull_number}/comments/{comment_id}/replies` with a 1–3 sentence body naming the fix commit SHA, followed by GraphQL `resolveReviewThread` mutation
- [ ] Explicitly documents sub-skill escalation handling: any `ESCALATION:` output from `/write-code` or `/verify-code` maps to per-thread escalation (join the skipped-set, continue to next thread), NOT a hard exit
- [ ] Contains zero `--force`, `--force-with-lease`, `--force-if-includes` tokens

### T006: Author references/escalation.md

**File(s)**: `skills/address-pr-comments/references/escalation.md`
**Type**: Create
**Depends**: T002
**Acceptance**:
- [ ] Authored via `/skill-creator`
- [ ] Interactive branch: describes the `AskUserQuestion` shape with three options (`Fix it anyway`, `Skip — leave unresolved`, `Reply without fixing`) and routes each choice back to the appropriate flow (AC9)
- [ ] Unattended branch: specifies the exact escalation sentinel format `ESCALATION: address-pr-comments — pr=#{N} thread={node_id} classification={class} rationale={one-sentence}` (AC10, FR11)
- [ ] Both branches add the thread to the in-process skipped-set and continue to the next thread
- [ ] Mode detection follows `../../references/unattended-mode.md` (cached once at workflow start)

### T007: Author references/polling.md

**File(s)**: `skills/address-pr-comments/references/polling.md`
**Type**: Create
**Depends**: T002
**Acceptance**:
- [ ] Authored via `/skill-creator`
- [ ] Mirrors the polling constants from `skills/open-pr/references/ci-monitoring.md` exactly: 30s interval, 30min timeout, 60 polls max
- [ ] Describes the round loop: increment `roundCounter`, re-fetch threads (excluding in-process skipped-set), re-classify
- [ ] Specifies each exit path with a distinct stdout message: review-clean (zero, `PR #N is review-clean after {rounds} rounds.`); round cap (non-zero, `Round cap of {max_rounds} reached — exiting.`); re-review timeout (non-zero, `Re-review polling timeout reached after 30 min on round {N} — exiting so you can investigate.` per AC13); livelock guard (zero, `Round {N}: {M} threads escalated, 0 fixes applied — exiting unattended loop.` per AC15)
- [ ] Push step uses plain `git push` only; non-fast-forward rejection exits non-zero with a diagnostic; contains zero force-variant tokens (AC11, AC14, FR12)
- [ ] Distinguishes "reviewer ran but nothing unresolved" (AC3) from "reviewer never ran" (AC4) in the short-circuit message set

---

## Phase 3: Integration

### T008: Update README.md Pipeline Diagram

**File(s)**: `README.md`
**Type**: Modify
**Depends**: T002
**Acceptance**:
- [ ] README's pipeline diagram includes `/address-pr-comments #N` as a distinct step after `/open-pr #N` (AC16)
- [ ] Any trigger-phrase table or skill-inventory section in the README lists the new skill with its user-invocation and purpose
- [ ] Diff contains no unrelated edits

### T009: Update Every SDLC Skill's Integration Diagram

**File(s)**: `skills/draft-issue/SKILL.md`, `skills/start-issue/SKILL.md`, `skills/write-spec/SKILL.md`, `skills/write-code/SKILL.md`, `skills/verify-code/SKILL.md`, `skills/open-pr/SKILL.md`, `skills/run-retro/SKILL.md`, `skills/run-loop/SKILL.md`, `skills/onboard-project/SKILL.md`, `skills/upgrade-project/SKILL.md` (any SKILL.md whose `## Integration with SDLC Workflow` section renders the pipeline chain)
**Type**: Modify
**Depends**: T002
**Acceptance**:
- [ ] Each touched SKILL.md's `## Integration with SDLC Workflow` chain is extended with `→ /address-pr-comments #N` after `/open-pr #N`
- [ ] Authored via `/skill-creator` per the skill-bundled-file invariant (T009 touches existing skill bundles, so `/skill-creator` drives the edit)
- [ ] No other sections of the touched skills are modified
- [ ] `run-loop` SKILL.md's description — which currently enumerates the pipeline explicitly — is updated to include the new step

**Notes**: The descriptions of other skills (not the Integration section) may also reference "final step in the SDLC pipeline" language for `/open-pr`; if so, those must be updated to reflect that `/address-pr-comments` is now the terminal step. Audit the diff before committing.

### T010: Add [Unreleased] CHANGELOG Entry

**File(s)**: `CHANGELOG.md`
**Type**: Modify
**Depends**: T002
**Acceptance**:
- [ ] `[Unreleased]` section has an `### Added` bullet naming `/address-pr-comments` and briefly describing its role (closes the PR review loop by addressing automated-reviewer threads via `/write-code` + `/verify-code`)
- [ ] No existing `[Unreleased]` bullets are reordered or edited
- [ ] The entry follows the project's CHANGELOG tone (short, user-facing, conventional-commit flavoured)

---

## Phase 4: Testing

### T011: Create feature.gherkin

**File(s)**: `specs/feature-add-address-pr-comments-skill-to-close-the-pr-review-loop/feature.gherkin`
**Type**: Create
**Depends**: T002
**Acceptance**:
- [ ] One `Scenario:` per AC from requirements.md (16 scenarios for AC1–AC16)
- [ ] Valid Gherkin syntax
- [ ] Each scenario uses Given/When/Then matching the AC's wording
- [ ] Independent scenarios (no shared mutable state across scenarios)
- [ ] Background section captures the shared preconditions (open PR, matching branch, clean working tree) so individual scenarios stay focused on the variant behaviour

### T012: Exercise the Skill (Dry-Run Evaluation)

**File(s)**: No repo files modified; produces an evaluation note in the verification report
**Type**: Verify
**Depends**: T002, T003, T004, T005, T006, T007, T008, T009, T010, T011
**Acceptance**:
- [ ] Plugin loaded via `claude --plugin-dir ./` (per `steering/tech.md` → Plugin Exercise Testing)
- [ ] `/address-pr-comments` invoked on a test PR (either a disposable test repo with a real automated reviewer, or a dry-run evaluation where the skill's GraphQL + REST commands and slash-command invocations are captured and evaluated for correctness without firing)
- [ ] Evaluation confirms: preconditions check fires (AC1); short-circuit exits distinguish AC3 vs AC4 messages; classification produces rationale for each thread; `clear-fix` flow invokes `/write-code` and `/verify-code` in order; interactive and unattended branches diverge correctly; no `--force` token appears anywhere in the captured command stream
- [ ] Exercise outcome is recorded in `/verify-code`'s report so reviewers can audit it

**Notes**: Because this skill calls GitHub mutation APIs (`resolveReviewThread`, PR comment replies), default to dry-run evaluation unless a dedicated test PR on a disposable repo is available. Per `steering/tech.md` → Dry-Run Evaluation.

---

## Dependency Graph

```
T001 ──▶ T002 ──┬──▶ T003
                ├──▶ T004
                ├──▶ T005
                ├──▶ T006
                ├──▶ T007
                ├──▶ T008
                ├──▶ T009
                ├──▶ T010
                └──▶ T011 ──▶ T012
                           (T012 also depends on T003–T010)
```

Critical path: T001 → T002 → T007 → T012 (longest chain touches the round loop logic, which the exercise test must cover).

---

## Change History

| Issue | Date | Summary |
|-------|------|---------|
| #86 | 2026-04-22 | Initial feature spec |

---

## Validation Checklist

Before moving to IMPLEMENT phase:

- [x] Each task has a single responsibility
- [x] Dependencies are correctly mapped (linear fan-out from T002, fan-in to T012)
- [x] Tasks can be completed independently (given dependencies)
- [x] Acceptance criteria are verifiable (skill-creator usage, file presence, content greps, exercise output)
- [x] File paths reference actual project structure (per `steering/structure.md`)
- [x] Test tasks are included (T011 Gherkin + T012 exercise testing — the dogfooding equivalent of unit + integration)
- [x] No circular dependencies
- [x] Tasks are in logical execution order (steering config first, then skill bundle, then cross-cutting docs, then verification artifacts)
