# nmg-sdlc Product Steering

This document defines the product vision, target users, and success metrics. All feature development should align with these guidelines.

---

## Mission

**nmg-sdlc is an Oh My Pi extension and a Herdr workflow that turns GitHub issues into verified, production-ready implementations through a spec-driven SDLC.**

It is not a Codex plugin. Users invoke `/sdlc-draft-issue`, `/sdlc-write-spec`, `/sdlc-execute`, and `/sdlc-status` as extension commands.

---

## Target Users

### Primary: Developer in Oh My Pi / Herdr

| Characteristic | Implication |
|----------------|-------------|
| Uses Oh My Pi daily | Public commands are `/sdlc-*`; interactive ones enter native `/plan` with `ask` and `xd://propose` |
| Runs Herdr for delivery | Automated stages run as sibling `omp` panes, not in-process `task` workers |
| Works from GitHub issues | Work is issue-driven with linked branches and traceable specs |
| Wants structured process | BDD specs provide guardrails without excessive ceremony |
| Values quality gates | Verification catches implementation drift before delivery |

### Secondary: Team Reviewer or Maintainer

| Characteristic | Implication |
|----------------|-------------|
| Reviews specs and pull requests | Outputs expose acceptance criteria, evidence, and changed-path scope |
| Maintains project conventions | Steering documents remain the project-specific authority |
| Adopts existing codebases | Onboarding and upgrade preserve history and project-authored content |

---

## Core Value Proposition

1. **Native interactive surface** — `/sdlc-draft-issue`, `/sdlc-write-spec`, `/sdlc-onboard-project`, and `/sdlc-upgrade-project` run inside native `/plan` with `ask` + `xd://propose`.
2. **Automated delivery** — after an approved spec, `/sdlc-execute` drives Herdr `--kind omp` workers until merge or a failed handoff.
3. **Stack-agnostic BDD** — any language or framework supplies conventions through project `steering/`.
4. **One issue, one spec** — `specs/{N}-{slug}/` is owned by a single issue. There is no epic type.
5. **Evidence-backed delivery** — specs, verification results, Git state, and GitHub state remain distinct and auditable.
6. **Safe project adoption** — managed repository assets are additive and upgrade cleanup is ownership-aware.

---

## Product Principles

| Principle | Description |
|-----------|-------------|
| Stack-agnostic | Never assume a language, framework, or tool; project steering provides specifics |
| OS-agnostic | Support macOS, Windows, and Linux without hardcoded platform assumptions |
| Process over tooling | Skills define lifecycle structure; projects define technical choices |
| Native plan for judgment | Interactive skills use built-in `ask` + `xd://propose` inside `/plan` |
| Workers never ask | Automated skills never call `ask`; missing preconditions write a failed handoff |
| Spec as source of truth | Implementation and verification trace back to an approved spec directory |
| Coordination is not a type | Sequencing is `Depends on:` between ordinary issues; there is no epic |
| Preserve project ownership | Do not overwrite unrelated files, workflows, templates, history, or metadata |
| Dogfooding | Skill changes are verified through contracts and executable exercises |

---

## Success Metrics

| Metric | Target | Why It Matters |
|--------|--------|----------------|
| Spec-to-implementation fidelity | Zero unresolved drift on first verify | Validates the spec-driven approach |
| Pipeline continuity | Draft → spec → execute works end to end | Proves the workflow is practical |
| Terminal delivery integrity | Success requires exact-head merge and issue closure | Prevents PR creation from being overstated as delivery |
| Dependency integrity | Blocked `Depends on:` parents keep an issue out of execute | Keeps sequencing honest |
| Gate integrity | Interactive skills wait in `/plan`; workers never call `ask` | Preserves user authority without blocking Herdr |
| Exercise verification | Changed skills are exercised against disposable projects | Proves behavior, not just prose |
| Managed-asset preservation | Unrelated project content remains byte-for-byte unchanged | Makes onboarding and upgrade safe |
| Cleanup idempotence | Repeated upgrade produces no additional diff | Makes migration predictable |

---

## Feature Prioritization

### Must Have

- Issue grooming with BDD acceptance criteria (`/sdlc-draft-issue`)
- Approved specs for one issue (`/sdlc-write-spec #N`)
- Automated delivery through Herdr (`/sdlc-execute [#N …]`)
- Linked branch and status management (`start-issue` worker)
- Spec-driven implementation (`write-code` + bundled `simplify`)
- Verification and architecture review (`verify-code`)
- Terminal versioned PR delivery, exact-head merge, and issue closure (`open-pr`)
- Review-thread cleanup (`address-pr-comments`)
- Safe project adoption and managed assets (`/sdlc-onboard-project`, `/sdlc-upgrade-project`)
- Read-only lifecycle diagnostics (`/sdlc-status`)

