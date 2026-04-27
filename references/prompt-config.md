# Codex Prompt Config

**Consumed by**: every interactive nmg-sdlc gate before it calls `request_user_input`.

Interactive nmg-sdlc gates require Codex's user-question surface to be enabled before the gate is presented. Run this preflight only on manual-mode paths. `.codex/unattended-mode` remains separate and continues to bypass manual gates per `references/unattended-mode.md`; unattended branches do not need prompt-config setup before skipping `request_user_input`.

## Required Settings

The user's Codex config at `~/.codex/config.toml` must contain:

```toml
suppress_unstable_features_warning = true

[features]
default_mode_request_user_input = true
ask_user_questions = true
```

`suppress_unstable_features_warning` is a top-level key. `default_mode_request_user_input` and `ask_user_questions` live under `[features]`.

## Process

Before a manual-mode decision, menu, review gate, or clarification prompt calls `request_user_input`:

1. Run `node scripts/ensure-codex-prompt-config.mjs` from the plugin root.
2. Read the JSON result from stdout.
3. If `changed` is `false`, continue to the original `request_user_input` gate.
4. If `changed` is `true`, stop before the original gate and tell the user the listed settings were written to `path`. The user must close and reopen Codex, then retry the same nmg-sdlc command.
5. If the helper exits non-zero, stop before the original gate and report the failing config path and diagnostic.

Changed-config runs are setup runs, not normal workflow continuations. Do not present the original `request_user_input` gate in the same Codex session after writing the config; Codex reads these settings at startup.

## Output

Successful helper output is deterministic JSON:

```json
{
  "path": "/Users/example/.codex/config.toml",
  "changed": true,
  "keysChanged": [
    "features.default_mode_request_user_input",
    "features.ask_user_questions",
    "suppress_unstable_features_warning"
  ]
}
```

User-facing restart message:

```text
nmg-sdlc updated Codex prompt settings in {path}: {keysChanged}.
Close and reopen Codex, then retry this nmg-sdlc command so request_user_input mode is active.
```

## Safety

- The helper preserves unrelated config values, comments, plugin marketplace settings, project settings, and section order.
- The helper reports only the path and changed key names. Do not print the full config file; it may contain secrets.
- The helper accepts `--config <path>` for tests and exercises. Normal skills use the default `~/.codex/config.toml`.
- If a required key appears more than once in its scope or has a non-boolean value, fail closed instead of rewriting unrelated config.
