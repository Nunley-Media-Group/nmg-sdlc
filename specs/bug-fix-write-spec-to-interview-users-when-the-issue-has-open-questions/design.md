# Root Cause Analysis: Fix write-spec to interview users when the issue has open questions

**Issue**: #94
**Date**: 2026-04-23
**Status**: Draft
**Author**: Rich Nunley

---

## Root Cause

The `/write-spec` skill's Phase 1 (SPECIFY) workflow has no step between *reading the issue* and *writing `requirements.md`* that inspects the issue body for unresolved gaps. Phase 1 Process steps 1–6 in `skills/write-spec/SKILL.md` proceed directly from `gh issue view` (steps 1–3) into amendment-mode-or-creation-mode drafting (steps 4–5). The amendment and creation branches both trust that whatever the issue body contains is sufficient to bootstrap a spec.

The `**Open Questions**` field that appears in the Phase 1 review gate template is purely a render of pre-existing content (`references/review-gates.md` § Phase 1 — "`Open Questions: [list any, or 'None']`"). It is never consumed by logic — no detection, no branching, no `interactive prompt`. The gate reports the field for a human reviewer to notice, but by then the draft is already written.

By contrast, `/draft-issue` runs a full adaptive-depth interview (Steps 4–5 of its SKILL.md) *before* producing output. `/write-spec` was specified as a transform that assumes a well-groomed input, and no equivalent gap-detection/interview pattern was ported in — hence the asymmetry.

### Affected Code

| File | Lines | Role |
|------|-------|------|
| `skills/write-spec/SKILL.md` | Phase 1 / Process (steps 1–6) | Sequences the Phase 1 workflow; no interview step exists here. |
| `skills/write-spec/references/review-gates.md` | § Phase 1 — Requirements Summary template | Renders `**Open Questions**` as display only; the gate has no action that resolves unresolved items before the spec is written. |

### Triggering Conditions

- A GitHub issue contains an `## Open Questions` section with at least one unresolved item, **or** its Acceptance Criteria are missing / structurally malformed (no Given/When/Then).
- `/write-spec` runs in interactive mode (i.e., `.codex/unattended-mode` is absent).
- The workflow reaches Phase 1 — which is unconditional on every `/write-spec` run.

These conditions weren't caught before because the Phase 1 contract was framed as "bootstrap ACs from the issue body" rather than "reach a confident spec before drafting," and review gates were assumed to be the corrective mechanism. In practice, reviewers see the issues too late — after a speculative draft is on disk.

---

## Fix Strategy

### Approach

Introduce a new Phase 1 *Gap Detection & Interview* step that fires after reading the issue + steering docs and **before** the amendment/creation branches, in both branches. The step is gated on interactive mode (skipped when `.codex/unattended-mode` exists, per `references/unattended-mode.md` pre-approved pattern). The detection rules and question caps are consolidated in a new per-skill reference (`skills/write-spec/references/interview.md`), and `SKILL.md` gets a single pointer to it plus a numbered workflow step. This keeps the main skill file close to the structure.md "trigger + workflow skeleton" shape while isolating the interview logic where it can be maintained independently.

The review gate's `**Open Questions**` display field is left untouched — the new interview runs pre-write, not at the gate.

The implementation must be driven through `/skill-creator` per the `steering/tech.md` authoring invariant for skill-bundled files — this applies to both the new reference file and the edit to `SKILL.md`.

### Changes

| File | Change | Rationale |
|------|--------|-----------|
| `skills/write-spec/SKILL.md` | Add a new Phase 1 Process step (inserted as step 4, shifting current 4–6 to 5–7) that fires `Gap Detection & Interview` with a pointer of the form `` Read `references/interview.md` when Phase 1 has read the issue and steering docs and is about to enter amendment or creation mode. `` | Keeps SKILL.md focused on workflow skeleton; pointer grammar complies with `steering/structure.md` § "Reference pointer grammar". |
| `skills/write-spec/references/interview.md` | New per-skill reference describing: (a) gap signals (non-empty Open Questions, missing/malformed ACs, defect-specific missing fields for bug-labelled issues); (b) how to run the interview in interactive mode (`interactive prompt` one question per gap, bounded cap, free-text via "Other"); (c) the unattended-mode bypass with the required one-line divergence note; (d) amendment-mode rules (new-issue gaps only); (e) classification-tailored probes (feature vs. defect); (f) how to thread answers into the draft and how to capture any residual unresolved items in the spec's `## Open Questions` section. | Places the detailed procedure where per-skill rarely-fired variant content belongs (per `steering/structure.md` layer table); keeps SKILL.md short; centralizes the detection rules so future enhancements touch one file. |

No other files change. Templates (`templates/requirements.md`, etc.), existing references (`discovery.md`, `amendment-mode.md`, `defect-variant.md`, `review-gates.md`), steering docs, and the SDLC runner are all unaffected.

### Blast Radius

