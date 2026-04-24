---
name: write-spec
description: "Create BDD specifications from a GitHub issue: requirements, technical design, and task breakdown. Use when user says 'write specs', 'create specifications', 'spec this issue', 'spec #N', 'formalize requirements', 'how do I write specs', 'how to spec a feature', 'design this feature', or 'plan the implementation'. Do NOT use for creating issues, implementing code, or verifying implementations. Produces requirements.md, design.md, tasks.md, and feature.gherkin with human review gates. Third step in the SDLC pipeline — follows /start-issue and precedes /write-code."
---

# Write Spec

Read `../../references/codex-tooling.md` when the workflow starts — it maps legacy tool wording to Codex-native file inspection, shell, editing, web, interactive-gate, and subagent behavior.

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

1. A GitHub issue exists (created via `/draft-issue` or manually).
2. Steering documents exist in `steering/` (create via `/onboard-project` if missing).
3. Spec directories follow the `feature-{slug}` / `bug-{slug}` convention.
4. The project uses the current directory layout (`steering/` and `specs/` at the repo root).

Read `../../references/legacy-layout-gate.md` when the workflow starts — the gate aborts before Phase 1 if the legacy `.codex/{steering,specs}/` layout is still in place.

Read `../../references/unattended-mode.md` when the workflow starts — every Human Review Gate in this skill is pre-approved (no interactive user prompt, no inline summary) when the `.codex/unattended-mode` sentinel exists.

Read `../../references/steering-schema.md` when you need each steering doc's purpose, read-timing, or discovery rules.

Read `../../references/feature-naming.md` when deriving a `feature-{slug}` / `bug-{slug}` slug or locating an existing spec for an issue.

Read `../../references/spec-frontmatter.md` when writing or amending any spec file's frontmatter (plural `**Issues**`, Change History, defect-spec schema).

---

## Spec Discovery

Read `references/discovery.md` when the issue is not bug-labelled — discovery decides between amending an existing feature spec (parent-link first, keyword fallback) and creating a new one. Bug-labelled issues skip discovery and always create a fresh `bug-{slug}/`. Spike-labelled issues skip Spec Discovery entirely (same as bug-labelled issues) and proceed directly to Phase 0 per `references/spike-variant.md`.

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

**Precedence**: spike > defect. If both labels appear on the same issue (unusual — `/draft-issue` Step 2 forces one classification), load `references/spike-variant.md` and ignore the defect path.

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
3. If `steering/retrospective.md` exists, read it and apply relevant learnings when drafting acceptance criteria — read each learning as a transferable principle and adapt it to the current feature's domain. Example: a learning like "When specifying features that interact with external systems via session-scoped protocols, include ACs for state persistence across invocations" applied to a connection-pool feature becomes: "Given a connection is checked out and used for a query / When the connection is returned to the pool / Then any session-level state (temp tables, variables) is reset before reuse."
4. Read `references/interview.md` when Phase 1 has read the issue and steering docs and is about to enter amendment or creation mode.
5. **In amendment mode**: follow `references/amendment-mode.md` § Phase 1.
6. **In creation mode**:
   1. Create `requirements.md` from [templates/requirements.md](templates/requirements.md) — feature variant by default, defect variant per `references/defect-variant.md` when bug-labelled.
   2. Bootstrap acceptance criteria from the issue body.
   3. Use `**Issues**: #N` (plural even for the first issue) and add the initial Change History entry: `| #N | [today] | Initial feature spec |`.
7. Consult steering docs for project-specific requirements (accessibility, platform support, etc.).

### Output

Write to (or amend) `specs/{feature-name}/requirements.md`.

### Human Review Gate

Read `references/review-gates.md` when this gate fires — § Phase 1 contains the Requirements Summary template and the approve/revise menu.

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
   - Do deeper investigation inline by default. If the user or runner explicitly authorizes subagents, spawn a Codex `explorer` subagent with a bounded read-only question.
3. **In amendment mode**: follow `references/amendment-mode.md` § Phase 2.
4. **In creation mode**:
   1. Create `design.md` from [templates/design.md](templates/design.md) — feature variant by default, defect variant per `references/defect-variant.md` when bug-labelled.
   2. Use `**Issues**: #N` and include an initial Change History entry.
   3. Design the solution per variant:
      - **Feature**: map to the project's architecture layers; design data flow, API changes, database changes, state management; consider alternatives.
      - **Defect**: identify root cause with specific code references, propose the minimal fix, assess blast radius and regression risk.