### Should Have

- Defect-specific spec variants and retrospective learning
- Explicit, digest-bound upgrade for legacy epic graphs and cumulative specs
- Managed contribution gate and structured GitHub issue form
- Historical spec reconciliation for brownfield projects

### Won't Have

- Multi-repository orchestration
- Non-GitHub issue trackers
- A visual workflow dashboard
- A plugin-owned background execution service
- Epic types, labels, or aggregate spec directories as current product
- Spike types, labels, ADR-only specs, or spike skip paths as current product

---

## Key User Journeys

### Journey 1: Executable Issue to Merged Delivery

```text
1. /sdlc-draft-issue
2. /sdlc-write-spec #N
3. /sdlc-execute [#N …]
4. Herdr workers start, implement, verify, and deliver until exact-head merge and issue close
```

### Journey 2: Adopt or Upgrade a Project

```text
1. /sdlc-onboard-project or /sdlc-upgrade-project
2. Detect greenfield, brownfield, or initialized state
3. Create or reconcile root steering/spec documents
4. Install or refresh contribution guidance, AGENTS context, contribution gate, and issue form
5. Detect and propose packaging, rename, split, and epic-flatten mutations
6. Apply only after plan approval and report changed, preserved, declined, already-current, and failed outcomes
```

### Journey 3: Dogfood a Skill Change

```text
1. Define behavior in a feature or defect spec
2. Route skill-bundled worker edits through the skill-creator file if present on disk, else `skill_creator_missing`
3. Run static contract tests and plugin-surface validation
4. Exercise changed skills with omp --print --no-session
5. Record local evidence separately from published-install evidence
```

---

## Intent Verification

| Product Principle | Behavioral Contract | Verification Check |
|-------------------|---------------------|--------------------|
| Stack-agnostic | Skill instructions defer project details to steering | Review changed contracts for hardcoded technology assumptions |
| OS-agnostic | Paths and commands are cross-platform or explicitly scoped | Review path handling and platform dependencies |
| Native plan for judgment | Interactive skills use `ask` + `xd://propose` inside `/plan` | Exercise draft/spec/onboard/upgrade outside `/plan` (print-and-stop) and inside `/plan` |
| Workers never ask | Automated skills write failed handoffs instead of calling `ask` | Contract-test SKILL.md files and exercise missing-precondition paths |
| Spec as source of truth | Changed paths map to approved tasks or acceptance criteria | Compare diff with `tasks.md` and `requirements.md` |
| Preserve project ownership | Managed paths and overwrite predicates are exact | Run collision, preservation, and repeat-run fixtures |
| Dogfooding | Skill behavior is exercised, not inferred from text alone | Record fixture or live exercise evidence |

### Skill Pipeline Contracts

```text
draft-issue        → ordinary feature or bug issues
write-spec         → approved specs/{N}-{slug}/
execute            → Herdr worker pipeline to exact-head merge
start-issue        → linked branch and In Progress status
write-code         → implementation covering approved tasks + bundled simplify
verify-code        → acceptance/evidence report
open-pr            → exact-head PR delivery, merge, and issue closure
address-pr-comments→ focused review-loop utility or failed intervention handoff
status             → read-only lifecycle report; recommend execute or write-spec
```

Each skill's postconditions must continue to satisfy its downstream consumer's preconditions.

---

## Brand Voice

| Attribute | Do | Don't |
|-----------|-----|-------|
| Technical | Use precise terms such as BDD, Gherkin, and mergeability | Use vague claims |
| Concise | Keep outputs focused and actionable | Add filler or ritual |
| Evidence-led | Distinguish observed state from inference | Overstate completion |
| Collaborative | Present choices and consequences clearly | Seize user authority |

---

## Privacy Commitment

| Data | Usage | Shared |
|------|-------|--------|
| GitHub issues/PRs | Read or write only for the requested workflow | Only within the user's authorized GitHub scope |
| Source code | Analyzed in the active OMP / Herdr session | Per the user's host configuration |
| Steering/spec docs | Project context and committed history | At the user's discretion |

---

## References

- Technical standards: `steering/tech.md`
- Repository structure: `steering/structure.md`
