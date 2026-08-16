---
name: write-spec
description: "Create BDD specifications for an executable GitHub issue, with separate coordination aggregates for epic children. Use when user says 'write specs', 'create specifications', 'spec this issue', 'spec #N', 'formalize requirements', 'how do I write specs', 'how to spec a feature', 'design this feature', or 'plan the implementation'. Epics are never executable spec targets. Do NOT use for creating issues, implementing code, or verifying implementations. Third step in the SDLC pipeline — follows $nmg-sdlc:start-issue and precedes $nmg-sdlc:write-code."
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
3. Executable spec directories follow the `feature-{slug}` / `bug-{slug}` convention; coordination aggregates use `epic-{slug}`.
4. The project uses the current directory layout (`steering/` and `specs/` at the repo root).

Read `../../references/legacy-layout-gate.md` when the workflow starts — the gate aborts before Phase 1 if the legacy `.codex/{steering,specs}/` layout is still in place.

Read `../../references/steering-schema.md` when you need each steering doc's purpose, read-timing, or discovery rules.

Read `../../references/feature-naming.md` when deriving a `feature-{slug}` / `bug-{slug}` slug or locating an existing spec for an issue.

Read `../../references/spec-frontmatter.md` when writing or amending any spec file's frontmatter (plural `**Issues**`, Change History, defect-spec schema).

Read `../../references/issue-spec-scope.md` when creating a feature spec, amending a cumulative feature spec, or validating the completed package. It defines the versioned `issue-scope.json` authority, stable `@SCN...` identifiers, and fail-closed resolver contract shared by downstream lifecycle consumers.

Read `../../references/epic-spec-authority.md` immediately after relationship classification confirms an epic or epic child. It defines the non-executable aggregate, executable child package, bidirectional manifests, deterministic helper, and first/later-child publication boundary.

Read `../../references/deliverable-dependencies.md` when a multi-PR design assigns a task or artifact to one child and another child consumes it. Every such prerequisite must resolve to an extracted baseline issue or a whole-issue dependency before child-package publication.

Before child creation or package publication, inventory every task ID and named artifact assigned to each Delivery Phase. Preserve prerequisite owners before consumers in the approved dependency graph.

Read `../../references/spec-context.md` when Spec Discovery needs related existing specs — parent-link resolution remains first, then bounded metadata ranking decides whether to amend an existing feature spec or create a new one.

Read `../../references/canonical-umbrella-spec.md` when the Epic Role and Authority Gate resolves a confirmed child or legacy evidence requires read-only classification. Resolve the installed plugin root from this skill's path and invoke its status helper against the project root.

---

## Epic Role and Authority Gate

Before Spec Discovery, bug/spike routing, interviews, or writes, resolve fully paged native relationships through `../../references/epic-relationships.md`. Use GraphQL for native parent/sub-issue evidence; never request unsupported `parent` data through `gh issue view --json`.

- `ordinary` continues to normal discovery.
- `epic` stops without mutation: `Epic #E is coordination-only and cannot own an executable spec. Run $nmg-sdlc:write-spec #C for a ready child.` Show ready and blocked executable descendants from fresh dependency evidence.
- `inconsistent`, `ambiguous`, or `unverifiable` stops with the exact signals and gaps.
- `epic-child` requires consistent native authority. Record the complete informational lineage and fully paged direct-child inventory for parent `E`; membership itself never becomes an execution dependency.

For a confirmed child `C`, run child authority first:

```bash
node <plugin-root>/scripts/epic-spec-authority.mjs \
  --project <project-root> --child C \
  --native-children <complete-direct-child-list> --json
```

Route the result without guessing:

1. `valid`: enter existing-child mode and amend only the resolved child package.
2. `child_link_missing`: inspect `--epic E` with the same native inventory.
   - `aggregate_not_authored` enters first-child mode.
   - A valid aggregate whose exact child entry is `planned` enters later-child mode after refreshed default-branch canonical proof.
   - A missing child entry, conflicting path, or other drift is repair-required.
