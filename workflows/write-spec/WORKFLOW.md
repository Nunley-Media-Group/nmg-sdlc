---
name: write-spec
description: "Create BDD specifications for open GitHub issues. Use when /sdlc-write-spec [#N]: bare invocation presents issues missing spec-created, while an explicit number selects one directly. Every selected issue receives its own native-plan approval before publication; after merged publication the nmg-sdlc hooks module resubmits the workflow into native plan mode for Continue/Finished."
---

# Write Spec

Read `../../references/claude-code-tooling.md` when mapping the workflow's read, search, interview, write, plan-file, and plan-approval operations to Claude Code tools.

Read `references/publish.md` when executing Approval Behavior or the continue loop.

In the TUI, the nmg-sdlc hooks module (`hooks/register.ts`) enters native plan mode before it submits this workflow. If plan mode has ended and `Write` / `Edit` are usable, that is post-approval execution — continue; do not bounce. Do not run this workflow without a UI (`claude -p`, the SDK); those surfaces fail closed.

## Initial issue selection

Trim `$ARGUMENTS`.

If the trimmed value is non-empty:

1. Require it to match `^#?\d+$`. Otherwise print exactly `Usage: /sdlc-write-spec #N` and stop.
2. Let N be the numeric issue id after stripping a leading `#`.
3. Skip the bare picker and continue directly to Discovery.

If the trimmed value is empty:

1. Before any usage gate or `AskUserQuestion`, run:

   ```text
   node "<plugin-root>/scripts/publish-approved-spec.mjs" missing-spec-created
   ```

2. Require exit 0 and parse the complete JSON object. On non-zero or malformed output, print its `reasonCode` or helper failure output and stop without asking or inventing choices.
3. Require `issues` to be a complete array of positive safe-integer `number` and non-empty string `title` rows. Invalid rows are `issues_unreadable`; print that reason and stop.
4. If `issues` is empty, print exactly `No open issues missing spec-created.` and stop without `AskUserQuestion` or usage output.
5. Cache the complete `issues` array for this initial picker. Ask once with one `AskUserQuestion` question whose options are at most its first three rows as `#M — {title}`, the first labelled `#M — {title} (Recommended)`, followed by exactly `Finished — stop without writing a spec` (at most four options). Automatic Other remains available.
6. A listed choice sets N (ignore a trailing ` (Recommended)` when reading the number). Parse automatic Other with `^#?([1-9]\d*)$`; a valid number sets N, while invalid input re-asks the same picker from the cached rows without rerunning the helper.
7. Finished stops immediately without Discovery and without printing `Published specs:` or `Next step:`. End the reply by calling `ExitPlanMode` as its last action, with no other output after it and without another `AskUserQuestion`; the nmg-sdlc hooks module approves that one call, so plan mode ends without an approval dialog.

After the initial selection, continue to Discovery with N.

Keep an in-memory `published[]` list of issue numbers published in this session. Start empty on the initial invocation.

A prompt beginning `Post-publication continuation.` is not `$ARGUMENTS`: skip Initial issue selection, set `published[]` to its complete listed numbers (use its `N-slug` names for the Finished summary), and start at ## Continue loop.

## Discovery

Run:

```text
node "<plugin-root>/scripts/publish-approved-spec.mjs" discover --issue N
```

Require exit 0 and parse the complete JSON object. Use `issue.number`, `title`, `body`, `labels`, and `state`; `classification`; `slug`; `targetDir`; and `spec.dir`, `approved`, and `source` directly. On non-zero or malformed output, print its `reasonCode` and stop. Do not reproduce slug, directory, branch, or approval resolution.

Discovery only returns this result. It never stops or chooses whether to revise based on approval or issue state; its caller owns that control flow.

`classification` is `bug` or `feature`. A leftover `spike` label is neutral; never create a third path.

### Initial discovery result

For the initially selected issue, regardless of whether N came from `$ARGUMENTS`, a listed picker choice, or automatic Other:

- If `spec.approved` and `issue.state` is closed, do not rewrite. Print `Spec already approved for closed issue #N. Open a new issue for follow-up work.` and stop.
- Otherwise extract the eligible slice from the issue body, repository evidence, and steering before Interview. Apply the rendered `/sdlc-execute` eligibility algorithm to every candidate statement. Strip legal, policy, ownership-proof, attestation, sign-off, live-operation, and other externally owned obligations rather than relocating them.
- Steering may resolve actual paths, interfaces, validation identities, and project conventions. Never copy its process, release, ownership, or verification-policy prose into generated files, and never treat steering as authority to exceed execute boundaries.
- If no eligible software behavior remains, print exactly `Issue #N has no software requirements executable by /sdlc-execute after excluding non-software obligations.` and stop before writing a plan, calling `ExitPlanMode`, preparing a branch, writing files, committing, publishing, labeling, or merging.
- When `spec.dir` identifies an open or undelivered existing package, revise `targetDir` in place and later append the revision to Change History. Never write into a directory whose leading number differs from N.