### Output

Write to (or amend) `specs/{feature-name}/design.md`.

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
   6. Create the Gherkin feature file using [templates/feature.gherkin](templates/feature.gherkin). For defects, tag scenarios `@regression`.

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

Write to (or amend) `specs/{feature-name}/tasks.md` and `specs/{feature-name}/feature.gherkin`.

### Human Review Gate

Read `references/review-gates.md` when this gate fires — § Phase 3 contains the Tasks Summary template.

### Seal-Spec Flow (multi-PR triggered)

After the Phase 3 approval gate, detect a multi-PR delivery trigger. The trigger fires if EITHER:

- `design.md` contains a `## Multi-PR Rollout` heading, OR
- Any FR row's Requirement cell contains `multiple PRs` or `multi-PR` (case-insensitive).

The umbrella spec is not itself a shipping change, so sealing commits the spec without a version bump and (optionally) creates child issues — bypassing `/open-pr`'s normal version-bump path.

#### 3b.1 Offer Seal (interactive) or Auto-Execute (unattended)

- **Interactive mode.** interactive user prompt: `[1] Seal and transition — commit specs/{feature-name}/, push, offer child issue creation` / `[2] Don't seal — I'll handle child-issue creation manually`.
- **Unattended mode.** Auto-execute the seal per 3b.2 (deterministic-default gate per `../../references/unattended-mode.md`).

#### 3b.2 Idempotency Check and Seal Commit

1. Check for an existing seal commit on HEAD: `git log --format=%H --grep="^docs: seal umbrella spec for #{N}$" HEAD`. If a SHA is returned, print `Spec already sealed at commit {sha}` and skip to 3b.3.
2. Otherwise, perform the seal:
   ```bash
   git add specs/{feature-name}/
   git commit -m "docs: seal umbrella spec for #{N}"
   git push origin HEAD
   ```
3. **Scope invariants** (violation is a skill-quality finding):
   - `git add` MUST use the explicit `specs/{feature-name}/` path — never `git add -A` or `git add .`.
   - The seal commit MUST NOT touch `plugin.json`, `marketplace.json`, `CHANGELOG.md`, or `VERSION`.
   - The commit message MUST exactly match `^docs: seal umbrella spec for #\d+$` — this is the idempotency marker other skills grep for.
4. Record the commit SHA as `session.sealCommitSha`.

#### 3b.3 Offer Child-Issue Creation

- **Interactive mode.** After a successful seal, interactive user prompt whether to create child issues now via `/draft-issue` batch mode using the design's Delivery Phases table as input.
- **Unattended mode.** Auto-execute child creation (no prompt).

#### 3b.4 After-Seal Next-Step Hint

```
Umbrella spec sealed at commit {sealCommitSha}.
Children created: #{child1}, #{child2}, ...  (or: "none — create manually later")

Next step: /start-issue #{first-unblocked-child}
```

If no children were created, fall back to: `"Create child issues with /draft-issue and then run /start-issue #{child-number}."`

---

## After Completion

```
Specs written to (or amended in) `specs/{feature-name}/`:
- requirements.md — Acceptance criteria and functional requirements
- design.md — Technical architecture and design decisions
- tasks.md — Phased implementation tasks
- feature.gherkin — BDD test scenarios

[If `.codex/unattended-mode` does NOT exist]: Next step: Run `/write-code #N` to plan and execute implementation.
[If `.codex/unattended-mode` exists]: Done. Awaiting orchestrator.
```

---

## Integration with SDLC Workflow

```
/draft-issue  →  /start-issue #N  →  /write-spec #N  →  /write-code #N  →  /simplify  →  /verify-code #N  →  /commit-push  →  /open-pr #N  →  /address-pr-comments #N
                                                  ▲ You are here
```

## References

- [Spec-Driven Development (Thoughtworks)](https://www.thoughtworks.com/en-us/insights/blog/agile-engineering-practices/spec-driven-development-unpacking-2025-new-engineering-practices)
- [How to Write Good Specs (Addy Osmani)](https://addyosmani.com/blog/good-spec/)
- [SDD Tools Comparison (Martin Fowler)](https://martinfowler.com/articles/exploring-gen-ai/sdd-3-tools.html)