3. Any legacy cumulative package, `repair_required`, or `unverifiable` result stops before file mutation and routes the exact finding to `$nmg-sdlc:upgrade-project`.

Read `references/umbrella-mode.md` for first-child, later-child, and existing-child authoring. First-child mode reviews one aggregate plus one separate child package. Later-child mode reviews only the child and changes only its `epic-scope.json` entry from `planned` to `canonical`. Existing-child mode never appends content to the aggregate or a sibling. Aggregate or sibling changes require a separate, explicit review at the applicable phase gate.

---

## Spec Discovery

Read `references/discovery.md` for ordinary non-bug issues. Epic children bypass keyword discovery: their validated child path and mode are authoritative. Bug-labelled issues create a fresh `bug-{slug}/`; spike-labelled issues proceed to Phase 0 per `references/spike-variant.md`.

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
   4. For a feature spec, initialize `issue-scope.json` from [templates/issue-scope.json](templates/issue-scope.json). Assign every AC, FR, task, and stable scenario ID created for `#N` to that issue's `owned` group; leave `adopted` and `regression` empty unless the reviewed scope explicitly says otherwise. Defect specs use the resolver's singular-issue compatibility path and do not require a manifest.
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
   6. Draft the Gherkin feature file using [templates/feature.gherkin](templates/feature.gherkin). Give every scenario one unique stable `@SCN...` tag. For defects, also tag scenarios `@regression`.

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

For feature creation or amendment, write the approved `issue-scope.json` in the same spec directory, then validate the complete package with:

```bash
node <plugin-root>/scripts/issue-spec-scope.mjs \
  --project <project-root> \
  --spec specs/{feature-name} \
  --issue N \
  --json
```

Continue only for `scoped` or `implicit_single_issue`. A `repair_required` result returns to the Tasks Review Gate with the exact gaps and proposed ownership repair. An `unverifiable` result stops with its `reasonCode` and gaps; never infer ownership or hand off a cumulative spec by treating the whole document as the active issue.

### Human Review Gate

Read `references/review-gates.md` when this gate fires — § Phase 3 contains the Tasks Summary template.

### Aggregate + Active-Child Publication

For first-child and later-child modes, read `references/umbrella-mode.md` and `../../references/canonical-umbrella-spec.md`. After all applicable gates approve:

1. Validate the active child package with `issue-spec-scope.mjs`, then validate the aggregate/link pair with `epic-spec-authority.mjs --child C --native-children ...`. Continue only for `scoped`/`valid` exact results.
2. Stage only the approved paths. First child: the aggregate and active-child directories. Later child: the active-child directory plus the aggregate `epic-scope.json`. Inspect the staged names before committing; no release artifact or unrelated path is eligible.
3. Commit the exact spec publication source, then run:

   ```bash
   node <plugin-root>/scripts/umbrella-spec-status.mjs \
     --project <project-root> \
     --aggregate specs/epic-<slug> \
     --child-spec specs/<type>-<child-slug> \
     --source HEAD --json
   ```

4. For `stranded_recoverable`, derive the dedicated ref and exact aggregate/child marker from `umbrella-publication-status.mjs`. Reuse one exact ref/PR or create one non-closing spec-only PR. Its body uses `Refs #E` and `Refs #C`; it never starts or closes the epic or child. Validate it with the helper's `--epic`, `--child`, `--aggregate`, both tree options, exact source commit, and default base.
5. `pending_safe` reports `publication_pending` and stops before code. After merge, rerun both helpers. Continue only when GitHub returns `merged_safe`, the refreshed pair is `canonical` or `canonical_marker_lost`, and child authority is still `valid` for the same native inventory.
6. Divergence, duplicate/closed publication, closing semantics, changed digest, or incomplete evidence fails closed. Never auto-repair, force-push, touch release artifacts, or fall back to a cumulative epic spec.

