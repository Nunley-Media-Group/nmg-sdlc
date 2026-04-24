# nmg-plugins Product Steering

This document defines the product vision, target users, and success metrics.
All feature development should align with these guidelines.

---

## Mission

**nmg-plugins provides a BDD spec-driven development toolkit for Codex that transforms GitHub issues into verified, production-ready implementations through a structured SDLC workflow.**

---

## Target Users

### Primary: Developer using Codex

| Characteristic | Implication |
|----------------|-------------|
| Uses Codex daily | Skills must integrate seamlessly with Codex's tool system |
| Works from GitHub issues | Workflow must be issue-driven with branch linking |
| Wants structured process | BDD specs provide guardrails without excessive ceremony |
| Values quality gates | Verification step catches drift before PR |

### Secondary: SDLC Runner (Automation)

| Characteristic | Implication |
|----------------|-------------|
| Headless execution | Skills must detect `.codex/unattended-mode` and skip Plan Mode `request_user_input` gates |
| Deterministic orchestration | Runner script drives steps sequentially with preconditions |
| Log-based reporting | Status updates flow to console and log files |

---

## Core Value Proposition

1. **Structured SDLC workflow** — Transforms vague requirements into verified implementations via issue → spec → implement → verify → PR pipeline
2. **Stack-agnostic BDD** — Works with any language/framework; steering docs customize to the project
3. **Full automation support** — The SDLC runner enables hands-off development cycles

---

## Product Principles

| Principle | Description |
|-----------|-------------|
| Stack-agnostic | Never assume a specific language, framework, or tool — let steering docs provide specifics |
| OS-agnostic | Must work on macOS, Windows, and Linux — no platform-specific assumptions |
| Process over tooling | Provide the workflow structure; project steering provides the technical details |
| Human gates by default | Interactive review at each phase; unattended mode is opt-in for automation |
| Spec as source of truth | All implementation and verification traces back to spec documents |
| Dogfooding | The SDLC develops itself — changes to skills are verified by exercising them in Codex |

---

## Success Metrics

| Metric | Target | Why It Matters |
|--------|--------|----------------|
| Spec-to-implementation fidelity | Zero drift findings on first verify | Validates the spec-driven approach works |
| Skill adoption | All SDLC steps used end-to-end | Proves the workflow is complete and practical |
| Automation reliability | SDLC runner completes full cycles without manual intervention | Validates headless operation |
| Exercise verification | Changed skills verified by invocation against a test project | Validates that skill changes produce correct behavior, not just correct text |

---

## Feature Prioritization

### Must Have (MVP)
- Issue creation with BDD acceptance criteria (`$nmg-sdlc:draft-issue`)
- 3-phase spec writing: requirements, design, tasks (`$nmg-sdlc:write-spec`)
- Spec-driven implementation with plan mode (`$nmg-sdlc:write-code`)
- Verification against specs with architecture review (`$nmg-sdlc:verify-code`)
- PR creation linking issue and specs (`$nmg-sdlc:open-pr`)
- Project initialization and steering bootstrap (`$nmg-sdlc:onboard-project`)

### Should Have
- Issue branch linking and status management (`$nmg-sdlc:start-issue`)
- Defect-specific spec templates (bug label detection)
- Automation mode support (`$nmg-sdlc:run-loop`)

### Could Have
- SDLC runner config generation (`$nmg-sdlc:init-config`)

### Won't Have (Now)
- Multi-repo orchestration
- Non-GitHub issue trackers
- Visual dashboard for spec status

---

## Key User Journeys

### Journey 1: Manual SDLC Cycle

```
1. Developer runs $nmg-sdlc:draft-issue to capture a feature need
2. Runs $nmg-sdlc:start-issue #N to create branch and set status
3. Runs $nmg-sdlc:write-spec #N — reviews requirements, design, tasks at each gate
4. Runs $nmg-sdlc:write-code #N — approves plan, watches execution
5. Runs $nmg-sdlc:verify-code #N — reviews findings, confirms fixes
6. Runs $nmg-sdlc:open-pr #N — reviews PR before submission
```

### Journey 2: Automated SDLC Cycle (Runner)

```
1. Runner picks oldest open issue from milestone
2. Runs each skill sequentially via codex exec subprocesses
3. Auto-approves all gates (unattended mode enabled)
4. Logs status updates at each step
5. Creates PR, monitors CI, merges on green
6. Loops to next issue
```

