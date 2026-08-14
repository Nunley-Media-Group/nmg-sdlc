---
name: write-spec
description: "Create BDD specifications from a GitHub issue: requirements, technical design, and task breakdown. Use when user says 'write specs', 'create specifications', 'spec this issue', 'spec #N', 'formalize requirements', 'how do I write specs', 'how to spec a feature', 'design this feature', or 'plan the implementation'. Do NOT use for creating issues, implementing code, or verifying implementations. Produces requirements.md, design.md, tasks.md, and feature.gherkin with human review gates. Third step in the SDLC pipeline — follows $nmg-sdlc:start-issue and precedes $nmg-sdlc:write-code."
---

# Write Spec

Read `../../references/codex-tooling.md` when the workflow starts — it maps legacy tool wording to Codex-native file inspection, shell, editing, web, interactive-gate, and subagent behavior.

Read `../../references/interactive-gates.md` when the workflow reaches any manual-mode user decision, menu, review gate, or clarification prompt — Codex asks through `request_user_input` in Plan Mode, then finalizes a `<proposed_plan>` before execution.

Create BDD specifications from a GitHub issue through three phases — Requirements, Design, Tasks — each ending with a human review gate. Each phase reads at most one variant-specific reference (defect, amendment, discovery) so the typical run only loads the workflow skeleton plus the gates it actually fires.

## Core Principles

| Principle | Description |
|-----------|-------------|
| **Spec-First** | Write specifications before implementation |
| **Issue-Driven** | Every spec traces back to a GitHub issue |
| **Human-in-Loop** | Validate specs at phase gates before proceeding |
| **BDD Tests Required** | Every acceptance criterion becomes a Gherkin test |

## Workflow Overview

```
┌─────────────┐     ┌─────────────┐     ┌─────────────┐     ┌─────────────┐
│  DISCOVER   │────▶│   SPECIFY   │────▶│    PLAN     │────▶│    TASKS    │
│ find/create │     │ requirements│     │  technical  │     │   atomic    │
└─────────────┘     └─────────────┘     └─────────────┘     └─────────────┘
                           ↑                  ↑                   ↑
                       Human Review      Human Review        Human Review
```

## Prerequisites

1. A GitHub issue exists (created via `$nmg-sdlc:draft-issue` or manually).
2. Steering documents exist in `steering/` (create via `$nmg-sdlc:onboard-project` if missing).
3. Spec directories follow the `feature-{slug}` / `bug-{slug}` convention.
4. The project uses the current directory layout (`steering/` and `specs/` at the repo root).

Read `../../references/legacy-layout-gate.md` when the workflow starts — the gate aborts before Phase 1 if the legacy `.codex/{steering,specs}/` layout is still in place.

Read `../../references/steering-schema.md` when you need each steering doc's purpose, read-timing, or discovery rules.

Read `../../references/feature-naming.md` when deriving a `feature-{slug}` / `bug-{slug}` slug or locating an existing spec for an issue.

Read `../../references/spec-frontmatter.md` when writing or amending any spec file's frontmatter (plural `**Issues**`, Change History, defect-spec schema).

Read `../../references/spec-context.md` when Spec Discovery needs related existing specs — parent-link resolution remains first, then bounded metadata ranking decides whether to amend an existing feature spec or create a new one.

Read `../../references/canonical-umbrella-spec.md` when the canonical parent-spec gate resolves a confirmed coordination epic or when the Phase 3 Seal-Spec Flow runs. Resolve the installed plugin root from this skill's path and invoke its status helper against the project root.

---

## Canonical Parent-Spec Gate

Before Spec Discovery, bug/spike variant selection, or any Phase 1 write, resolve the issue's supported label/body/native relationships through `../../references/epic-relationships.md`. Use GraphQL for native relationships and supported `gh issue view` fields for body/labels; never request `parent` through `gh issue view --json`.