For nested lineage, complete the immediate executable child pair first, then
follow `references/umbrella-mode.md` leaf-to-root. Each ancestor step uses the
same helpers with the ancestor aggregate as `--aggregate` and the already
canonical nested epic aggregate as `--child-spec`. It changes only the approved
ancestor manifest/aggregate, creates no nested `epic-link.json`, and keeps both
epics open. Never hand an epic to `issue-spec-scope`, `write-code`, or an
executable-child review gate.

The successful handoff names only the active child package plus the aggregate as bounded context, then prints `$nmg-sdlc:write-code #C`.

### Legacy Cumulative Multi-PR Compatibility

The original cumulative umbrella format is read-only compatibility input. New
writes cannot create, seal, publish, extend, or append children to that format,
and an already-started ordinary issue is never converted into an epic here.

After the Phase 3 gate, detect either a multi-PR trigger in a newly written
ordinary spec or an existing legacy cumulative/marked publication package:

- A new multi-PR trigger with no confirmed epic child authority stops before
  commit, push, issue, label, relationship, or PR mutation. Explain that the
  work must be drafted as a coordination-only epic with separately executable
  children. Preserve the current files and direct the user to
  `$nmg-sdlc:draft-issue` for the epic/child graph; any ownership transfer from
  this package requires an exact `$nmg-sdlc:upgrade-project` proposal.
- An existing cumulative package, historical seal/ref/marker, legacy child
  linkage, or publication-created issue state is classified with
  `umbrella-spec-status.mjs` and `umbrella-publication-status.mjs` for evidence
  only. Report its path/tree/ref/PR/closing evidence and route all graph, package
  split, ownership, Project, close, or reopen action to the per-epic
  `$nmg-sdlc:upgrade-project` repair contract.
- A child whose existing legacy package remains supported at a documented
  downstream compatibility boundary may amend only its already-owned slice.
  It cannot add new cumulative ownership, sibling tasks, or aggregate outcomes.

Never offer the historical seal gate, create a cumulative publication ref/PR,
apply `epic` to a started executable issue, generate children from a cumulative
package, or print a start handoff to an epic. The new Aggregate + Active-Child
Publication section above is the sole write path for epic specifications.

---

## After Completion

```
Specs written to (or amended in) `specs/{feature-name}/`:
- requirements.md — Acceptance criteria and functional requirements
- design.md — Technical architecture and design decisions
- tasks.md — Phased implementation tasks
- feature.gherkin — BDD test scenarios
- issue-scope.json — Issue ownership, adoption, and regression mapping (feature specs)

Next step: Run `$nmg-sdlc:write-code #N` to plan and execute implementation.
```

For an epic child, also report its exact `epic-link.json`, aggregate path,
manifest row, canonical default-branch proof, and informational lineage. State
that the aggregate has no executable tasks/Gherkin and that the epic itself
cannot be started. Print the implementation handoff only for child `#N` after
authority is `valid`.

---

## Integration with SDLC Workflow

```text
$nmg-sdlc:draft-issue  →  $nmg-sdlc:start-issue #<executable>  →  $nmg-sdlc:write-spec #N  →  $nmg-sdlc:write-code #N  →  $nmg-sdlc:simplify  →  $nmg-sdlc:verify-code #N  →  $nmg-sdlc:open-pr #N (review + merge + closure)
                                             ▲ You are here
```

## References

- [Spec-Driven Development (Thoughtworks)](https://www.thoughtworks.com/en-us/insights/blog/agile-engineering-practices/spec-driven-development-unpacking-2025-new-engineering-practices)
- [How to Write Good Specs (Addy Osmani)](https://addyosmani.com/blog/good-spec/)
- [SDD Tools Comparison (Martin Fowler)](https://martinfowler.com/articles/exploring-gen-ai/sdd-3-tools.html)
