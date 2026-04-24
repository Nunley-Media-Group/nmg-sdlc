# Defect Report: Exercise Template Dry-Run Prefix Prevents Skill Recognition

**Issue**: #49
**Date**: 2026-02-25
**Status**: Draft
**Author**: Codex
**Severity**: High
**Related Spec**: `specs/feature-exercise-based-verification/`

---

## Reproduction

### Steps to Reproduce

1. Have a skill with `minimal Codex frontmatter` in its SKILL.md frontmatter (e.g., `open-pr`)
2. Run `/verify-code` on a change that includes that skill
3. Step 5c constructs the exercise prompt by prepending the dry-run prefix before the skill invocation: `"{dry-run-prefix}\n\n/{skill-name} {args}"`
4. The nested Codex session receives the prompt and does NOT recognize the `/{skill-name}` as a skill invocation
5. The model improvises instead of loading the SKILL.md instructions

### Environment

| Factor | Value |
|--------|-------|
| **OS / Platform** | Any (macOS, Linux, Windows) |
| **Version / Commit** | nmg-sdlc v1.27.0+ |
| **Browser / Runtime** | Codex CLI / Agent SDK |
| **Configuration** | Skill with `minimal Codex frontmatter` + GitHub-integrated (requires dry-run) |

### Frequency

Always — 100% reproducible when the skill has `minimal Codex frontmatter` and dry-run prefix is prepended.

---

## Expected vs Actual

| | Description |
|---|-------------|
| **Expected** | The nested Codex session recognizes the skill invocation and loads the SKILL.md instructions, while also respecting the dry-run instructions |
| **Actual** | The nested Codex session treats the entire prompt as a regular text request and improvises a response without loading the skill |

### Error Output

No error is raised — the model silently improvises instead of loading the skill. The exercise output will contain ad-hoc responses rather than the structured output the skill would produce.

---

## Acceptance Criteria

**IMPORTANT: Each criterion becomes a Gherkin BDD test scenario.**

### AC1: Dry-Run Skills with minimal Codex frontmatter Are Recognized

**Given** a skill with `minimal Codex frontmatter` in its frontmatter
**When** the exercise template generates a dry-run prompt for that skill
**Then** the skill invocation (`/{skill-name}`) appears at the start of the prompt
**And** dry-run instructions appear after the skill invocation, not before

### AC2: Dry-Run Instructions Are Still Applied

**Given** an exercise prompt with the skill invocation first and dry-run instructions appended
**When** the nested Codex session processes the prompt
**Then** the dry-run instructions are respected (no mutating `gh` commands executed)
**And** the skill produces its structured output (not improvised text)

### AC3: Non-minimal Codex frontmatter Skills Still Work

**Given** a skill WITHOUT `minimal Codex frontmatter` (e.g., `draft-issue`)
**When** the exercise template generates a dry-run prompt for that skill
**Then** the skill invocation is still recognized and loaded
**And** dry-run instructions are respected

---

## Functional Requirements

| ID | Requirement | Priority |
|----|-------------|----------|
| FR1 | The exercise prompt structure in `exercise-testing.md` step 5c must place the skill invocation at the start of the prompt, with dry-run instructions appended after | Must |
| FR2 | The dry-run instructions must be clearly marked (e.g., with "IMPORTANT:") so the model treats them as constraints, not as the primary task | Must |
| FR3 | The fix must not break exercise testing for skills that do NOT have `minimal Codex frontmatter` | Must |

---

## Out of Scope

- Changes to how Codex recognizes skill invocations (that's a Codex platform concern)
- Adding new exercise testing capabilities beyond fixing the prompt structure
- Modifying any skill's `minimal Codex frontmatter` frontmatter setting

---

## Change History

| Issue | Date | Summary |
|-------|------|---------|
| #49 | 2026-02-25 | Initial defect spec |

---

## Validation Checklist

Before moving to PLAN phase:

- [x] Reproduction steps are repeatable and specific
- [x] Expected vs actual behavior is clearly stated
- [x] Severity is assessed
- [x] Acceptance criteria use Given/When/Then format
- [x] At least one regression scenario is included (AC3)
- [x] Fix scope is minimal — no feature work mixed in
- [x] Out of scope is defined
