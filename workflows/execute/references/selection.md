# Select specified issues

Read only when `/sdlc-execute` receives empty arguments.

1. Run `node scripts/sdlc-execute.mjs list-specified`.
2. If `ok` is false, print the helper output and stop without invoking `run`.
3. If `issues` is empty, print exactly `No open spec-created issues.` and stop without invoking `run`.
4. Otherwise use one built-in `ask` with `multi: true` and recommended index 0. The question lists every returned issue, one per line as `#N — {title}`, followed by `Which spec-created issues should /sdlc-execute run?`
5. Offer the lowest-numbered issues as `#N — {title}`, at most three, then `Cancel — start nothing`. Never exceed four options. Automatic Other accepts `#N`, `N`, or comma- or whitespace-separated lists under the controller's token rules.
6. If Cancel appears in the selection, start nothing. Otherwise union selected chips with Other tokens: chips in ascending displayed order, then Other tokens in typed order; dedupe first occurrence first. Invalid Other reopens the same question. An empty union is Cancel.
7. Invoke `node scripts/sdlc-execute.mjs run` with the selected numbers as space-separated `#N` tokens.
8. If the built-in question UI is unavailable, print `Run /sdlc-execute in the TUI to choose spec-created issues.` followed by every `list-specified` title, then stop without invoking `run`.
