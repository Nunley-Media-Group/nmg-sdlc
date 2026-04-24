# Escalate Ambiguous or Disagreement Threads

**Consumed by**: `address-pr-comments` Step 4 when the current thread's classification is `ambiguous` or `disagreement`, and by `references/fix-loop.md` when a `clear-fix` thread's postcondition gate fails. Both branches share the same skipped-set behaviour — the only difference is whether the user is prompted (interactive) or a sentinel is emitted (unattended).

The two modes diverge on who makes the call. Interactive runs route the decision to the user via `request_user_input` because the wrong fix on a borderline thread is costly and a human can disambiguate in seconds. Unattended runs emit a machine-readable `ESCALATION:` sentinel and skip — the SDLC runner parses the sentinel and surfaces the thread to a human later, rather than guessing and potentially closing a thread with a wrong reply.

## Mode Selection

Read `../../references/unattended-mode.md` when deciding which branch below to take — the shared reference covers the interactive vs. unattended contract; this reference reads the value cached by SKILL.md Step 1 rather than re-probing the filesystem.

## Interactive Branch

When the cached sentinel is absent, prompt via `request_user_input`:

```
Question: "PR #{N} thread on {path}:{line} — {classification}. Rationale: {rationale}.
Thread body:
{first 4 lines of the comment body, truncated with '...' if longer}

How should this thread be handled?"

Options:
  [Fix it anyway]           Re-invoke the fix flow (references/fix-loop.md) as if the thread had been classified clear-fix.
  [Skip — leave unresolved] Add to the skipped-set; do not reply, do not resolve. The human reviewer decides what to do next.
  [Reply without fixing]    Post a short reply explaining why the skill is not acting on this thread, but do NOT resolve — leave the thread open for the reviewer.
```

Route each selection:

| Selection | Action | Skipped-set? |
|-----------|--------|--------------|
| `Fix it anyway` | Route the thread back through `references/fix-loop.md` with the classification upgraded to `clear-fix` for this invocation only. If the postcondition gate still fails, fall back to the `Skip — leave unresolved` row below (classification kept as the original `ambiguous` / `disagreement`) so the user is not put in a loop. | No (unless fix postconditions fail, in which case it joins the set) |
| `Skip — leave unresolved` | Do nothing. Thread remains unresolved on GitHub. | Yes — this run |
| `Reply without fixing` | Post the reply via the REST path in `references/fix-loop.md` § Reply via REST with a body naming the classification and rationale (e.g., `Skill assessment: {classification}. {rationale}. Leaving for human review — no code change is being made in this round.`). Do NOT invoke the resolve mutation. | Yes — this run |

When the user selects "Other" and provides freeform text, treat the freeform text as the reply body and take the `Reply without fixing` path.

## Unattended Branch

When the cached sentinel is present, print exactly:

```
ESCALATION: address-pr-comments — pr=#{N} thread={node_id} classification={class} rationale={one-sentence}
```

Rules:

- One line per escalated thread. No surrounding blank line, no trailing period.
- Never call `request_user_input`. Do not offer a fallback prompt and do not block on any input — that would hang the runner.
- `{one-sentence}` is the one-sentence rationale from Step 3. If it contains a newline (it should not — `references/classification.md` caps it at one sentence), replace any newline with a space before emitting.
- After emitting, add the thread to the in-process skipped-set and continue to the next thread.
- Do NOT post a reply in unattended mode. The SDLC runner's escalation handling is responsible for looping a human into the decision; posting a reply preemptively would clutter the PR and could mislead the reviewer.

The sentinel pattern `^ESCALATION: address-pr-comments — ` is the anchor the SDLC runner greps for, so match it byte-for-byte.

## Shared Skipped-Set Semantics

Both branches add escalated threads to an in-process `skipped-set` keyed by GraphQL `threadId`. The set is intentionally ephemeral — it is not persisted to disk and it is cleared on every new invocation of `/address-pr-comments`. Two invariants hold:

1. **Within a single invocation**: a thread in the skipped-set is excluded from every subsequent `references/fetch-threads.md` re-fetch (see `references/polling.md` § Round Re-Fetch). This prevents the loop from repeatedly prompting the user about the same thread, and prevents unattended mode from emitting the same escalation sentinel every round.
2. **Across invocations**: a new invocation re-fetches from scratch. A thread the user skipped yesterday will be re-evaluated today — the user may have addressed it manually in the meantime, or may have decided they want the prompt again.

The livelock guard in `references/polling.md` uses the escalation count to distinguish "unattended round produced zero commits because everything was already fine" (safe re-poll) from "unattended round produced zero commits because every thread escalated" (deliberate exit to avoid oscillation).
