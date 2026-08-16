# nmg-sdlc Product Steering

This document defines the product vision, target users, and success metrics. All feature development should align with these guidelines.

---

## Mission

**nmg-sdlc provides a BDD spec-driven development toolkit for Codex that transforms GitHub issues into verified, production-ready implementations through a structured SDLC workflow.**

---

## Target Users

### Primary: Developer using Codex

| Characteristic | Implication |
|----------------|-------------|
| Uses Codex daily | Skills integrate with Codex-native tools and prompts |
| Works from GitHub issues | Work is issue-driven with linked branches and traceable specs |
| Wants structured process | BDD specs provide guardrails without excessive ceremony |
| Values review authority | Every material decision waits for explicit user input |
| Values quality gates | Verification catches implementation drift before delivery |

### Secondary: Team Reviewer or Maintainer

| Characteristic | Implication |
|----------------|-------------|
| Reviews specs and pull requests | Outputs expose acceptance criteria, evidence, and changed-path scope |
| Maintains project conventions | Steering documents remain the project-specific authority |
| Adopts existing codebases | Onboarding and upgrade preserve history and project-authored content |

---

## Core Value Proposition

1. **Structured manual workflow** — executable issue → spec → implement → simplify → verify → exact-head merge → issue closure.
2. **Stack-agnostic BDD** — any language or framework can supply its conventions through steering docs.
3. **Explicit human authority** — review and scope gates never select an answer without the user.
4. **Evidence-backed delivery** — specs, verification results, Git state, and GitHub state remain distinct and auditable.
5. **Safe project adoption** — managed repository assets are additive and upgrade cleanup is ownership-aware.

---

## Product Principles

| Principle | Description |
|-----------|-------------|
| Stack-agnostic | Never assume a language, framework, or tool; project steering provides specifics |
| OS-agnostic | Support macOS, Windows, and Linux without hardcoded platform assumptions |
| Process over tooling | Skills define lifecycle structure; projects define technical choices |
| Human gates | Every surviving decision point waits for explicit user input |
| Spec as source of truth | Implementation and verification trace back to approved spec documents |
| Coordination is not execution | Epics describe cross-child outcomes and topology; children own executable acceptance criteria and delivery |
| Preserve project ownership | Do not overwrite unrelated files, workflows, templates, history, or metadata |
| Dogfooding | Skill changes are verified through contracts and executable exercises |

---

## Success Metrics

| Metric | Target | Why It Matters |
|--------|--------|----------------|
| Spec-to-implementation fidelity | Zero unresolved drift on first verify | Validates the spec-driven approach |
| Pipeline continuity | Every manual stage works end to end | Proves the workflow is practical |
| Terminal delivery integrity | Success requires exact-head merge and executable-issue closure | Prevents PR creation from being overstated as delivery |
| Epic lifecycle integrity | Epics are never started and close only after all direct children and authority checks pass | Keeps coordination state consistent with delivered work |
| Gate integrity | No decision proceeds without explicit user input | Preserves user authority |
| Exercise verification | Changed skills are exercised against disposable projects | Proves behavior, not just prose |
| Managed-asset preservation | Unrelated project content remains byte-for-byte unchanged | Makes onboarding and upgrade safe |
| Cleanup idempotence | Repeated v2 cleanup produces no additional diff | Makes migration predictable |

---

## Feature Prioritization

### Must Have

- Issue grooming with BDD acceptance criteria (`$nmg-sdlc:draft-issue`)
- Linked branch and status management for executable issues (`$nmg-sdlc:start-issue`)
- Coordination-only epics with normal dependency-aware child selection
- Human-reviewed child requirements, design, tasks, and Gherkin plus aggregate/link authority (`$nmg-sdlc:write-spec`)
- Spec-driven implementation planning (`$nmg-sdlc:write-code`)
- Behavior-preserving simplification (`$nmg-sdlc:simplify`)
- Verification, architecture review, and exercise evidence (`$nmg-sdlc:verify-code`)
- Terminal versioned PR delivery, exact-head merge, issue closure, and epic reconciliation (`$nmg-sdlc:open-pr`)
- Review-thread cleanup (`$nmg-sdlc:address-pr-comments`)
- Safe project adoption and managed assets (`$nmg-sdlc:onboard-project`, `$nmg-sdlc:upgrade-project`)
- Read-only lifecycle diagnostics (`$nmg-sdlc:status`)

### Should Have

- Defect-specific spec variants and retrospective learning
- Explicit, digest-bound backlog repair for legacy epic graphs and specs
- Managed contribution gate and structured GitHub issue form
- Historical spec reconciliation for brownfield projects

### Won't Have

- Multi-repository orchestration
- Non-GitHub issue trackers
- A visual workflow dashboard
- A plugin-owned background execution service

---

## Key User Journeys

### Journey 1: Executable Issue to Merged Delivery

```text
1. Draft and approve a groomed issue.
2. Select or start the issue on a linked branch.
3. Approve requirements, design, and implementation tasks.
4. Approve the implementation plan and execute the tasks.
5. Simplify and verify every acceptance criterion.
6. Approve versioning and enter terminal pull-request delivery.
7. Monitor checks, resolve actionable findings, and merge the exact verified head.
8. Prove issue closure and reconcile any now-complete epic ancestors.
```

### Journey 2: Adopt or Upgrade a Project

```text
1. Detect greenfield, brownfield, or initialized state.
2. Create or reconcile root steering/spec documents.
3. Install or refresh contribution guidance, AGENTS context, contribution gate, and issue form.
4. Audit legacy epic graph, aggregate/child authority, ownership, issue state, and Project state without mutation.
5. Present each exact digest-bound repair group for explicit approval and verify a no-op rerun.
6. Report changed, preserved, declined, already-current, and failed outcomes.
```

### Journey 3: Dogfood a Skill Change

```text
1. Define behavior in a feature or defect spec.
2. Route skill-bundled edits through $skill-creator.
3. Run static contract tests and plugin-surface validation.
4. Exercise changed skills in a disposable project.
5. Record local evidence separately from published-install evidence.
```

---

## Intent Verification

| Product Principle | Behavioral Contract | Verification Check |
|-------------------|---------------------|--------------------|
| Stack-agnostic | Skill instructions defer project details to steering | Review changed contracts for hardcoded technology assumptions |
| OS-agnostic | Paths and commands are cross-platform or explicitly scoped | Review path handling and platform dependencies |
| Human gates | Decision points call `request_user_input` and wait | Exercise every changed decision branch |
| Spec as source of truth | Changed paths map to approved tasks or acceptance criteria | Compare diff with `tasks.md` and `requirements.md` |
| Preserve project ownership | Managed paths and overwrite predicates are exact | Run collision, preservation, and repeat-run fixtures |
| Dogfooding | Skill behavior is exercised, not inferred from text alone | Record fixture or live exercise evidence |

### Skill Pipeline Contracts

```text
draft-issue        → executable issues or a coordination-only epic with children
start-issue        → linked branch and In Progress status for executable work; epics excluded
write-spec         → child-owned executable package plus aggregate/link authority when applicable
write-code         → implementation covering approved tasks
simplify           → behavior-preserving cleanup
verify-code        → acceptance/evidence report and scoped fixes
open-pr            → exact-head PR delivery, merge, issue closure, and eligible epic closure
address-pr-comments→ focused review-loop utility or explicit remaining blocker
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
| Source code | Analyzed in the active Codex environment | Per the user's Codex service configuration |
| Steering/spec docs | Project context and committed history | At the user's discretion |

---

## References

- Technical standards: `steering/tech.md`
- Repository structure: `steering/structure.md`
