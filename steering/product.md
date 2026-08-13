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

1. **Structured manual workflow** — issue → spec → implement → simplify → verify → PR → review cleanup.
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
| Preserve project ownership | Do not overwrite unrelated files, workflows, templates, history, or metadata |
| Dogfooding | Skill changes are verified through contracts and executable exercises |

---

## Success Metrics

| Metric | Target | Why It Matters |
|--------|--------|----------------|
| Spec-to-implementation fidelity | Zero unresolved drift on first verify | Validates the spec-driven approach |
| Pipeline continuity | Every manual stage works end to end | Proves the workflow is practical |
| Gate integrity | No decision proceeds without explicit user input | Preserves user authority |
| Exercise verification | Changed skills are exercised against disposable projects | Proves behavior, not just prose |
| Managed-asset preservation | Unrelated project content remains byte-for-byte unchanged | Makes onboarding and upgrade safe |
| Cleanup idempotence | Repeated v2 cleanup produces no additional diff | Makes migration predictable |

---

## Feature Prioritization

### Must Have

- Issue grooming with BDD acceptance criteria (`$nmg-sdlc:draft-issue`)
- Linked branch and status management (`$nmg-sdlc:start-issue`)
- Human-reviewed requirements, design, tasks, and Gherkin (`$nmg-sdlc:write-spec`)
- Spec-driven implementation planning (`$nmg-sdlc:write-code`)
- Behavior-preserving simplification (`$nmg-sdlc:simplify`)
- Verification, architecture review, and exercise evidence (`$nmg-sdlc:verify-code`)
- Versioned PR delivery (`$nmg-sdlc:open-pr`)
- Review-thread cleanup (`$nmg-sdlc:address-pr-comments`)
- Safe project adoption and managed assets (`$nmg-sdlc:onboard-project`, `$nmg-sdlc:upgrade-project`)
- Read-only lifecycle diagnostics (`$nmg-sdlc:status`)

### Should Have

- Defect-specific spec variants and retrospective learning
- Manual epic/sub-issue relationships
- Managed contribution gate and structured GitHub issue form
- Historical spec reconciliation for brownfield projects

### Won't Have

- Multi-repository orchestration
- Non-GitHub issue trackers
- A visual workflow dashboard
- A plugin-owned background execution service

---

## Key User Journeys

### Journey 1: Issue to Review-Clean PR

```text
1. Draft and approve a groomed issue.
2. Select or start the issue on a linked branch.
3. Approve requirements, design, and implementation tasks.
4. Approve the implementation plan and execute the tasks.
5. Simplify and verify every acceptance criterion.
6. Approve versioning and open the pull request.
7. Resolve review findings until the PR is review-clean.
```

### Journey 2: Adopt or Upgrade a Project

```text
1. Detect greenfield, brownfield, or initialized state.
2. Create or reconcile root steering/spec documents.
3. Install or refresh contribution guidance, AGENTS context, contribution gate, and issue form.
4. For upgrades, present exact owned cleanup findings before deletion.
5. Report changed, preserved, declined, already-current, and failed outcomes.
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
draft-issue        → GitHub issue with BDD acceptance criteria
start-issue        → linked branch and In Progress status
write-spec         → approved requirements, design, tasks, Gherkin
write-code         → implementation covering approved tasks
simplify           → behavior-preserving cleanup
verify-code        → acceptance/evidence report and scoped fixes
open-pr            → pushed versioned PR linking issue and specs
address-pr-comments→ review-clean PR or explicit remaining blocker
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
