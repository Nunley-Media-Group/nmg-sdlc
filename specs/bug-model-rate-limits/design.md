# Root Cause Analysis: Skill `model:` Frontmatter Causes Rate Limit Errors

**Issues**: #111
**Date**: 2026-03-15

---

## Root Cause

The runner `model` config field in SKILL.md overrides the session model when a skill is invoked via `/skill-name`. This model switch causes the API call to hit a different per-model rate limit bucket, triggering "API Error: Rate limit reached" even when the user's session model has available quota.

Key evidence: the error only occurs with `/` invocation. Asking Codex to do the same task without `/` works fine — no model switch occurs, so the API call stays in the session model's rate limit bucket.

Codex v2.1.70 fixed a related bug: "Fixed spurious 'Context limit reached' when invoking a skill with runner `model` config on a 1M-context session." This confirms the interaction between skill model overrides and context/rate handling was actively buggy.

## Fix Strategy

Remove the `model:` field from all 12 SKILL.md files. Skills will inherit the session model, staying in the same rate limit bucket. Additionally, add `minimal Codex frontmatter` to 4 slash-command-only skills.

## Blast Radius

- **No behavioral change**: Skills execute identically — they just use whatever model the user chose
- **No quality impact**: Users on GPT-5.5 still get GPT-5.5; users on GPT-5.4 get GPT-5.4
- **Positive**: Eliminates the model-switch rate limit trigger

---

## Change History

| Issue | Date | Summary |
|-------|------|---------|
| #111 | 2026-03-15 | Initial root cause analysis |
| #111 | 2026-03-15 | Updated: remove all `model:` fields to prevent model switch |
