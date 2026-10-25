# Select specified issues

Read only when `/sdlc-execute` receives no issue tokens after removing optional `--retain-worker` and `--check-in-seconds N` flags.

On a current branch recognized as an issue branch, selection is not used; the branch issue is selected immediately for ordinary resume.

Otherwise:

1. Run `node <plugin-root>/scripts/sdlc-execute.mjs list-specified`.
2. If `ok` is false, print the helper output and stop without invoking `supervise`.
3. If `issues` is empty, print exactly `No open spec-created issues.` and stop without invoking `supervise`.
4. Otherwise use one `AskUserQuestion` call with one question that sets `multiSelect: true` (header `Issues`). Do not mark any option ` (Recommended)`. The question text lists every returned issue, one per line as `#N — {title}`, followed by `Which spec-created issues should /sdlc-execute run?`
5. Offer the four lowest-numbered issues as `#N — {title}` issue options (the tool allows at most four), or every issue when fewer than four exist. There is no Cancel chip. Because `AskUserQuestion` needs at least two options, a single returned issue is paired with exactly `Stop — run nothing`; selecting only that option prints nothing further and stops without invoking `supervise`. Submitting the selection is the confirm action; dismissing the question stops without invoking `supervise`. Automatic Other accepts `#N`, `N`, or comma- or whitespace-separated lists under the controller's token rules.
6. Union selected issue options with Other tokens (multi-select answers are comma-separated labels): issues in ascending displayed order, then Other tokens in typed order; dedupe first occurrence first. Invalid Other or an empty union reopens the same question. A non-empty union starts immediately with no second confirmation.
7. Invoke `node <plugin-root>/scripts/sdlc-execute.mjs supervise` once with the selected numbers as separate `#N` tokens in the resolved order, followed by `--retain-worker` and `--check-in-seconds N` when present in `$ARGUMENTS`, then answer its reports as the execute workflow describes.
8. If `AskUserQuestion` is unavailable (no UI: `claude -p`, the SDK), print `Run /sdlc-execute in the TUI to choose spec-created issues.` followed by every `list-specified` title, then stop without invoking `supervise`.
