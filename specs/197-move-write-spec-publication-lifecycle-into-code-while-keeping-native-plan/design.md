# Design: Move write-spec publication lifecycle into code while keeping native plan

**Issue**: #197
**Date**: 2026-08-21
**Status**: Approved
**Author**: NMG
**Related Spec**: specs/5-write-spec-skill/

---

## Overview

`scripts/publish-approved-spec.mjs` becomes the single deterministic lifecycle CLI for write-spec. Two read-only subcommands, `discover` and `candidates`, join the existing mutation subcommands. The workflow consumes their JSON, conducts any product interview, authors all four spec bodies into the native plan, and invokes the existing publication sequence after approval.

The helper never authors requirements or design and never owns the TUI ask. This keeps native `/plan` visibility and approval while deleting deterministic GitHub, slug, approval, and branch-ref filtering prose from the injected workflow.

## CLI architecture

```
/sdlc-write-spec #N in TUI
  → native /plan
  → publish-approved-spec.mjs discover --issue N
  → model interview + full four-file local://spec-N-plan.md
  → xd://propose (first issue only)
  → prepare → write Approved package → commit-push → merge
  → publish-approved-spec.mjs candidates --published N [...]
  → native Continue / Finished ask
```

Existing commands retain their argv:

```text
prepare --issue N --name N-slug
commit-push --issue N --dir specs/N-slug
merge --issue N --dir specs/N-slug
default-branch
```

New commands are:

```text
discover --issue N
candidates [--published N ...]
```

All commands print exactly one JSON object on stdout. Failures remain non-zero with `reasonCode` and optional detail on stdout; diagnostics such as porcelain may also use stderr under the existing contract.

## Discovery command

`discover` validates N as a positive integer, then invokes GitHub through the helper's existing process runner:

```text
gh issue view N --json number,title,body,labels,state
```

Unreadable, non-zero, malformed, number-mismatched, or state-missing output fails `issue_unreadable` without repository mutation.

Slug function:

```js
String(title ?? '')
  .toLowerCase()
  .replace(/[^a-z0-9]+/g, '-')
  .replace(/^-+|-+$/g, '') || 'issue'
```

Classification is `bug` when any label name case-insensitively equals `bug`; otherwise `feature`. `spike` has no routing effect.

The command calls the exported execute resolver/status contract for N. It does not glob or inspect branch package metadata independently. Output shape:

```json
{
  "ok": true,
  "issue": {
    "number": 197,
    "title": "Move write-spec publication lifecycle into code while keeping native plan",
    "body": "...",
    "labels": ["enhancement"],
    "state": "OPEN"
  },
  "classification": "feature",
  "slug": "move-write-spec-publication-lifecycle-into-code-while-keeping-native-plan",
  "targetDir": "specs/197-move-write-spec-publication-lifecycle-into-code-while-keeping-native-plan",
  "spec": {
    "dir": null,
    "approved": false,
    "source": null
  }
}
```

When a unique existing directory or approved branch package is resolved, `spec.dir`, `approved`, and `source` reflect the shared status result; an existing worktree directory becomes `targetDir` even if its historical slug differs from the current issue title. An ambiguous leading-number directory or branch state fails closed using the resolver's existing reason rather than selecting arbitrarily.

## Candidates command

`candidates` accepts zero or more repeated `--published N` flags. Duplicate numbers are deduplicated. Unknown arguments or invalid numbers fail `invalid_arguments` without calling GitHub.

It invokes:

```text
gh issue list --state open --limit 100 --json number,title
```

It validates the JSON array, positive integer numbers, and string titles. Malformed or unreadable output fails `issues_unreadable`. For each unique issue sorted by number, it drops published numbers and calls shared `specStatus`; approved worktree/local-branch/remote-branch packages are dropped. Ambiguous or unreadable status fails closed rather than including a possibly approved issue.

Output shape:

```json
{
  "ok": true,
  "candidates": [
    { "number": 197, "title": "Move write-spec publication lifecycle into code while keeping native plan" }
  ]
}
```

The helper returns every eligible row. The workflow selects at most the first three for the ask, appends Finished, and leaves extra issue entry to automatic Other.

## Publication invariants

The existing helper remains the sole branch mutation path. `prepare` resolves the GitHub default branch, fetches, and checks out the exact spec branch only from a clean state. `commit-push` validates the approved four-file package, stages only its directory, commits `docs: approve spec for #N`, and pushes without force. `merge` creates or resumes a docs-only PR whose body is non-closing, squash-merges, then checks out and fast-forwards the default branch.

No new command calls `gh issue develop`, guesses `main`, stages unrelated files, force-pushes, closes the implementation issue, or changes existing publication argv.

## Workflow contract

`workflows/write-spec/WORKFLOW.md` keeps TUI-only routing, feature/bug templates, maximum-three interview budget, and full-text plan requirements. Discovery prose becomes one `discover` invocation plus interpretation of returned JSON. Continue filtering prose becomes one `candidates` invocation plus native ask presentation.

`workflows/write-spec/references/publish.md` documents the six helper subcommands, JSON shapes, publication failures, and ask presentation. It no longer tells the model to inspect branch refs or reproduce approval rules.

The first issue writes `local://spec-{N}-plan.md` containing the complete four file bodies and calls `xd://propose`. After approval, the exact sequence remains prepare, write four Approved files, commit-push, merge. Later issues receive fresh interview budgets but no second propose.

## Testing strategy

| Layer | Coverage |
|-------|----------|
| discover CLI | invalid N, issue unreadable/malformed, slug fallback, bug classification, spike neutrality, existing dir, approved branch source, ambiguity |
| candidates CLI | repeated published args, dedupe, GitHub failure/malformed JSON, numeric sort, approved worktree/local/remote exclusion, ambiguity fail-closed |
| publication regression | all existing prepare/commit-push/merge/default-branch tests unchanged and passing |
| workflow contract | full four-file plan text, one propose, max three interview asks, helper invocations, ask shape, exact finish text |
| public surface | TUI rewrite remains, print/RPC denial remains exact, no `commands/sdlc-write-spec.md` |

---

## Change History

| Issue | Date | Summary |
|-------|------|---------|
| #197 | 2026-08-21 | Initial feature spec |
