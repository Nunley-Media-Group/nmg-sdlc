# Design: Require request_user_input Mode for Plugin Prompts

**Issues**: #110
**Date**: 2026-04-27
**Status**: Draft
**Author**: Codex

---

## Overview

This feature adds a shared prompt-mode setup contract that runs before interactive nmg-sdlc `request_user_input` gates. The contract verifies the user's Codex config, repairs missing or false prompt feature settings, suppresses Codex under-development feature warnings, and blocks the current workflow with restart instructions whenever a repair is made.

The design uses the existing `references/interactive-gates.md` fan-out as the primary integration point. Every interactive skill already reads that reference before manual gates, so adding a prompt-config precondition there avoids duplicating setup logic across each skill while preserving `.codex/unattended-mode` behavior in `references/unattended-mode.md`. A small zero-dependency Node helper performs the line-preserving TOML edit against a configurable config path for tests and the real `~/.codex/config.toml` for normal use.

---

## Architecture

### Component Diagram

```text
Interactive nmg-sdlc skill
  |
  |-- reaches a manual user-input gate
  |-- reads references/interactive-gates.md
        |
        |-- reads references/prompt-config.md
              |
              |-- invokes scripts/ensure-codex-prompt-config.mjs
              |     |-- reads ~/.codex/config.toml
              |     |-- ensures top-level suppress_unstable_features_warning = true
              |     |-- ensures [features] prompt flags are true
              |     `-- preserves unrelated config text
              |
              |-- if changed: stop workflow and instruct restart
              `-- if unchanged: continue to request_user_input gate

Unattended runner path
  |
  |-- .codex/unattended-mode exists
  `-- references/unattended-mode.md bypasses manual gates without prompt-config setup
