# Spec Discovery (v4)

**Read when** write-spec needs to decide amend vs create.

For #N: find `specs/{N}-*` (`Glob`, or `find` through `Bash`)

If present and matches singular **Issue**: #N and open/undelivered: update that dir.

Else create specs/{N}-{slug-from-title}/

No epic routing, no umbrella, no spike ADR-only path, no amendment to other N's dir. Simple number match only.

Use `AskUserQuestion` only if slug collision needs user choice (rare, 1 of budget).

The slug-collision preference `question` includes a short paragraph stating the situation and the facts needed to choose among the shown options.
