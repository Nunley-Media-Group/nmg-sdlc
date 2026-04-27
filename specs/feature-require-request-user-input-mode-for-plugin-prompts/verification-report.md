# Verification Evidence: Require request_user_input Mode for Plugin Prompts

**Issue**: #110
**Date**: 2026-04-27
**Status**: Implementation evidence captured during `$nmg-sdlc:write-code`

## Exercise Evidence

### Missing Prompt Settings Repairs Config and Stops Workflow

Command:

```bash
tmpdir=$(mktemp -d)
missing="$tmpdir/missing/config.toml"
node scripts/ensure-codex-prompt-config.mjs --config "$missing"
sed -n '1,20p' "$missing"
```

Observed helper status:

```json
{
  "changed": true,
  "keysChanged": [
    "features.default_mode_request_user_input",
    "features.ask_user_questions",
    "suppress_unstable_features_warning"
  ]
}
```

Observed file content:

```toml
suppress_unstable_features_warning = true

[features]
default_mode_request_user_input = true
ask_user_questions = true
```

`references/prompt-config.md` maps this `changed: true` path to a hard stop before the original `request_user_input` gate with close-and-reopen Codex instructions.

### Rerun with Settings Present Proceeds to Normal Gate

Command:

```bash
node scripts/ensure-codex-prompt-config.mjs --config "$missing"
```

Observed helper status:

```json
{
  "changed": false,
  "keysChanged": []
}
```

`references/prompt-config.md` maps this no-op path to continuing to the original `request_user_input` gate.

### Unattended Mode Bypasses Prompt Setup

Command:

```bash
rg -n 'bypasses the prompt-config preflight|unattended branches do not need prompt-config setup' references/interactive-gates.md references/prompt-config.md
```

Observed evidence:

```text
references/interactive-gates.md:52:Because unattended mode bypasses the manual gate, it also bypasses the prompt-config preflight.
references/prompt-config.md:5:... unattended branches do not need prompt-config setup before skipping `request_user_input`.
```

## Static Validation

```bash
node scripts/skill-inventory-audit.mjs --check
npm --prefix scripts run compat
npm --prefix scripts test -- --runInBand
git diff --check
```

Results:

- Skill inventory audit: clean (517 items mapped).
- Codex compatibility check passed.
- Jest: 11 passed suites, 3 skipped suites; 343 passed tests, 17 skipped tests.
- `git diff --check`: passed.

## Limitations

This evidence uses the helper's `--config` override so the real `~/.codex/config.toml` is not mutated during implementation. The actual Codex UI restart behavior is documented through the prompt-config contract and covered by contract tests rather than exercised by restarting the live Codex session.
