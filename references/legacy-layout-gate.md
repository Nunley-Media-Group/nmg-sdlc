# Legacy-Layout Precondition

**Consumed by**: `draft-issue`, `start-issue`, `write-spec`, `write-code`, `verify-code`, `open-pr`, `onboard-project`, `upgrade-project` (resolves the gate instead of aborting).

Current Codex releases refuse to Edit/Write under the project-level `.codex/` directory. Projects that still keep canonical SDLC artifacts at `.codex/steering/` or `.codex/specs/` cannot be advanced by any SDLC pipeline skill without first relocating those directories to the project root. The gate below catches that state early so the skill does not silently produce a partial result against a half-upgraded tree.

## Check

Before the first workflow step runs, file discovery for both of the following:

- `.codex/steering/*.md`
- `.codex/specs/*/requirements.md`

If **either** glob returns at least one match, the project is on the legacy layout and the gate fires.

## Action

Abort the current skill and print exactly:

```
This project still uses the legacy `.codex/steering/` and/or `.codex/specs/` layout. Current Codex releases protect `.codex/` from Edit/Write, so SDLC artifacts must live at the project root. Run `$nmg-sdlc:upgrade-project` to relocate them, then re-run `/{current-skill}`.
```

Replace `{current-skill}` with the consuming skill's slash-command name (e.g., `$nmg-sdlc:write-spec`, `$nmg-sdlc:draft-issue`).

## Invariants

- The gate always fires before the consuming workflow — the legacy layout is a hard block for Edit/Write, not a user-preference question. Do not silently proceed, prompt, or attempt a workaround.
- The message is reasoning-first (the *why* precedes the *how*) and omits a rigid `ERROR:` prefix.
- `$nmg-sdlc:upgrade-project` is the **only** skill that resolves this gate. It runs its own legacy-layout detection in Step 1.5 and performs the relocation (`git mv .codex/steering → steering`, `git mv .codex/specs → specs`, and cross-reference rewrites). All other consumers abort.

## Upgrade state stays under `.codex/`

The gate checks only `steering/` and `specs/` subtrees. `.codex/upgrade-exclusions.json` is not part of the legacy layout and remains under `.codex/` because the upgrade-exclusions write-back accesses it directly, so directory protection does not affect it.
