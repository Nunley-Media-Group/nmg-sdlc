---
name: draft-issue
description: "Interview user about a feature need, create groomed GitHub issue with BDD acceptance criteria. Use when `/sdlc-draft-issue`. Supports feature and bug templates. First step — next is write-spec."
---

# Draft Issue

Read `../../references/codex-tooling.md` when mapping the workflow's read, grep, glob, ask, local-file, and proposal operations to current OMP tools.

Read `../../references/interactive-gates.md` when applying the native `/plan`, `ask`, and `xd://propose` contract.

## Core Flow

1. Gather need: if `$ARGUMENTS` is present, use it as `initialDescription`. Otherwise use one `ask` for the need (free-form through automatic Other when needed, but prefer short).

2. Immediately apply the rendered `/sdlc-execute` eligibility algorithm before multi-issue detection:
   - Extract only functional software behavior and implementation-relevant technical constraints that execute can realize through permitted repository mutation and prove through accepted evidence.
   - Strip legal, policy, ownership-proof, attestation, sign-off, live-operation, and other externally owned motivation or obligations. Never let excluded material create a split issue.
   - Ask only for missing observable software behavior that execute could implement. Never ask for legal interpretation, ownership proof, authority, sign-off, credentials, or live operations.
   - If no eligible software behavior is supplied, print exactly `No software requirements executable by /sdlc-execute remain after excluding non-software obligations.` and stop before plan creation, proposal, or GitHub mutation.

3. If the eligible slice has multi-issue signals (see `references/multi-issue.md`), run detection, then use one `ask` to confirm split with approve split, adjust, or single options.

4. Ask for classification with exactly these two options, recommended first from the eligible behavior:
   - `Enhancement — New capability or improvement to existing behavior (recommended for most)`
   - `Bug — Something is broken or behaving incorrectly`

   Map to `feature | bug`. Never epic. Never spike.

5. If root `VERSION` parses as semver `X.Y.Z`, read it, extract the major, and ask once for `v${major} (current)` or `v${major+1} (next)`, recommended first. Record the milestone or `null`. Approved plan execution ensures a selected milestone exists before issue creation.

6. Investigate with `glob`, `grep`, and `read`; do not use subagents unless scoped:
   - For enhancement/feature, read relevant steering and search bounded source/spec patterns to summarize Current State.
   - For bug, search the error or symbol, read relevant files, and form a root-cause hypothesis.
   - Record signals for interview depth.
   - Reapply the execute eligibility gate to every discovered candidate. Steering may resolve paths, interfaces, validation identities, and project conventions, but its process, release, ownership, or verification-policy prose is not issue content.

7. Interview until every material undiscoverable preference, observable acceptance criterion, and adjacent-software scope boundary is gathered:
   - Use focused asks only for preferences and tradeoffs. Each call has 2–4 options, recommended first, and at most three questions.
   - Each question includes a short paragraph stating the situation and facts needed to choose without relying on past chat.
   - Cover persona/outcome, key ACs, adjacent software scope, and bug reproduction/expected behavior.
   - Ask only about behavior execute can implement and verify. Do not ask for repository facts discoverable by tools or any excluded authority/evidence burden.
   - Do not use `ask` for final approval. Synthesize only after the interview is complete, then propose.
   - Reapply the eligibility gate after the interview. If no eligible behavior remains, emit the exact empty-result diagnostic from step 2 and stop.

8. Synthesize per classification:
   - Read `references/feature-template.md` or `references/bug-template.md` as the execution payload.
   - Fill it from retained or rewritten behavior plus investigation.
   - Preserve bounded technical constraints that execute must implement to change observable behavior, but omit code-level design.
   - For a multi-issue result, assign stable plan-local ids and explicit `blockedBy` references. Do not generate dependency lines in issue bodies.

9. Build per-issue plan entries in topological order (single issue = one entry). Each contains:
   - `planId`: stable kebab-case identifier unique within the plan
   - `classification`: `feature | bug`
   - `title`: concise and verb-first
   - `milestone`: `vX | null`
   - `labels`: `["enhancement"] | ["bug"]`
   - `body`: complete markdown from the selected template without generated dependency fields
   - `blockedBy`: `{ "planId": "..." }` or `{ "issue": 123 }` rows; existing issues only when the eligible need explicitly names or clearly sequences them
   - `ghCreateArgs`: exact argv array, for example `["gh","issue","create","--title",t,"--body",b,"--label",l,...]`
   - an `Execute Feasibility` table with exact columns `Item`, `Behavior or task`, `Owning stage`, `Mutation/artifact`, `Evidence kind and identity`, `External prerequisite`, and `Disposition`

   Cover every proposed AC and FR in the table. Use only the dispositions and value grammar defined by the rendered execute contract. Omitted and control-plane rows remain solely in this plan audit and never enter `body` or `ghCreateArgs.body`.

10. Before creating the plan file, audit every complete issue-body section and the exact `ghCreateArgs.body` against the rendered contract. Only `retain` or rewritten content may appear. Excluded material must not be relocated into Background, Current State, Root Cause, Environment, Technical Notes, Out of Scope, design suggestions, or other context. Out of Scope contains only adjacent software behavior. Reject any retained feasibility row with blank or unresolved ownership, mutation authority, proof, or prerequisite.

11. Derive `slug = "draft-" + kebab(need or first title)` and write the full structured entry list to `local://draft-<slug>-plan.md` only after the final audit passes. Then write this plain text to `xd://propose`:

    ```text
    draft-<slug>
    <chosen primary title>
    ```

Approved execution creates all issues, captures returned numbers, resolves plan-local references, reads numeric REST database ids, preflights the complete official graph through `scripts/issue-dependencies.mjs`, and only then applies approved blocked-by edges. The split and final plan approval authorize those exact writes; do not ask again. After execution, emit `/sdlc-write-spec #N` for each created issue.

## Multi-Issue Notes

- One ask only for split confirm (see references/multi-issue.md for updated rules).

- One plan file covers all; lists in topo order.

- Bodies contain no generated dependency fields; the plan carries official blocked-by edges.

- No epic coordination, no fan-out, no child creation inside this skill.

- Leftover spike issues are upgrade inputs, not a draft-issue type.

## Guidelines

- Title: concise, verb first.

- ACs: Given/When/Then.

- No code-level design in issue bodies; retain bounded technical constraints that `/sdlc-execute` must implement to change observable behavior.

- Scope explicit.