- `role = ordinary` or `epic` with its matching shared identity/consistency state → continue unchanged and record no canonical parent.
- `role = inconsistent`, `ambiguous`, or `unverifiable`; any child with a mismatched `identity`/`consistency`; or any claimed child whose `nativeAuthority` is not `native` → stop before discovery or writes and report the exact role, identity, consistency, authority, pairs, signals, and gaps.
- `role = epic-child`, `identity = durable`, `consistency = consistent`, and `nativeAuthority = native` → record `P = parentNumber` and run `node <plugin-root>/scripts/umbrella-spec-status.mjs --project <project-root> --parent-issue P --json`.
- `role = epic-child`, `identity = legacy`, `consistency = legacy`, and `nativeAuthority = native` → record `P = parentNumber`, report the exact missing-label repair recommendation, and run the same parent-mode helper. No other legacy field combination may continue.

Continue only when both the relationship row above is valid and the helper result is `canonical` or `canonical_marker_lost`. A canonical helper result never overrides inconsistent, mismatched, degraded, ambiguous, or unverifiable child identity. Record the returned parent issue, default commit, and canonical `specPath` for the current invocation. For `stranded_recoverable`, `divergent`, `ambiguous`, or `unverifiable`, stop before discovery, variant routing, interviews, or file writes. Report the exact parent/status/path/tree/ref evidence and direct the user to publish through `$nmg-sdlc:write-spec #P` or audit recovery through `$nmg-sdlc:upgrade-project`.

Bug- and spike-labelled child issues still follow their existing creation variants after this gate; they do not amend the parent spec. A feature child may use the recorded canonical path during discovery and may contain approved child-scoped amendments that differ from the baseline tree.

---

## Spec Discovery

Read `references/discovery.md` when the issue is not bug-labelled — discovery decides between amending an existing feature spec (parent-link first, bounded spec-context ranking fallback) and creating a new one. Bug-labelled issues skip discovery and always create a fresh `bug-{slug}/`. Spike-labelled issues skip Spec Discovery entirely (same as bug-labelled issues) and proceed directly to Phase 0 per `references/spike-variant.md`.

The discovery outcome flips the rest of the workflow into one of two modes — **amendment mode** when an existing spec was resolved, otherwise **creation mode**.

Read `references/amendment-mode.md` when amendment mode is active — the per-phase append-only edits live there.

## Defect Detection

After reading the issue in Phase 1, check whether it has the `bug` label:

```bash
gh issue view #N --json labels --jq '.labels[].name'
```

Read `references/defect-variant.md` when any label is `bug` — every phase swaps to the lighter defect template (reproduction + 2–3 ACs, root-cause + minimal-fix design, flat fix→test→verify tasks).

## Spike Detection

After reading the issue in Phase 1, check whether it has the `spike` label (reuse the label result from Defect Detection — do not re-query `gh`):

Read `references/spike-variant.md` when any label is `spike` — the spike variant replaces Phases 1–3 with a single Phase 0: Research that commits a gap-analysis ADR under `docs/decisions/` and ends with a Human Review Gate.

**Precedence**: spike > defect. If both labels appear on the same issue (unusual — `$nmg-sdlc:draft-issue` Step 2 forces one classification), load `references/spike-variant.md` and ignore the defect path.

---

## Phase 1: SPECIFY (Requirements)

### Input

```bash
gh issue view #N
```

Extract the user story, acceptance criteria, functional requirements, and out-of-scope items from the issue body.

### Process

1. Read the issue via `gh issue view #N` and apply Defect Detection (above).
2. Read `steering/product.md` for user context and product vision.
3. If `steering/retrospective.md` exists, read it and apply relevant learnings when drafting acceptance criteria. First reject any Learning or Recommendation that conflicts with the current `steering/product.md`, `steering/tech.md`, or `steering/structure.md`; treat Evidence paths as historical traceability only. Read each surviving learning as a transferable principle and adapt it to the current feature's domain. Example: a learning like "When specifying features that interact with external systems via session-scoped protocols, include ACs for state persistence across invocations" applied to a connection-pool feature becomes: "Given a connection is checked out and used for a query / When the connection is returned to the pool / Then any session-level state (temp tables, variables) is reset before reuse."
4. Read `references/interview.md` when Phase 1 has read the issue and steering docs and is about to enter amendment or creation mode.
5. **In amendment mode**: follow `references/amendment-mode.md` § Phase 1.
6. **In creation mode**:
   1. Draft `requirements.md` content from [templates/requirements.md](templates/requirements.md) — feature variant by default, defect variant per `references/defect-variant.md` when bug-labelled.
   2. Bootstrap acceptance criteria from the issue body.
   3. Use `**Issues**: #N` (plural even for the first issue) and add the initial Change History entry: `| #N | [today] | Initial feature spec |`.
