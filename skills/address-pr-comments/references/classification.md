# Classify Each Unresolved Thread

**Consumed by**: `address-pr-comments` Step 3. Runs per round after `references/fetch-threads.md` returns one or more eligible threads.

Every thread receives exactly one classification and a one-sentence rationale before Step 4 routes it. The rationale is not decorative — it is surfaced in the reply body when the thread is fixed, and in the `ESCALATION:` sentinel when the thread is escalated in unattended mode. Reviewers and runner operators read it to understand the skill's call without re-reading the comment.

## Classifications

Exactly one of the three labels applies to each thread. Choose based on the comment text AND the current state of the referenced code — classification from the comment alone misses `disagreement` cases where the reviewer's premise is factually wrong.

### `clear-fix`

Use when all of the following hold:

- The comment identifies a specific file and (usually) line — either explicitly in the body, or through GitHub's inline `path` / `line` fields on the comment.
- The requested change is unambiguous: one reasonable interpretation, one target outcome.
- The current code matches the reviewer's description of the problem (reading the file confirms the issue exists).
- Codex can execute the change without further decisions.

Common signals: `reply:` with a concrete suggestion; quoted snippet with named replacement; typo fix; missing null/bounds check; incorrect string literal; unused import; obvious copy/paste bug; a specific regex the reviewer names.

### `ambiguous`

Use when the intent is unclear, the reviewer is asking a question, or multiple valid approaches exist and no spec line pins the choice.

Common signals: the comment ends in a question mark without a concrete suggestion; the reviewer names a tradeoff without committing ("should this be eager or lazy?"); the request references a decision the spec has not made; the target file or line is not identified; the reviewer uses "consider" without committing to a position.

### `disagreement`

Use when — after reading the current code — Codex assesses the comment as incorrect: false positive, reviewer misread, already addressed, or directly contradicts the approved spec.

Common signals: the comment describes a problem that the file does not actually have; the reviewer suggests removing code that a later step depends on; the comment predates a newer commit on the branch that already addresses it; the reviewer's proposed fix violates a spec'd behaviour.

`disagreement` is reserved for factually-incorrect comments. If the reviewer is correct but the fix would require spec-level rework, classify as `ambiguous` and escalate — not as `disagreement`.

## Rationale Format

One sentence, ≤ 25 words, names the signal that tipped the decision. Do not paraphrase the whole comment; state why this label.

Good: `Reviewer named the exact file, line, and replacement regex; current code matches the described snippet.`

Bad: `This looks like a clear fix.` (No signal named.)

Bad: `The reviewer said: "switch \d to [0-9A-F]" because the regex should allow uppercase hex values in token comparison.` (Paraphrase, not rationale.)

## Worked Examples

### Example 1 — `clear-fix`

> Reviewer comment on `src/lib/parser.ts:87`:
> `reply: The regex should allow uppercase — switch \d to [0-9A-F].`

Reading `src/lib/parser.ts:87` confirms the `\d` regex. One named target, one named replacement, no decision required.

- **Classification**: `clear-fix`
- **Rationale**: `Reviewer named the exact file, line, and replacement regex; current code matches the described snippet.`

### Example 2 — `clear-fix`

> Reviewer comment on `app/handlers/auth.py:112`:
> `This try/except swallows the error silently. Log it at WARNING level before re-raising.`

Specific file and line, one action (add logging before re-raise), no decision required.

- **Classification**: `clear-fix`
- **Rationale**: `Specific file and line, unambiguous instruction to add WARNING-level logging before re-raising.`

### Example 3 — `ambiguous`

> Reviewer comment (PR-level, no file):
> `Should we cache the session token or re-fetch it on every request? The spec doesn't say.`

Open question, spec is silent, reviewer has not committed to a side.

- **Classification**: `ambiguous`
- **Rationale**: `Reviewer is asking a cache-vs-refetch question that the spec does not answer — user judgment required.`

### Example 4 — `ambiguous`

> Reviewer comment on `src/utils/retry.ts:34`:
> `Consider pulling this out into its own helper.`

Soft "consider" suggestion without a concrete target; multiple valid refactors would satisfy it.

- **Classification**: `ambiguous`
- **Rationale**: `Soft "consider" suggestion with no concrete refactor target; multiple valid approaches exist.`

### Example 5 — `disagreement`

> Reviewer comment on `src/config/index.ts:22`:
> `This export is unused and should be removed.`

text search shows `src/app/bootstrap.ts` imports `SETTINGS` from this module. Reviewer's premise is false.

- **Classification**: `disagreement`
- **Rationale**: `Reviewer says the export is unused, but src/app/bootstrap.ts imports SETTINGS from this module.`

## Output Shape

After Step 3, each thread carries the following record (in-memory; never serialized to disk):

```
{
  threadId:       "PRT_...",                 // GraphQL node ID for resolveReviewThread
  commentId:      123456,                     // databaseId of the first eligible comment (for REST replies)
  path:           "src/lib/parser.ts" | null,
  line:           87 | null,
  diffHunk:       "@@ -82,7 +82,7 @@ ..." | null,
  body:           "full comment text",        // passed to sub-skills as context
  classification: "clear-fix" | "ambiguous" | "disagreement",
  rationale:      "one sentence"
}
```

Step 4 (`references/fix-loop.md` and `references/escalation.md`) both expect this shape.