- **Direct impact**: `skills/write-spec/SKILL.md` (one new numbered step + one pointer line), new file `skills/write-spec/references/interview.md`.
- **Indirect impact**:
  - `scripts/skill-inventory-audit.mjs` will validate that the new reference has the mandated pointer grammar (`Read` ... `when` ...). A malformed pointer would fail the audit — the fix must use the exact grammar.
  - `/verify-code`'s "Skill exercise test" gate will require loading the modified plugin and invoking `/write-spec` against a test project to confirm the interview fires, skips, and bypasses correctly.
  - Downstream consumers of `requirements.md` (`/write-code`, `/verify-code`, `/run-retro`) read the file's content but not its drafting process — they are unaffected as long as the output schema (frontmatter, ACs, FRs, Open Questions section) remains the same.
- **Risk level**: Low. The change is additive: a new pre-existing path (interactive with gaps) becomes "interview first, then draft"; all other paths (no gaps, unattended, amendment without new gaps) are unchanged. No existing spec on disk is invalidated.

---

## Regression Risk

| Risk | Likelihood | Mitigation |
|------|------------|------------|
| Interview fires on a well-specified issue and creates unnecessary friction. | Medium | AC3 explicitly requires the no-gap path to skip without `interactive prompt`. The regression test loads a well-specified issue and asserts zero `interactive prompt` calls from the interview step. |
| Unattended runs accidentally call `interactive prompt` and hang the SDLC runner. | Low | Gap-detection logic in `interview.md` mandates a `Glob('.codex/unattended-mode')` check at the top of the step, following the pre-approved-gate pattern in `references/unattended-mode.md`. A regression scenario exercises the skill with the sentinel present. |
| Amendment mode re-interviews about already-approved spec content. | Low-Medium | `interview.md` restricts amendment-mode gap detection to the *new issue's* body only — it never re-reads the existing `requirements.md` for gaps. AC5 covers this. |
| Bug-labelled issues get feature-scope questions (noise, not signal). | Medium | Classification-tailored probes (FR7) — the reference explicitly branches on `bug` label detection already present in Phase 1, reusing the same signal to select the question set. |
| The bounded question cap is set too low, producing shallow specs. | Low | The cap is documented in `interview.md` with a rationale; AC7 permits the skill to record residual unresolved items in the spec's `## Open Questions` section so reviewers still see them. The cap is a soft limit, not a silent truncation. |
| Pointer grammar drifts from `structure.md` § "Reference pointer grammar" and the inventory audit fails. | Low | Use the exact `` Read `references/interview.md` when {condition}. `` shape with `when` as the conjunction; the existing pointers in SKILL.md are the template. |

---

## Alternatives Considered

| Option | Description | Why Not Selected |
|--------|-------------|------------------|
| Inline the interview prose directly in `SKILL.md` Phase 1 | Add the detection rules, question mechanics, and classification branching as numbered sub-steps inside Phase 1 Process. | Bloats SKILL.md beyond its "workflow skeleton" responsibility per `steering/structure.md`. Future enhancements (e.g., a new gap type) would thicken the main skill file instead of being confined to a variant reference. |
| Turn the review gate's Open Questions field into an interactive step at gate time (post-draft) | Extend `review-gates.md` Phase 1 so unresolved items trigger `interactive prompt` *after* the draft lands, then revise the draft. | Out of scope per the issue ("Changing the Phase 1 review gate UI or the `**Open Questions**` display field" is excluded). Also less useful — a reviewer still sees speculative content shaped by the gap, whereas pre-write interviewing shapes the draft correctly the first time. |
| Port `/draft-issue`'s full adaptive-depth interview (`interview-depth.md`) | Reuse the three-signal heuristic (`filesFound`, `componentsInvolved`, `descriptionVagueness`) and the depth-override prompt. | Explicitly out of scope per the issue — "a lighter, gap-detection-driven approach is sufficient." Adaptive depth is justified for issue creation where the input is free-form; `/write-spec` operates on a curated issue and only needs to plug specific gaps. |

---

## Validation Checklist

Before moving to TASKS phase:

- [x] Root cause is identified with specific code references (SKILL.md Phase 1 steps 1–6; review-gates.md Phase 1 template)
- [x] Fix is minimal — no unrelated refactoring; adds one step and one reference file; leaves templates, gates, and other skills untouched
- [x] Blast radius is assessed (direct: 2 files; indirect: inventory audit, exercise test, no downstream schema change)
- [x] Regression risks are documented with mitigations (6 rows covering the main failure modes)
- [x] Fix follows existing project patterns: skill-creator authoring rule (`steering/tech.md`); reference pointer grammar (`steering/structure.md`); unattended-mode pre-approved gate pattern (`references/unattended-mode.md`); per-skill-references placement per layer table.

---

## Change History

| Issue | Date | Summary |
|-------|------|---------|
| #94 | 2026-04-23 | Initial defect design |