```

### Data Flow

```text
1. A skill reaches a manual-mode decision, menu, review gate, or clarification prompt.
2. The skill reads references/interactive-gates.md.
3. interactive-gates points to references/prompt-config.md as the required preflight.
4. The preflight runs scripts/ensure-codex-prompt-config.mjs.
5. The script derives the config path from HOME by default, with a test-only override.
6. The script reads or creates the config text, updates only the required keys, and preserves unrelated content.
7. If no change was needed, the skill calls request_user_input normally.
8. If a change was made, the skill stops and tells the user to close and reopen Codex before retrying.
```

---

## API / Interface Changes

### Shared Prompt-Config Contract

| Interface | Type | Purpose |
|-----------|------|---------|
| `references/prompt-config.md` | Shared reference | Defines required Codex config keys, when to run setup, how to react to changed/no-op/error states, and how unattended mode remains separate |
| `references/interactive-gates.md` | Shared reference | Calls out prompt-config setup before manual `request_user_input` gates and retains free-form `Other` guidance |
| `scripts/ensure-codex-prompt-config.mjs` | Node helper | Applies idempotent, line-preserving config updates and emits a deterministic status |

### Helper Invocation

```bash
node scripts/ensure-codex-prompt-config.mjs
```

Test invocations may point at a temporary config file without touching the real user config:

```bash
node scripts/ensure-codex-prompt-config.mjs --config /tmp/codex-config.toml
```

### Helper Output Contract

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

| Exit | Meaning | Skill behavior |
|------|---------|----------------|
| `0` with `changed: false` | Config already satisfies the contract | Continue to the original `request_user_input` gate |
| `0` with `changed: true` | Config was repaired | Stop before the original gate and instruct close/reopen Codex |
| non-zero | Config could not be repaired | Stop before the original gate and report the failing path and reason |

---

## Database / Storage Changes

No database changes.

### User Config Changes

| File | Change | Rule |
|------|--------|------|
| `~/.codex/config.toml` | Ensure top-level `suppress_unstable_features_warning = true` | If missing, insert before the first table; if present as a top-level key, update only the value |
| `~/.codex/config.toml` | Ensure `[features].default_mode_request_user_input = true` | Create `[features]` if absent; update only the key line if present |
| `~/.codex/config.toml` | Ensure `[features].ask_user_questions = true` | Same section handling as above |

### Preservation Rules

- Preserve unrelated top-level keys, tables, arrays of tables, comments, blank lines, marketplace entries, plugin settings, and project settings.
- Preserve trailing comments on lines where the required boolean value is updated where practical.
- Do not reorder existing sections.
- If the file is syntactically too ambiguous to update safely, fail closed with a diagnostic instead of rewriting the whole file.

---

## State Management

No persistent repository state is introduced.

| State | Detection | Action |
|-------|-----------|--------|
| Missing config file | Config path absent | Create parent directory and write the minimum required config |
| Missing `[features]` section | No `[features]` table found | Append or insert a `[features]` table with required feature flags |
| Missing required key | Required key absent from its target scope | Insert the key in that scope |
| Required key set false | Required key present with a non-true boolean | Replace value with `true` |
| Already configured | All required keys already true | Report no-op and leave the file unchanged |
| Unwritable config | Read or write fails | Report error and stop before prompting |

---

## UI Components

No graphical UI is introduced.

### User-Facing Output

| Output | Location | Purpose |
|--------|----------|---------|
| Config repaired message | `references/prompt-config.md` changed path | Names the settings written and tells the user to close and reopen Codex before retrying |
| Config error message | `references/prompt-config.md` error path | Explains that the prompt gate cannot continue because required Codex config could not be repaired |
| Normal prompt gate | Existing `request_user_input` call sites | Runs only when config already satisfies the prompt contract |

---

## Alternatives Considered

| Option | Description | Pros | Cons | Decision |
|--------|-------------|------|------|----------|
| Document manual setup only | Tell users to edit `~/.codex/config.toml` themselves | Simple | Does not satisfy automatic setup and leaves first-run failures likely | Rejected |
| Add setup prose to every skill | Duplicate config preflight text in each `SKILL.md` | Explicit per skill | High drift risk and expensive to audit | Rejected |
| Put setup in `interactive-gates.md` plus shared prompt-config reference | Every existing input-gate consumer inherits setup through one path | Low duplication; aligns with current architecture | Requires careful wording so unattended mode remains separate | Selected |
| Full TOML parser dependency | Add a dependency to parse and rewrite TOML | Strong syntax support | Violates zero-dependency script preference and may not preserve comments | Rejected |
| Line-preserving targeted TOML updater | Update only the known keys with conservative text operations | Preserves user config and works without dependencies | Handles only this limited config contract | Selected |

---

## Security Considerations

- [x] **Authentication**: No new authentication surface.
- [x] **Authorization**: The change writes only the current user's Codex config file.
- [x] **Input Validation**: The helper validates required booleans and fails closed on unsafe or unreadable config states.
- [x] **Data Sanitization**: The helper does not log full config contents; it reports only path and changed key names.
- [x] **Sensitive Data**: Existing secrets or tokens in config are preserved and not copied into skill output.

---

## Performance Considerations

- [x] **Small File Scope**: The setup preflight reads one local config file.
- [x] **No Network**: Config setup performs no network calls.
- [x] **No-op Fast Path**: Already-correct config exits without writing.
- [x] **Bounded Audit**: Prompt-contract tests scan active skill and reference files, not generated specs.

---

## Testing Strategy

| Layer | Type | Coverage |
|-------|------|----------|
| Config helper | Jest unit | Missing file creation, missing section insertion, false-to-true updates, no-op stability, comment preservation, unrelated section preservation |
| Prompt contract | Jest unit | Active instructions require `request_user_input`, free-form `Other` handling, and prompt-config setup before manual gates |
| Documentation | Static unit | README documents automatic config management and restart behavior |
| Inventory | Audit | `node scripts/skill-inventory-audit.mjs --check` passes after adding the shared reference |
| Compatibility | Audit | `npm --prefix scripts run compat` passes after new script and reference wording |
| Exercise | Codex/manual or dry-run | Invoke an interactive skill in a disposable project with a temporary config path and verify changed-config and no-op paths |

---

## Risks & Mitigations

| Risk | Likelihood | Impact | Mitigation |
|------|------------|--------|------------|
| Config updater damages unrelated user config | Low | High | Use targeted line-preserving edits, unit fixtures with comments/marketplace/project entries, and fail closed on ambiguous structure |
| Skills continue into prompts after changing config | Medium | High | `prompt-config.md` must make changed-config a hard stop; tests assert restart wording and no continuation language |
| Prompt setup is conflated with `.codex/unattended-mode` | Medium | Medium | Keep setup in `interactive-gates.md` manual path and explicitly state unattended bypass remains governed by `unattended-mode.md` |
| New shared reference breaks inventory audit | Medium | Medium | Include inventory baseline update task and run audit |
| `ask_user_questions` flag support changes in Codex | Low | Medium | Keep keys centralized in `references/prompt-config.md` and helper constants for easy future update |

---

## Open Questions

None.

---

## Change History

| Issue | Date | Summary |
|-------|------|---------|
| #110 | 2026-04-27 | Initial feature spec |

---

## Validation Checklist

Before moving to TASKS phase:

- [x] Architecture follows existing project patterns per `structure.md`.
- [x] All API/interface changes are documented.
- [x] Database/storage changes are planned.
- [x] State management approach is clear.
- [x] UI components and hierarchy are addressed.
- [x] Security considerations are addressed.
- [x] Performance impact is analyzed.
- [x] Testing strategy is defined.
- [x] Alternatives were considered and documented.
- [x] Risks are identified with mitigations.
