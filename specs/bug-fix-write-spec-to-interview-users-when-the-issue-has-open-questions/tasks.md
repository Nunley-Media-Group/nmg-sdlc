# Tasks: Fix write-spec to interview users when the issue has open questions

**Issue**: #94
**Date**: 2026-04-23
**Status**: Planning
**Author**: Rich Nunley

---

## Summary

| Task | Description | Status |
|------|-------------|--------|
| T001 | Apply the fix — author `references/interview.md` and update `SKILL.md` via `/skill-creator` | [ ] |
| T002 | Add regression test — Gherkin `@regression` scenarios covering the 7 ACs | [ ] |
| T003 | Verify no regressions — exercise `/write-spec` against a test project and run skill-inventory audit | [ ] |

---

### T001: Fix the Defect

**File(s)**:
- `skills/write-spec/SKILL.md` (Modify — insert new Phase 1 Process step and a reference pointer)
- `skills/write-spec/references/interview.md` (Create — new per-skill reference)

**Type**: Modify + Create
**Depends**: None
**Acceptance**:
- [ ] `skills/write-spec/references/interview.md` is created and describes:
  - Gap signals: non-empty `## Open Questions` section in the issue body; missing or Given/When/Then-malformed acceptance criteria; for bug-labelled issues, missing reproduction steps or missing expected-vs-actual.
  - Interactive-mode procedure: one `interactive prompt` per detected gap with free-text "Other" allowed; a documented per-run cap on questions; how to thread answers into the drafted spec (issue-body replacements / inline notes).
  - Unattended-mode bypass: `Glob('.codex/unattended-mode')` check at the top of the step; no `interactive prompt` call when the sentinel is present; the one-line divergence note required by `../../references/unattended-mode.md`.
  - Amendment-mode rule: detect gaps only in the new issue's body; never re-interview about already-approved spec content.
  - Classification-tailored probes: feature-scope / AC-clarity questions for non-bug issues; reproduction / expected-vs-actual / root-cause questions for bug-labelled issues.
  - Residual-question capture: any gap the user declines to answer (or any gap past the cap) is recorded in the spec's `## Open Questions` section verbatim.
- [ ] `skills/write-spec/SKILL.md` Phase 1 / Process gains a new numbered step (inserted as step 4; existing 4–6 renumbered to 5–7) that fires the gap-detection + interview with exactly one pointer of the form: `` Read `references/interview.md` when Phase 1 has read the issue and steering docs and is about to enter amendment or creation mode. ``
- [ ] The pointer grammar matches `steering/structure.md` § "Reference pointer grammar" (shape, `when` conjunction, per-skill path).
- [ ] Both files are authored through `/skill-creator` per the `steering/tech.md` authoring invariant (no direct hand-edits to skill-bundled files).
- [ ] Root cause from `design.md` is addressed: the skill now has a pre-draft gap-resolution step in both amendment and creation branches; the review gate's `**Open Questions**` display field is **not** modified (out-of-scope guard).
- [ ] No unrelated changes are in the diff — no edits to other skills, other references, templates, steering docs, or scripts.

**Notes**: Follow the fix strategy from `design.md`. The exact pointer wording is load-bearing — the skill-inventory audit and the reader both depend on it. Keep interview prose concise; detailed examples belong in the reference, not in `SKILL.md`.

### T002: Add Regression Test

**File(s)**:
- `specs/bug-fix-write-spec-to-interview-users-when-the-issue-has-open-questions/feature.gherkin` (Create)

**Type**: Create
**Depends**: T001
**Acceptance**:
- [ ] Every AC from `requirements.md` maps to exactly one Gherkin scenario.
- [ ] All scenarios are tagged `@regression` (per `references/defect-variant.md` Phase 3 contract).
- [ ] The feature-level tag `@regression` is present and the feature description states what was broken and what the fix is.
- [ ] Scenarios cover:
  - Interactive + issue has Open Questions → interview fires, answers shape draft (AC1).
  - Interactive + ACs malformed → targeted clarifying questions fire (AC2).
  - Interactive + well-specified issue → interview is skipped, no `interactive prompt` call (AC3).
  - Unattended mode + gaps present → bypass with divergence log line, no `interactive prompt` (AC4).
  - Amendment mode + new-issue gaps → interview fires for the new issue only (AC5).
  - Bug-labelled issue with repro/root-cause gaps → defect-specific probes fire (AC6).
  - Gap detection bounded and documented; residual items captured in `## Open Questions` (AC7).
- [ ] Scenarios use concrete example data (real issue numbers, real section names), not `foo`/`bar` placeholders.
- [ ] The file is valid Gherkin syntax (no unclosed scenarios, consistent indentation).
- [ ] In exercise testing (T003), the scenarios validate against the fixed `/write-spec` behavior — i.e., asserting that the fix catches each regression case.

**Notes**: Reference `templates/feature.gherkin` § "Defect Regression Scenarios" for the schema. Exercise tests are the verification substrate for skill-level behavior per `steering/tech.md` — write the scenarios so they can be driven by an Agent SDK `canUseTool` callback or by a dry-run `codex exec --cd` session.

### T003: Verify No Regressions

**File(s)**: [no file changes — verification only]

**Type**: Verify
**Depends**: T001, T002
**Acceptance**:
- [ ] `/write-spec` is exercised against a disposable test project (per `steering/tech.md` → "Test Project Pattern") with four input issues:
  1. A feature issue with a non-empty `## Open Questions` section → interview fires, answers appear in the draft.
  2. A feature issue with well-formed ACs and no open questions → interview skipped; no `interactive prompt` call.
  3. A bug issue with missing reproduction steps → defect-specific probes fire.
  4. Any issue with the `.codex/unattended-mode` sentinel present → interview bypassed; divergence note emitted.
- [ ] The existing review gates (Phase 1 / 2 / 3 Approve–Revise menus) still fire exactly as before in interactive mode — no duplication, no skipped gates.
- [ ] `node scripts/skill-inventory-audit.mjs --check` exits with code 0 (the new reference is registered correctly; the pointer grammar is valid).
- [ ] `cd scripts && npm test` passes — the runner's unit tests are unaffected.
- [ ] A downstream smoke: `/write-code` against a spec produced by the fixed `/write-spec` reads `requirements.md` without schema complaints (output contract unchanged).
- [ ] No side effects in related code paths per the Blast Radius section of `design.md` (no other skills, templates, or steering docs touched; no hidden behavior change in unattended mode).

**Notes**: For the exercise run that involves `interactive prompt`, use the Codex Agent SDK `canUseTool` callback or a Promptfoo eval with `ask_user_question: first_option` per `steering/tech.md` → "Automated Exercise Testing via Agent SDK". For the unattended scenario, set the sentinel file before invoking and assert the divergence note appears in stdout.

---

## Validation Checklist

Before moving to IMPLEMENT phase:

- [x] Tasks are focused on the fix — no feature work
- [x] Regression test is included (T002)
- [x] Each task has verifiable acceptance criteria
- [x] No scope creep beyond the defect (review gate UI, draft-issue, sentinel mechanics all excluded)
- [x] File paths reference actual project structure (per `steering/structure.md`)

---

## Change History

| Issue | Date | Summary |
|-------|------|---------|
| #94 | 2026-04-23 | Initial defect tasks |