7. Consult steering docs for project-specific requirements (accessibility, platform support, etc.).

### Output

After the Phase 1 Human Review Gate approves the draft, write to (or amend) `specs/{feature-name}/requirements.md`.

### Human Review Gate

Read `references/review-gates.md` when this gate fires — § Phase 1 contains the Requirements Summary template and `request_user_input` review gate.

---

## Phase 2: PLAN (Technical Design)

### Input

- Approved `requirements.md` from Phase 1
- `steering/tech.md` for technical standards
- `steering/structure.md` for code organization patterns

### Process

1. Read steering docs for project architecture and conventions.
2. Explore the codebase to understand existing patterns:
   - Use file search and text search to find related code.
   - Do deeper investigation inline by default. If the user explicitly authorizes subagents, spawn a Codex `explorer` subagent with a bounded read-only question.
3. **In amendment mode**: follow `references/amendment-mode.md` § Phase 2.
4. **In creation mode**:
   1. Draft `design.md` content from [templates/design.md](templates/design.md) — feature variant by default, defect variant per `references/defect-variant.md` when bug-labelled.
   2. Use `**Issues**: #N` and include an initial Change History entry.
   3. Design the solution per variant:
      - **Feature**: map to the project's architecture layers; design data flow, API changes, database changes, state management; consider alternatives.
      - **Defect**: identify root cause with specific code references, propose the minimal fix, assess blast radius and regression risk.

### Output

After the Phase 2 Human Review Gate approves the draft, write to (or amend) `specs/{feature-name}/design.md`.

### Human Review Gate

Read `references/review-gates.md` when this gate fires — § Phase 2 contains the Design Summary template.

---

## Phase 3: TASKS (Implementation Plan)

### Input

- Approved `design.md` from Phase 2
- `steering/structure.md` for file path conventions

### Process

1. **In amendment mode**: follow `references/amendment-mode.md` § Phase 3 for `tasks.md` and § Phase 3 (gherkin) for `feature.gherkin`.
2. **In creation mode**:
   1. Break the design into tasks using [templates/tasks.md](templates/tasks.md) — feature variant by default, defect variant per `references/defect-variant.md` when bug-labelled.
   2. Use `**Issues**: #N` and include an initial Change History entry.
   3. Map tasks to actual file paths in the project (reference `structure.md`).
   4. Define dependencies between tasks. Features map a full dependency graph across phases; defects are linear (fix → test → verify).
   5. Ensure each task has verifiable acceptance criteria and includes BDD testing tasks.
   6. Draft the Gherkin feature file using [templates/feature.gherkin](templates/feature.gherkin). For defects, tag scenarios `@regression`.

### Phasing (Features Only)

| Phase | Purpose | Examples |
|-------|---------|---------|
| Setup | Foundation | Migrations, types, interfaces |
| Backend | Server-side | Repository, service, controller, routes |
| Frontend | Client-side | Models, state management, UI components |
| Integration | Wiring | Navigation, provider registration, cross-feature |
| Testing | Verification | BDD feature files, step definitions, unit tests |

Defect issues skip phasing and use the flat task list (typically T001: Fix, T002: Regression Test, T003: Verify).

### Output

After the Phase 3 Human Review Gate approves the draft, write to (or amend) `specs/{feature-name}/tasks.md` and `specs/{feature-name}/feature.gherkin`.

### Human Review Gate

Read `references/review-gates.md` when this gate fires — § Phase 3 contains the Tasks Summary template.

### Seal-Spec Flow (multi-PR triggered)

After the Phase 3 approval gate, detect a multi-PR delivery trigger. The trigger fires if EITHER:

- `design.md` contains a `## Multi-PR Rollout` heading, OR
- Any FR row's Requirement cell contains `multiple PRs` or `multi-PR` (case-insensitive).

Run this flow only when the Canonical Parent-Spec Gate recorded no coordination parent for the current issue. A feature child amending an already-canonical umbrella inherits the parent's multi-PR design text but must continue to its normal `$nmg-sdlc:write-code #N` handoff; it must not create a child-numbered seal commit or a second umbrella publication PR.

