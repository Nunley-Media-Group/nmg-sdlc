# Root Cause Analysis: Save full smoke session transcripts and fail surfaces whose transcript lacks the sent command

**Issue**: #605
**Date**: 2026-11-23
**Status**: Approved
**Author**: Claude Code

## Root Cause

Step 6 of `steering/snippets/project-smoke.md` saves each surface transcript with one `tmux capture-pane -p -S - -t <session> > .nmg-sdlc/smoke/surfaces/<surface>.log` after the command finishes. The interactive Claude session redraws its screen in place, so the pane's history does not keep the earlier output and that single capture holds about the final screen. `readSurfaceRecord` in `steering/extensions/nmg-sdlc-smoke.mjs` checks only that the transcript is a non-empty regular file inside `.nmg-sdlc/smoke/surfaces/`, so a transcript missing the sent command passes.

## Affected Code

| File | Symbol / Area | Role |
|------|---------------|------|
| `steering/snippets/project-smoke.md` | steps 4–6 | Tells the verify worker how to drive a surface and save its transcript |
| `steering/extensions/nmg-sdlc-smoke.mjs` | `readSurfaceRecord` | Validates a surface record and its transcript |
| `steering/extensions/nmg-sdlc-smoke.mjs` | `checkInteractiveSurfaces` | Turns a record failure into the gate's failed surface and evidence |

## Fix Strategy

1. **Transcript capture (snippet).** Build each surface's `.log` over the whole session instead of one final capture:
   - Before a surface's command is sent, empty its log: `: > .nmg-sdlc/smoke/surfaces/<surface>.log`.
   - Type the command with `tmux send-keys -t <session> '<text>'` without `Enter`, append a capture so the typed command is on record, then send `Enter`.
   - At every poll and once more when the command finishes, append the pane: `tmux capture-pane -p -J -S - -t <session> >> .nmg-sdlc/smoke/surfaces/<surface>.log`. `-J` joins wrapped lines.
   - Step 4 (draft) and step 5 (specify) apply this to `draft-issue.log` and `write-spec.log`; step 6 applies it to every other surface and drops the single overwriting capture. Step 6 states that the gate fails a transcript that does not contain the record's `command`.
2. **Gate check (provider).** In `readSurfaceRecord`, after the existing transcript location and type checks pass, read the transcript with the injected `readFile(transcriptPath, "utf8")`. Remove all whitespace from the transcript and from `record.command`; if the transcript does not contain the command, return `{ reason: "transcript lacks the sent command" }`. A read failure returns the existing `transcript missing` reason. `checkInteractiveSurfaces` already reports the reason as `<surface>: <reason>` evidence and the surface under `nmg-sdlc-smoke surface not exercised: <surface>`. Every earlier check, and its order, is unchanged.

Whitespace is ignored because the session wraps a long command over several pane lines.

## Changes

| File | Change | Behavioral reason |
|------|--------|-------------------|
| `steering/snippets/project-smoke.md` | Append captures from the typed command through completion; document the command check | AC1, FR1 |
| `steering/extensions/nmg-sdlc-smoke.mjs` | Transcript-contains-command check in `readSurfaceRecord` | AC2, FR2 |
| `scripts/__tests__/nmg-sdlc-smoke.test.mjs` | Fixture transcripts contain the command; #605 scenarios | AC1, AC2, AC3 |

## Blast Radius

Only the `repository.nmg-sdlc-smoke` validation's interactive-surface check changes. A record that passed before now also needs its command in the transcript; records written under the old instructions from a single final capture may fail and are re-exercised at the next verify, since records are bound to the head anyway. The `execute` delivery path and provisioning record are untouched. The snippet still contains `tmux new-session`, `tmux capture-pane` and its numbered headings, which `scripts/__tests__/steering-contract.test.mjs` requires.

## Alternatives Considered

| Option | Decision | Reason |
|--------|----------|--------|
| Append a capture at command entry, every poll and completion | Selected | Works however the session redraws, and the worker already polls |
| `tmux pipe-pane` raw stream | Rejected | The raw stream holds cursor-control sequences, so the command text is not reliably contiguous |
| Raise `history-limit` | Rejected | An in-place redraw never reaches the history, whatever its size |

## Change History

| Issue | Date | Summary |
|-------|------|---------|
| #605 | 2026-11-23 | Initial defect design |
