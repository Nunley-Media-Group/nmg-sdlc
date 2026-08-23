# Spec Discovery (v3)

**Read when** write-spec needs to decide amend vs create.

For #N: glob specs/{N}-*

If present and matches singular **Issue**: #N and open/undelivered: update that dir.

Else create specs/{N}-{slug-from-title}/

No epic routing, no umbrella, no spike ADR-only path, no amendment to other N's dir. Simple number match only.

Use ask only if slug collision needs user choice (rare, 1 of budget).

The slug-collision preference `question` includes a short paragraph stating the situation and the facts needed to choose among the shown options.