The umbrella spec is not itself a shipping change. Sealing commits the exact spec without a version bump, publishes it through a spec-only pull request to the repository default branch, and blocks child transition until refreshed remote content is canonical. This flow bypasses `$nmg-sdlc:open-pr` because that skill owns versioned implementation delivery.

#### 3b.1 Offer Seal

Ask through `request_user_input` in Plan Mode: `Seal and publish` (commit `specs/{feature-name}/`, push, and create or reuse a spec-only publication PR) or `Do not seal` (leave the approved spec uncommitted for now). Include the selected behavior in the `<proposed_plan>` and auto-execute after acceptance.

#### 3b.2 Seal Exact Scope

1. Validate `N` as a positive issue number and `specs/{feature-name}` as a normalized path below `specs/` with no symlink escape.
2. Search current ancestry for `^docs: seal umbrella spec for #{N}$`.
   - If absent, stage only `specs/{feature-name}/`, inspect the staged name list, and commit with the exact subject `docs: seal umbrella spec for #{N}`.
   - If present, require the spec directory to be clean. A dirty already-sealed spec stops for another reviewed spec amendment; do not hide changes in a duplicate seal.
3. Inspect the selected seal commit with `git diff-tree`. Every changed path must be inside the exact spec directory. Reject `VERSION`, `CHANGELOG.md`, `.codex-plugin/plugin.json`, marketplace files, or any unrelated path.
4. Push only the current sealing branch with `git push origin HEAD`. Record the full seal commit and source tree IDs.

Never use `git add -A`, `git add .`, force-push, a version bump, or a release roll.

#### 3b.3 Classify and Publish

1. Run publication mode from the installed plugin root:

   ```bash
   node <plugin-root>/scripts/umbrella-spec-status.mjs \
     --project <project-root> \
     --spec specs/{feature-name} \
     --source HEAD \
     --json
   ```

2. Handle the Git classification:
   - `canonical` or `canonical_marker_lost` with the expected source tree → continue to 3b.4.
   - `divergent`, `ambiguous`, or `unverifiable` → stop with the exact `reasonCode`, path/tree/ref evidence, and recovery guidance.
   - `stranded_recoverable` → continue below; default still lacks the source tree.
3. Before any publication-ref or PR mutation, verify `git diff --name-only <default-commit>...<full-seal-commit>` contains only `specs/{feature-name}/`. Stop if the seal commit would publish any other path.
4. Derive `publicationHead = nmg-sdlc/spec-publication-N-<first-12-characters-of-source-tree>` per `../../references/canonical-umbrella-spec.md`. Query `refs/heads/{publicationHead}` with `git ls-remote --heads origin`:
   - An existing ref must resolve to the exact full seal commit; otherwise stop with the collision evidence.
   - If absent, create it only with `git push origin <full-seal-commit>:refs/heads/{publicationHead}`.
   - Never create or link this ref with `gh issue develop`, use the issue-linked sealing branch as PR head, or force-push.
5. Build the exact marker from the shared reference. Query all pull requests targeting the detected default branch whose body contains that complete issue/path/tree marker. Require the expected base and inspect every matching head before mutation.
   - One open match on `publicationHead` → run the GitHub closing-semantic gate below; reuse it only when the result is `pending_safe`.
   - One merged match on either the dedicated head or a historical issue-linked head → run the GitHub closing-semantic gate, then rerun the canonical Git helper. Continue only through the merged/recovery rules below.
   - A matching open PR on any other head, a closed-unmerged match, or multiple exact matches → stop with the PR evidence; do not duplicate it.
   - No match → create one PR from `publicationHead` to the detected default branch using a temporary `--body-file`. Title it `docs: publish umbrella spec for #N`, include `Refs #N` rather than a closing keyword, and include the exact marker.
6. After creating or selecting a PR, invoke the installed helper with the exact project, repository, issue, PR, spec path, source tree, seal commit, and default base:

   ```bash
   node <plugin-root>/scripts/umbrella-publication-status.mjs \
     --project <project-root> \
     --repository <owner/name> \
     --issue N \
     --pr <publication-pr-number> \
     --spec specs/{feature-name} \
     --tree <full-source-tree-oid> \
     --source <full-seal-commit> \
     --base <detected-default-branch> \
     --json
   ```