## Interview (max 3 asks per issue)

Use `AskUserQuestion` with the recommended option first (its label ending ` (Recommended)`) only to resolve material product behavior or required preferences, such as a slug collision or an observable scope choice. Typically use zero asks for a simple issue and never exceed three.

Each question includes a short paragraph stating the situation and facts needed to choose among the options. Ask only about software behavior `/sdlc-execute` can implement and verify. Never ask for legal interpretation, proof of authority or ownership, external sign-off or attestation, credentials, live operations, or facts available from repository tools.

Use the budget to resolve every material product decision and acceptance oracle. If any remain afterward, print exactly `Issue #N has unresolved decisions required for /sdlc-execute: <comma-separated decisions>.` and stop before plan creation, proposal, or mutation. Never emit Open Questions into the package.

The continue/finish question is canned, does not consume this budget, and each later issue receives a fresh three-ask budget. There are no review gates, epic roles, or umbrella packages.

## Feature / Bug package

Read these packaged templates at runtime, then fill them only from the retained or rewritten eligible slice, repository evidence, and implementation-relevant steering:

- `workflows/write-spec/templates/requirements.md`
- `workflows/write-spec/templates/design.md`
- `workflows/write-spec/templates/tasks.md`
- `workflows/write-spec/templates/feature.gherkin`

The plan Approach includes the complete planned contents of `requirements.md`, `design.md`, `tasks.md`, and `feature.gherkin`. Requirements use singular `**Issue**: #N`, `**Status**: Draft`, and the appropriate `# Requirements:` or `# Defect Report:` heading with `**Related Spec**` when applicable.

Every file, including `feature.gherkin` and defect variants, carries:

```text
**Issue**: #N
**Date**: YYYY-MM-DD
**Status**: Draft
**Author**: ...
```

Approval rewrites `**Status**` to `Approved` on all four files. Defect `tasks.md` and defect Gherkin use only `Draft | Approved`, never Planning, In Progress, Complete, or In Review.

`**File(s)**:` is optional planning metadata. When present, use the shared canonical grammar: repository-relative paths enclosed in backticks, with multiple entries separated by commas or semicolons. Bounded directory and glob entries are allowed. Optional parenthetical notes may follow an entry; use `(delivery-owner only)` only for an exclusively delivery-owned entry. Never use `**Files**:`, duplicate the declaration, prefix entries with operation prose, join alternatives with `or`, or use placeholders. `parseDeliveryTaskFileLines` may validate declarations, but Acceptance—not `File(s)`—defines task executability and implement/fix mutation authority.

Requirements contain functional context, observable GWT criteria, Functional Requirements, and adjacent-software Out of Scope only. Design contains only details needed to implement retained behavior. Tasks contain only current-issue repository implementation and AC-linked test work. Gherkin contains only AC-linked observable scenarios. Excluded burdens are absent from every file and are never moved into context, design, tasks, comments, Gherkin, Out of Scope, or Open Questions.

## Plan File

