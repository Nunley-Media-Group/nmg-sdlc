# Defect Report: Skill `model:` Frontmatter Causes Rate Limit Errors on GPT-5.5 1M

**Issues**: #111
**Date**: 2026-03-15
**Severity**: High
**Related Spec**: N/A

---

## Reproduction

1. Install the nmg-sdlc plugin in Codex
2. Set Codex model to GPT-5.5 with 1M context
3. Invoke any skill via `/skill-name` — get "API Error: Rate limit reached"
4. Ask Codex to do the same task without `/` — works fine

## Expected Behavior

Skills invoked via `/skill-name` should use the same model as the current session without triggering a model switch or separate rate limit bucket.

## Actual Behavior

Skills with a runner `model` config field trigger a model switch when invoked via `/`. This switch hits a different rate limit bucket, causing "API Error: Rate limit reached" even when the user hasn't exhausted their session model's limits. The error only occurs with `/` invocation — natural invocation (asking Codex to do the task) works fine because no model switch occurs.

## Root Cause

The runner `model` config field in SKILL.md overrides the session model when a skill is invoked via `/`. This model switch causes the API call to hit a different per-model rate limit bucket. A bug was fixed in Codex v2.1.70: "Fixed spurious 'Context limit reached' when invoking a skill with runner `model` config on a 1M-context session" — confirming the interaction between skill model overrides and rate limit handling was actively buggy.

The fix is to remove the `model:` field entirely from all skills so they inherit the session model and stay in the same rate limit bucket.

---

## Acceptance Criteria

### AC1: No skill has a model field
**Given** any skill in the nmg-sdlc plugin
**When** the skill's SKILL.md frontmatter is examined
**Then** no skill has a `model:` field — all skills inherit the session model

### AC2: Slash-command-only skills have minimal Codex frontmatter
**Given** skills only invoked via explicit slash commands (`/run-loop`, `/init-config`, `/run-retro`)
**When** the plugin is loaded
**Then** those skills have `minimal Codex frontmatter`

---

## Functional Requirements

| ID | Requirement |
|----|-------------|
| FR1 | Remove `model:` field from all SKILL.md files |
| FR2 | Add `minimal Codex frontmatter` to `run-loop` |
| FR3 | Add `minimal Codex frontmatter` to `init-config` |
| FR4 | Add `minimal Codex frontmatter` to `run-retro` |

---

## Change History

| Issue | Date | Summary |
|-------|------|---------|
| #111 | 2026-03-15 | Initial defect spec |
| #111 | 2026-03-15 | Updated: remove all `model:` fields to prevent model switch on `/` invocation |