7. Handle the GitHub semantic result:
   - `pending_safe` → report `publication_pending`, stop before child creation, and print its URL plus: `Merge the spec-only publication PR, refresh the default branch, then re-run $nmg-sdlc:write-spec #N.` Never approve or merge it automatically.
   - `closing_relationship`, `closed_unrelated`, or `unverifiable` → report a lifecycle error with `reasonCode`, `gaps`, closing references, issue state, head/base, marker, and timeline evidence. Do not report pending/success or encourage merge.
   - `publication_closed_umbrella` → render the exact marked PR and its repository-qualified currently active `ClosedEvent` evidence. A cleared historical closure or later unrelated active closure is not recoverable here. Ask through `request_user_input` for approval to reopen that exact issue. Only the exact reopen approval permits `gh issue reopen N`; silence, another approval, or a general continuation does not. Rerun the helper and require `merged_safe` with `evidence.recovered = true` before continuing.
   - `merged_safe` → rerun publication mode in `umbrella-spec-status.mjs`; continue only when refreshed content is `canonical` or `canonical_marker_lost` for the expected tree.

An already-merged historical publication may use the former issue-linked head so its exact closure can be diagnosed and recovered. Such a head is never accepted for an open `publication_pending` PR. Ordinary implementation issue closure remains owned by `$nmg-sdlc:open-pr` and is unchanged.

#### 3b.4 Offer Child-Issue Creation After Canonical Proof

Only after a fresh helper result is `canonical` or `canonical_marker_lost` for the expected source tree, ask through `request_user_input` whether to create child issues via `$nmg-sdlc:draft-issue` batch mode using the Delivery Phases table. Include the selected child action in the `<proposed_plan>` and auto-execute after acceptance.

The approved create-children action also owns durable identity persistence:

1. Lazily create the repository `epic` label with color `5319E7` when absent, apply it to current issue `#N`, and re-fetch the issue to prove the label persisted.
2. Pass `N` as the live parent number into the batch flow. Require each child to receive `epic-child-of-N`, the native parent link, and `Depends on: #N` per `references/umbrella-mode.md`; do not rely on an earlier session variable after the write.
3. Re-fetch the parent and every created child, derive the shared result from `../../references/epic-relationships.md`, and require each child to be `role = epic-child`, `parentNumber = N`, `identity = durable`, `consistency = consistent`, and `nativeAuthority = native`. Also require the matching coordination pair to retain a native signal and a body signal before reporting successful handoff.
4. If a label, relationship, or body write partially fails, stop with the exact surviving metadata and repair action. Do not create a replacement child or claim the batch is ready.

#### 3b.5 Canonical Next-Step Hint

```text
Umbrella spec canonical on origin/{defaultBranch} at tree {sourceTree}.
Seal provenance: retained | history marker lost
Children created: #{child1}, #{child2}, ...  (or: none — create manually later)

Next step: $nmg-sdlc:start-issue #{first-unblocked-child}
```

If no children were created, print: `Create child issues with $nmg-sdlc:draft-issue, then run $nmg-sdlc:start-issue #{child-number}.`

---

## After Completion

```
Specs written to (or amended in) `specs/{feature-name}/`:
- requirements.md — Acceptance criteria and functional requirements
- design.md — Technical architecture and design decisions
- tasks.md — Phased implementation tasks
- feature.gherkin — BDD test scenarios

Next step: Run `$nmg-sdlc:write-code #N` to plan and execute implementation.
```

---

## Integration with SDLC Workflow

```
$nmg-sdlc:draft-issue  →  $nmg-sdlc:start-issue #N  →  $nmg-sdlc:write-spec #N  →  $nmg-sdlc:write-code #N  →  $nmg-sdlc:simplify  →  $nmg-sdlc:verify-code #N  →  $nmg-sdlc:open-pr #N  →  $nmg-sdlc:address-pr-comments #N
                                                  ▲ You are here
```

## References

- [Spec-Driven Development (Thoughtworks)](https://www.thoughtworks.com/en-us/insights/blog/agile-engineering-practices/spec-driven-development-unpacking-2025-new-engineering-practices)
- [How to Write Good Specs (Addy Osmani)](https://addyosmani.com/blog/good-spec/)
- [SDD Tools Comparison (Martin Fowler)](https://martinfowler.com/articles/exploring-gen-ai/sdd-3-tools.html)