Use slug `spec-{N}`. Only after synthesis and the complete feasibility audit pass, write the plan to the plan-mode plan file (its path is in plan mode's system reminder). Each selected issue gets its own complete plan: overwrite the plan file entirely for that issue, never append to a previous issue's plan. Its first line is the heading `# spec-{N}: <title>`, where the title comes from gh or is derived.

The plan contains:

- issue N, slug, title, `classification: feature|bug`, and `targetDir`;
- the current complete `published[]` list;
- the full planned contents of all four files;
- singular Issue and Approved-on-approval frontmatter rules;
- helper commands and existing publication rules; and
- an `Execute Feasibility` table with exact columns `Item`, `Behavior or task`, `Owning stage`, `Mutation/artifact`, `Evidence kind and identity`, `External prerequisite`, and `Disposition`.

Cover every proposed AC, FR, task, and scenario in that table. Use only `retain`, `rewrite`, `omit`, or `control-plane`. Every retained row names an execute-owned realization and proof stage, permitted repository mutation or narrow artifact, accepted evidence identity, and a resolved prerequisite. Use exact paths when known; otherwise the only permitted write-spec placeholder is `outcome-authorized repository mutation; concrete path derived from Acceptance`, and only when no denied or read-only path is required. Evidence must name an AC-linked local test task/command, exact manifest validation/provider id, exact allowlisted PR-check identity, or terminal control proof. `External prerequisite` is exactly `none`, `available:<identity>`, or `unresolved:<description>`; retained rows permit only `none` or repository-proven `available:` values.

Before writing the plan or calling `ExitPlanMode`, audit the complete planned contents of `requirements.md`, `design.md`, `tasks.md`, and `feature.gherkin`. Reject retained rows with blank or unresolved ownership, mutation authority, proof, or prerequisite. Only retained or rewritten content enters the files. The feasibility table, omitted rows, and control-plane rows remain plan-only. No material product choice is deferred to execute.

Every selected issue uses its own plan and its own `ExitPlanMode` call. Discovery and Interview are read-only. Do not run `default-branch` or `prepare`; write files; commit; push; create or merge a pull request; or apply labels for N before that issue's plan is approved.

## Approval Behavior (in plan execution after ExitPlanMode approval)

Plan approval in the `ExitPlanMode` dialog starts this execution. Approval may clear context; the approved plan holds the complete planned file contents, and `published[]` survives because the hooks module holds it.

Exact order after this issue's plan approval:

1. `node "<plugin-root>/scripts/publish-approved-spec.mjs" prepare --issue N --name {N}-{slug}` (`{N}-{slug}` = basename of `targetDir`). Failure → stop, do not write files.
2. Write/overwrite the four spec files with `**Status**: Approved` (existing frontmatter and Change History rules). Fail closed if any written `**Issue**` ≠ `#N`. Never write into a directory whose leading number ≠ `N`.
3. `node "<plugin-root>/scripts/publish-approved-spec.mjs" commit-push --issue N --dir specs/{N}-{slug}`. Failure → stop; leave branch and files. Commit subject is exactly `docs: approve spec for #N`.
4. `node "<plugin-root>/scripts/publish-approved-spec.mjs" merge --issue N --dir specs/{N}-{slug}`. Run it verbatim as the entire `Bash` command: no prefix, suffix, `;` or `&&` chaining, pipe, redirection, or `echo "exit=$?"`. The `Bash` result already reports a non-zero exit, and any decoration keeps the nmg-sdlc hooks module from recognizing the publication. Require and parse the complete JSON response even on non-zero exit. If the response is malformed, or non-zero without `merged: true`, print its `reasonCode` and stop; leave the spec branch and files. A response with `merged: true` means publication succeeded even when checkout or labeling failed: append `N` to `published[]` exactly once, print the PR number and `reasonCode`, run the matching remediation from `references/publish.md`, and report any remediation failure without rewriting or republishing the package. A successful response leaves the helper on the default branch.
5. If `N` was not already recorded from a post-merge failure, append it to in-memory `published[]`.
6. End the execution turn after all documented post-merge remediation finishes. Do not call `candidates` or `AskUserQuestion` in this execution turn. After the turn ends with an empty prompt box, the nmg-sdlc hooks module runs `/plan` and submits the post-publication continuation prompt into native plan mode in the same TUI session; that plan-mode turn carries every `published[]` number and owns Continue/Finished.

If this was an existing undelivered package: append row to ## Change History : | #N | today | Spec revised before delivery |

Initial write uses "Initial feature spec" or "Initial defect report"

## Continue loop

Does not consume interview budget. Invoke:

```text
node "<plugin-root>/scripts/publish-approved-spec.mjs" candidates [--published N ...]
```

Include one `--published N` pair for every number in the in-memory `published[]` list. Require exit 0 and consume the complete `candidates` array. The helper owns GitHub listing, deduplication, numeric sorting, and shared approval filtering; do not repeat those rules.

Use one `AskUserQuestion` question, 2–4 options, recommended first with ` (Recommended)` appended to its label:

- One or more rows: show at most the first three as `#M — {title}` (the first labelled `#M — {title} (Recommended)`), followed by `Finished — stop writing specs`. Extra number entry remains available through automatic Other.
- No rows: `Continue — enter another issue number (Recommended)` and `Finished — stop writing specs`. Other supplies `#M` / `M`.

Finished — print exactly:

```
Published specs: #<n> on <n>-<slug>[, ...]
Next step: /sdlc-execute #<first-published>
```

Stay on the repository default branch (the spec is already merged). End the reply by calling `ExitPlanMode` as its last action, with no other output after it and without another `AskUserQuestion`; the nmg-sdlc hooks module approves that one call, so plan mode ends without an approval dialog.

Continue / candidate / Other `#M`:

- Parse `^#?([1-9]\d*)$`. Invalid → re-ask continue.
- Already in `published[]` → print `Spec already approved for #M.` and re-ask.
- Otherwise set N = M and rerun read-only Discovery. Do not call `default-branch` before M's plan is approved.
- If Discovery returns `spec.approved`:
  - Closed issue → print `Spec already approved for closed issue #M. Open a new issue for follow-up work.` and re-ask.
  - Any other issue state → print `Spec already approved for #M.` and re-ask.
  - Discovery must not stop the session or send an approved package to Interview.
- Only when Discovery returns an unapproved package, run Interview (fresh 3-ask budget), overwrite the plan file with the complete distinct plan headed `# spec-{M}: <title>` with current `published[]`, and call `ExitPlanMode`. Every mutation for M remains in Approval Behavior after that plan is approved.

## Plan approval (every selected issue)

Write the complete plan for N to the plan file, replacing any earlier issue's plan, with the first line:

```text
# spec-{N}: <title from gh or derived>
```

then call `ExitPlanMode`. Never request approval in prose or with `AskUserQuestion`.