### Journey 3: Dogfooding — Developing the SDLC with the SDLC

This project uses its own SDLC toolkit to develop itself. The verification step is unique because skills are Markdown instructions, not executable code:

```
1. Developer creates issue for a skill enhancement
2. Runs $nmg-sdlc:write-spec — spec defines expected skill behavior as ACs
3. Runs $nmg-sdlc:write-code — modifies SKILL.md files and templates
4. Runs $nmg-sdlc:verify-code — must exercise the changed skill:
   a. Scaffold a disposable test project
   b. Load the modified plugin: codex exec --cd /path/to/test-project "$nmg-sdlc:skill-name args"
   c. Invoke the changed skill against the test project
   d. For GitHub-integrated skills: evaluate what WOULD be created (dry-run)
   e. Confirm output matches spec ACs
5. Runs $nmg-sdlc:open-pr — PR includes verification evidence
```

The key difference from Journey 1: traditional "run tests" is replaced by "exercise the skill in Codex and evaluate the output."

---

## Intent Verification

Each product principle translates to a verifiable behavioral contract. `$nmg-sdlc:verify-code` should check these when evaluating whether a change serves the product mission.

### Principle → Postcondition Mapping

| Product Principle | Behavioral Contract | Verification Check |
|-------------------|--------------------|--------------------|
| **Stack-agnostic** | Skills must not contain language, framework, or tool-specific instructions | text search changed skill files for technology names (e.g., "React", "Python", "npm") that aren't Codex tool names |
| **OS-agnostic** | No platform-specific paths, commands, or assumptions | text search for hardcoded separators, Bash-only syntax, macOS/Windows/Linux-specific commands |
| **Spec as source of truth** | Every implementation change traces to a requirement in the spec | Each modified file must map to a task in `tasks.md` or an AC in `requirements.md` |
| **Human gates by default** | Interactive approval exists at every decision point | Skills contain `request_user_input` gates, guarded by unattended-mode checks |
| **Process over tooling** | Skills define workflow structure; project details live in steering docs | Skills reference steering docs for conventions, not hardcode them |
| **Dogfooding** | Skill changes are verified by exercise, not just by reading | Changed skills must be loaded via `codex exec --cd` and invoked against a test project |

### Skill Pipeline Contracts

The SDLC pipeline is a chain. Each skill's output is a contract with the next:

```
$nmg-sdlc:draft-issue
  Postcondition: GitHub issue exists with BDD acceptance criteria
  ↓ (issue # feeds into)
$nmg-sdlc:start-issue #N
  Postcondition: Feature branch exists, issue status = In Progress
  ↓ (branch context feeds into)
$nmg-sdlc:write-spec #N
  Postcondition: specs/{feature}/ contains requirements.md, design.md, tasks.md, feature.gherkin
  ↓ (spec files feed into)
$nmg-sdlc:write-code #N
  Postcondition: Code changes implement all tasks
  ↓ (implementation feeds into)
$nmg-sdlc:verify-code #N
  Postcondition: Verification report posted to issue; all ACs pass or deferred items documented
  ↓ (verified implementation feeds into)
$nmg-sdlc:open-pr #N
  Postcondition: PR created linking issue, specs, and verification report
```

When verifying a change to any skill, confirm it preserves these contracts — the postconditions of the changed skill must still satisfy the preconditions of its downstream consumer.

---

## Brand Voice

| Attribute | Do | Don't |
|-----------|-----|-------|
| Technical | Use precise terminology (BDD, Gherkin, SOLID) | Oversimplify or use vague language |
| Concise | Keep skill output focused and actionable | Add verbose explanations or filler |
| Process-oriented | Reference workflow steps and spec documents | Assume ad-hoc development |

---

## Privacy Commitment

| Data | Usage | Shared |
|------|-------|--------|
| GitHub issues/PRs | Read/write via `gh` CLI for workflow | Only within the user's GitHub org |
| Source code | Analyzed locally by Codex | Never transmitted beyond OpenAI API |
| Steering docs | Local project context | Committed to repo at user's discretion |

---

## References

- Technical spec: `steering/tech.md`
- Code structure: `steering/structure.md`
