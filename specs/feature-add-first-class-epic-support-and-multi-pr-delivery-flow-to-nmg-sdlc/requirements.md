# Requirements: First-Class Epic Support and Multi-PR Delivery Flow

**Issues**: #149, #177
**Date**: 2026-08-16
**Status**: Draft
**Author**: Rich Nunley

---

## User Story

**As an** nmg-sdlc plugin maintainer (interactive) and as the SDLC runner (automated)
**I want** the SDLC to natively handle features that span multiple PRs — with first-class epic planning, a seal-spec flow, and child-issue-aware pipeline steps
**So that** I never have to improvise coordination structures on top of the pipeline when a feature's scope exceeds what one PR can safely deliver

---

## Background

The current pipeline assumes a strict 1:1:1 relationship: one GitHub issue → one spec directory → one branch → one PR. This breaks down in two legitimate ways:

1. **Discovery during spec writing** — `/write-spec` produces a design that calls for multiple PRs (e.g., additive infrastructure first, then pilot, then bulk rollout). There is no pipeline step for committing the umbrella spec and transitioning to child-issue work without opening a code PR or bumping the version.

2. **Intentional up-front epic planning** — a developer knows before writing any spec that a feature is too large for a single PR and wants to plan it as a coordinated set of issues from the start.

Today's workaround (observed in issue #138): write a spec that describes 4 PRs, manually convert the parent issue's body into a tracking checklist, run `/draft-issue` in batch mode to create children, then manually guide `/write-spec` on each child to amend the correct parent spec. None of these steps are SDLC-native.

See [issue #149](https://github.com/Nunley-Media-Group/nmg-plugins/issues/149) for full context.

---

## Acceptance Criteria

**IMPORTANT: Each criterion becomes a Gherkin BDD test scenario.**

### AC1: Epic Classification and Auto-Detection in /draft-issue

**Given** a user description with cross-cutting signals (references to multiple delivery phases, "in phases", "multiple PRs", or `distinctComponents ≥ 4` with `sentenceCount ≥ 3`)
**When** `/draft-issue` reaches Step 2 (classification)
**Then** it offers "Epic" as a third option alongside Feature and Bug, with a one-line explanation: "A coordinated set of child issues delivering one logical feature across multiple PRs"
**And** when Epic is selected, the child-issue creation flow begins immediately within the same session (reusing the existing batch mechanism from Steps 1b–1d)
**And** in unattended mode, Epic is never auto-selected — the classifier defaults to Feature unless the issue description contains an explicit `Type: epic` declaration in a machine-parseable form, preventing a runner from misclassifying a borderline feature as an epic without human confirmation

### AC2: Epic Issue Body Format

**Given** an Epic classification selected in Step 2
**When** Step 6 synthesizes the issue body
**Then** the body uses the Epic coordination template with these sections in order:
- **Goal** — 1–3 sentences describing what this epic delivers when all children are done
- **Delivery Phases** — a table with columns `Phase | Child Issue | Depends On | Summary`, one row per planned PR
- **Success Criteria** — a one-line delegation note: "Each child issue owns its own acceptance criteria — this epic is a coordination document only"
- **Child Issues** — a GitHub task-list checklist (populated by Step 10 once children are created)
**And** no User Story, no implementation ACs, no FRs — the epic is a coordination document only
**And** the issue is labeled `epic` (created automatically if absent) in addition to `enhancement`

### AC3: Seal-Spec Flow

**Given** a `/write-spec` run that produces a design whose `design.md` contains either a `## Multi-PR Rollout` section OR an FR row whose Requirement text references "multiple PRs"
**When** the user approves the tasks in Phase 3
**Then** `/write-spec` offers a "Seal and transition" option that:
- Stages all files under `specs/{feature-name}/` and commits with message `docs: seal umbrella spec for #N`
- Pushes the current branch (no version bump, no CHANGELOG entry, no `plugin.json` or `marketplace.json` modification)
- Offers to create child issues using the `/draft-issue` batch mechanism from Steps 1b–1d
- Prints the next-step command `/start-issue #{child1}` for the first unblocked child
**And** if the user declines child-issue creation, the seal commit still happens and a manual next-step hint is printed
**And** re-running seal-spec on an already-sealed spec is a no-op that prints "Spec already sealed at commit {sha}" and does not create a duplicate commit
**And** in unattended mode, the seal-spec flow executes automatically whenever the multi-PR trigger is present, and child issues are created via the batch mechanism without prompting

### AC4: Child /write-spec Finds Parent Spec by Issue Link

**Given** a child issue whose body contains a `Depends on: #N` line, a `Blocks: #N` line, OR whose GitHub sub-issue parent field resolves to issue #N
**When** `/write-spec` runs on the child issue
**Then** it locates the parent spec directory by the following procedure, in this order:
1. Parse the child's body for `Depends on:` / `Blocks:` lines; collect candidate parent issue numbers
2. Query the GitHub sub-issue parent field via `gh issue view --json parent` and add it to the candidate list if non-null
3. Glob `specs/*/requirements.md` and read each file's `**Issues**` frontmatter field; match any candidate parent number against that list
4. If found: enter amendment mode against that spec (append the child issue number to the `**Issues**` field, add child-scoped tasks in a new phase, add a Change History entry)
**And** if the parent spec directory does not yet exist (not committed) but a candidate parent was found, the skill fails loudly with message: `Parent spec for #N not found — run '/write-spec #N' and seal the spec before starting child work`
**And** if no candidate parent is found in the child issue body or GitHub parent field, the skill falls back to the existing keyword-based spec discovery
**And** parent-link resolution uses cycle detection (a visited-set of issue numbers) so a pathological graph where #A depends on #B and #B depends on #A terminates with an error rather than looping

### AC5: Intermediate vs Final PR Versioning in /open-pr

**Given** a PR for a child issue that has one or more sibling issues (other issues sharing the same epic parent)
**When** `/open-pr` runs
**Then** it determines sibling state by:
1. Identifying the parent epic issue (via the child's `Depends on:` body link or GitHub parent field)
2. Listing all open issues that share that parent or are referenced in the parent's Child Issues checklist
3. Excluding the current issue from that list
**And** if all siblings are closed with merged PRs: apply a **minor** version bump (feature complete)
**And** if any sibling is still open or has no merged PR: apply a **patch** version bump (intermediate delivery)
**And** the CHANGELOG entry for intermediate PRs appends a note to the primary bullet: `(partial delivery — see epic #N)` where `#N` is the parent epic number
**And** the determined bump type is stored in the PR body under a `**Bump:** patch|minor (epic child: intermediate|final)` line so reviewers can verify the classification

### AC6: SDLC Runner Topological Ordering

**Given** an epic with child issues that have `Depends on:` body cross-refs, `Blocks:` body cross-refs, or native GitHub sub-issue links
**When** the SDLC runner selects the next issue to process from a milestone
**Then** it builds a dependency graph from all three signal types
**And** it processes a child issue only when every issue it `Depends on` has a merged PR (either `gh issue view --json state` is `CLOSED` AND `gh issue view --json closedByPullRequestsReferences` includes at least one merged PR, or the dependency is itself an epic whose own children are all merged)
**And** if a candidate issue is blocked, the runner emits a log line `[runner] skipping #N — blocked by unmerged dependencies: #A, #B` and moves to the next unblocked issue in the milestone queue
**And** if every open issue in the milestone is blocked (circular or broken graph), the runner exits with non-zero code and a diagnostic message naming every issue and its unresolved blockers
**And** when re-entering the runner after a crash or restart, dependency evaluation is re-derived from GitHub state (not cached in `sdlc-state.json`) so stale cache never causes a blocked issue to run prematurely

### AC7: Edge Cases Handled

Each scenario below must fail loudly with a specific, actionable message — no silent bad state, no partial writes, no infinite retry.

**AC7a: Parent epic closed before all children merge**
- **Given** an epic issue #E is closed on GitHub while one or more child issues remain open
- **When** `/open-pr` runs for a still-open child of #E
- **Then** the skill warns `Epic #E is closed but child #N is still open — confirm the epic was not closed prematurely` and prompts for confirmation before proceeding (in unattended mode, the runner escalates and exits without creating the PR)

**AC7b: Child PR merged out of topological order**
- **Given** child #B depends on #A per the epic's dependency graph
- **When** #B's PR is merged before #A's PR is merged (e.g., by an admin override)
- **Then** the next runner tick detects this via the pre-merge dependency check on `/open-pr` and logs a warning; subsequent children with `Depends on: #B` are permitted to proceed because #B's merge status is authoritative regardless of order

**AC7c: Child /write-spec run before parent spec is committed**
- **Given** a child issue whose `Depends on: #N` points to an epic whose spec directory has not been committed to the branch `/write-spec` is reading
- **When** `/write-spec` runs on the child
- **Then** it aborts with message `Parent spec for #N not found — run '/write-spec #N' and seal the spec before starting child work`, and does not create any spec files for the child

**AC7d: Two child PRs race to bump plugin.json**
- **Given** two child PRs are simultaneously open, both bumping `plugins/nmg-sdlc/.codex-plugin/plugin.json` and `.codex-plugin/marketplace.json`
- **When** the second PR attempts to push after the first merges
- **Then** `/open-pr` detects the stale base via `git fetch origin && git merge-base --is-ancestor HEAD origin/main` returning non-zero after bump-and-commit, automatically rebases, re-computes the bump against the now-current version in `plugin.json`, and re-pushes; if rebase has conflicts in either version file, it escalates with a conflict message and does not force-push

### AC8: Unattended-Mode Determinism for New Gates

**Given** `.codex/unattended-mode` exists in the project directory
**When** any new interactive gate introduced by this feature is reached (Epic classification in `/draft-issue`, seal-spec flow in `/write-spec`, Epic-closure warning in `/open-pr`)
**Then** each gate has a documented deterministic default:
- Epic classification: never auto-selected — defaults to Feature unless explicit `Type: epic` signal
- Seal-spec flow: auto-executes when trigger conditions are met
- Epic-closure warning (AC7a): escalates via runner escalation sentinel and exits non-zero rather than auto-confirming
**And** no new gate calls `interactive prompt` without first checking for `.codex/unattended-mode`

---

## Issue #177 Contract Supersession

Issue #177 preserves the original #149 contract as historical evidence while
replacing the parts that treated an epic as executable work or made one
cumulative parent package the delivery authority for every child. The current
contract is resolved by active issue scope: #149 retains ownership of AC1-AC8
and FR1-FR8; #177 owns AC9-AC20 and FR9-FR25.

| Historical contract | Current authority | Supersession |
|---------------------|-------------------|--------------|
| AC3 / FR3: run `write-spec` on the epic and seal its package before child work | AC12-AC14 / FR13-FR16 | The first executable child establishes the aggregate contract and its separate child package; the epic is never started. |
| AC4 / FR4: every child amends one cumulative parent spec and missing content directs `write-spec #E` | AC12-AC14 / FR13-FR16 | Each child has a separately authoritative linked package; missing or ambiguous authority fails closed in the child workflow. |
| AC5 / FR5: `open-pr` classifies only the version bump | AC15-AC17 / FR17-FR20 | Sibling-aware bump classification remains, while delivery completion now requires the terminal monitor/remediation/merge loop and parent reconciliation. |
| AC7a and AC7c: warn about premature closure or require an epic-authored spec | AC12, AC15, AC18, AC19 | New work prevents epic execution; approved repair handles legacy premature state and legacy spec authority. |
| Design lifecycle steps that start and spec the epic before the first child | AC9-AC14 | Epics are coordination-only and the first ready child owns the specification transition. |
| Out-of-scope exclusions for `upgrade-project` and pre-existing epic migrations | AC19 / FR21-FR23 | Exact, approved backlog and spec-authority repair is now required. |
| Out-of-scope exclusion for `onboard-project` | AC20 / FR24 / T030 | Onboarding guidance and distributed templates must teach the coordination-only epic lifecycle, so this exclusion is superseded. |

### Issue #177 User Story Amendment

**As an** nmg-sdlc contributor
**I want** epics to coordinate executable child work without becoming
executable work themselves
**So that** selection, specifications, delivery, closure, and existing backlogs
remain coherent

### AC9: Automatic Discovery Selects Executable Work Only

**Given** an automatic `start-issue` candidate window contains ordinary issues,
epic children, and confirmed epics
**When** readiness filtering and bounded shortlist backfill run
**Then** confirmed epics are excluded before the target choice count is evaluated
**And** ready ordinary issues and epic children remain eligible under their
normal execution-dependency rules

### AC10: Explicit Epic Starts Are Coordination-Only

**Given** a user explicitly invokes `start-issue` for a confirmed epic
**When** the command resolves the epic and its fully paged child graph
**Then** it creates or checks out no branch and changes no issue or Project status
**And** it explains that the epic is coordination-only
**And** it presents the epic's currently ready children instead

### AC11: Epic Membership Is Visible but Never an Execution Dependency

**Given** a selectable issue belongs to one or more levels of nested epic coordination
**When** `start-issue` presents that issue
**Then** the option shows the full resolved epic number-and-title lineage as
informational context
**And** epic membership contributes no blocking edge or topological in-degree
**And** genuine sibling, external, and deliverable dependencies retain their
existing readiness semantics

### AC12: The First Child Establishes Aggregate and Child Specifications

**Given** a confirmed epic has no canonical aggregate spec and one of its ready
children enters `write-spec`
**When** the requirements, design, tasks, and publication gates are approved
**Then** the workflow creates an aggregate epic contract and a separately
authoritative spec package for that child
**And** the approved initial spec set reaches the canonical default branch
without closing or starting the epic
**And** the child can continue only after canonical and relationship evidence is
refreshed and valid

### AC13: Aggregate and Child Authority Do Not Overlap

**Given** an epic has an aggregate contract and one or more linked child specs
**When** their scope and traceability are validated
**Then** the aggregate owns cross-child outcomes, constraints, and dependency
topology but no executable tasks
**And** every delivery and verification obligation has exactly one authoritative
child-spec owner
**And** aggregate-to-child traceability is explicit without duplicated ownership
or silently copied requirements

### AC14: Later Children Receive Independent Spec Packages

**Given** the aggregate contract is canonical and a later ready child enters
`write-spec`
**When** the child scope is reviewed
**Then** the workflow creates or amends that child's separately linked spec package
**And** it preserves other child packages and the aggregate contract unless an
explicit aggregate amendment is approved
**And** missing, conflicting, duplicated, or ambiguous authority fails closed
before code work

### AC15: Pull-Request Delivery Continues Until Merge

**Given** a verified child is delivered through `open-pr`
**When** its pull request has pending checks, actionable review findings, or
remediable mergeability problems
**Then** the workflow creates or resumes the same delivery, monitors CI and
reviews, applies safe in-scope fixes, reverifies, pushes, and repeats
**And** it never reports the issue or `open-pr` lifecycle complete merely because
the pull request exists or is ready
**And** it returns incomplete only with one exact blocker that cannot be resolved
within authorized repository scope

### AC16: Merge Evidence Is Complete and Current

**Given** the delivery loop is preparing to merge
**When** it evaluates the live pull request head
**Then** every configured check is success-equivalent, review threads and
requested changes are clear, and `mergeStateStatus` is `CLEAN`
**And** the workflow merges the exact validated head
**And** it verifies the merged state and the child issue's resulting closed state
before reporting completion

### AC17: The Merged Final Child Closes Its Epic

**Given** a merged child pull request has closed the current issue
**When** the workflow fully rehydrates the confirmed parent and every native
direct child
**Then** it closes the open parent only when every child is closed and the
coordination/spec evidence is complete and consistent
**And** it reconciles the epic's readable Project status to Done
**And** it re-fetches and verifies the resulting issue and Project state

### AC18: Nested and Unverifiable Graphs Fail Safely

**Given** an eligible epic is itself a child of another epic
**When** the inner epic closes
**Then** completion is re-evaluated leaf-to-root until an incomplete parent is reached
**And** a cycle, incomplete page, zero-child epic, conflicting relationship,
unresolved child, spec-authority gap, or unreadable required state stops closure
with exact evidence
**And** no unrelated epic or dependency is mutated

### AC19: Existing Backlogs Can Be Repaired Explicitly

**Given** `upgrade-project` finds legacy or drifted epic graphs, aggregate specs,
child scopes, checklists, Project states, or issue states
**When** it audits the current repository
**Then** it renders exact per-epic proposals for aggregate/child spec separation,
executable ownership transfer, relationship/checklist repair, stale-complete
closure, premature-closure reopening, and nested reconciliation
**And** each mutation group requires explicit per-epic approval and fresh
pre-write drift validation
**And** approved executable ownership moves from the epic to an exact child spec
with a durable migration record
**And** an ambiguous mapping is preserved without mutation and routed to an
explicit child-drafting decision
**And** post-apply proof and a repeated audit demonstrate idempotence

### AC20: Documentation and Distributed Templates Match the Contract

**Given** the epic lifecycle changes are implemented
**When** repository and consumer-facing documentation assets are audited
**Then** README, repository `CONTRIBUTING.md`, the shared contribution-guide
generator, onboarding and upgrade guidance, write-spec templates, issue forms,
contribution-gate remediation text, and every other affected distributed
template describe the same coordination-only lifecycle
**And** contribution guidance explains selection, aggregate/child spec authority,
terminal pull-request delivery, closure, and approved backlog repair
**And** contract tests and disposable-repository exercises prove the documentation
and runtime behaviors remain aligned

---

### Generated Gherkin Preview

```gherkin
Feature: First-Class Epic Support and Multi-PR Delivery Flow
  As an nmg-sdlc maintainer and the SDLC runner
  I want native SDLC support for epics that span multiple PRs
  So that I never have to improvise coordination on top of the pipeline

  Scenario: Epic classification offered when multi-phase signals detected
    Given a user description containing "in phases" or references to multiple delivery PRs
    When /draft-issue reaches classification
    Then Epic is offered as a third option alongside Feature and Bug

  Scenario: Epic body uses coordination template
    Given Epic is selected in classification
    When the issue body is synthesized
    Then it contains Goal, Delivery Phases table, delegated Success Criteria, Child Issues checklist
    And no User Story, ACs, or FRs are present

  Scenario: Seal-spec commits the umbrella spec without version bump
    Given /write-spec produces a design calling for multiple PRs
    When the user approves the tasks in Phase 3
    Then "Seal and transition" commits specs/{feature}/ with message "docs: seal umbrella spec for #N"
    And no version bump or CHANGELOG entry is created

  Scenario: Child /write-spec resolves parent via issue link
    Given a child issue whose body contains "Depends on: #N" and N has a committed spec
    When /write-spec runs on the child
    Then the child's content is appended to specs/{parent-feature}/ as an amendment

  Scenario: Parent spec missing fails loudly on child write-spec
    Given a child issue whose "Depends on: #N" resolves to an uncommitted parent spec
    When /write-spec runs on the child
    Then it aborts with a message naming #N and the required fix

  Scenario: Intermediate PR gets patch bump
    Given a child PR whose sibling issues are still open
    When /open-pr runs
    Then a patch bump is applied and the CHANGELOG entry includes "(partial delivery — see epic #N)"

  Scenario: Final PR in series gets minor bump
    Given a child PR whose sibling issues are all closed with merged PRs
    When /open-pr runs
    Then a minor bump is applied and no partial-delivery note appears

  Scenario: Runner skips blocked children
    Given child #B depends on #A and #A's PR is not yet merged
    When the runner selects the next issue to process
    Then #B is skipped with a log line naming its blockers and the next unblocked issue is processed

  Scenario: Runner exits when every issue is blocked
    Given every open issue in the milestone has unmerged dependencies
    When the runner attempts to select the next issue
    Then it exits non-zero with a diagnostic listing every blocked issue and blocker

  Scenario: Parent-link cycle detected
    Given issue #A's body lists "Depends on: #B" and issue #B's body lists "Depends on: #A"
    When /write-spec runs on either
    Then parent resolution terminates with a cycle-detected error naming both issues

  Scenario: Unattended-mode defaults are deterministic
    Given .codex/unattended-mode exists
    When any new gate is reached (Epic classification, seal-spec, epic-closure warning)
    Then the documented default fires without invoking interactive prompt
```

---

## Functional Requirements

| ID | Requirement | Priority | Notes |
|----|-------------|----------|-------|
| FR1 | Add "Epic" as a third classification in `/draft-issue` Step 2, with auto-detection heuristic and explicit `Type: epic` unattended-mode signal | Must | Builds on existing Feature/Bug classifier |
| FR2 | Implement the Epic body template in `/draft-issue` Step 6 (Goal, Delivery Phases table, delegated Success Criteria, Child Issues checklist) and apply the `epic` label | Must | New template file in `draft-issue/templates/` |
| FR3 | Add the seal-spec flow at the end of `/write-spec` Phase 3 when the design calls for multiple PRs | Must | Inline in `/write-spec` — no new skill |
| FR4 | Modify `/write-spec` spec discovery to resolve parent spec by issue link (body cross-refs + GitHub parent field) before falling back to keyword search | Must | Must include cycle detection |
| FR5 | Modify `/open-pr` to check sibling issue states and apply patch vs minor bump accordingly; add partial-delivery CHANGELOG note; record classification in PR body | Should | Reuses existing version-bump logic |
| FR6 | Modify `sdlc-runner.mjs` to build a topological queue from child-issue dependency links and skip blocked issues; derive graph fresh each tick | Could | Must not cache graph in `sdlc-state.json` |
| FR7 | Add explicit error handling for all four AC7 edge cases with specific, actionable messages | Must | No silent failures, no partial writes |
| FR8 | Every new gate (Epic classification, seal-spec flow, epic-closure warning) has a documented deterministic unattended-mode default | Must | Guards every `interactive prompt` with `.codex/unattended-mode` check |
| FR9 | Exclude confirmed epics before automatic candidate-target counting and bounded backfill completion | Must | Coordination containers are never executable candidates |
| FR10 | Refuse explicit epic starts without branch, issue-state, or Project mutation and show ready children instead | Must | Explicit input does not bypass the coordination-only boundary |
| FR11 | Annotate selectable children with complete informational epic lineage | Must | Include nested number-and-title lineage |
| FR12 | Preserve execution-dependency and deliverable-readiness behavior independently of epic membership | Must | Coordination never substitutes for a genuine prerequisite |
| FR13 | Bootstrap one aggregate epic contract and one separate first-child spec from the first child's reviewed `write-spec` flow | Must | The epic itself remains unstarted |
| FR14 | Forbid executable epic ownership and enforce unique child-spec authority plus aggregate-to-child traceability | Must | No duplicated completion ownership |
| FR15 | Create or amend later child packages without duplicating or implicitly rewriting aggregate or sibling authority | Must | Aggregate amendments remain explicit |
| FR16 | Publish the initial approved aggregate/child spec set without a closing relationship to the epic and require refreshed canonical proof | Must | Publication is coordination-safe |
| FR17 | Make `open-pr` a resumable terminal delivery loop that monitors, remediates, reverifies, pushes, and merges the exact validated head | Must | Merely open or ready is not complete |
| FR18 | Permit an incomplete delivery return only for a precise blocker outside safe authorized repository scope | Must | Report one exact owner and recovery action |
| FR19 | Require success-equivalent checks, clean review state, `mergeStateStatus: CLEAN`, merged-head proof, and child-closure proof before completion | Must | Evidence is refreshed against the live head |
| FR20 | Fully page native child state, close eligible parents, reconcile readable Project status, and cascade nested completion leaf-to-root | Must | Zero-child and partial graphs fail closed |
| FR21 | Add a read-only legacy audit with exact grouped graph, spec, checklist, Project, and issue-state repair proposals | Must | Audit alone never authorizes mutation |
| FR22 | Apply approved spec splits, ownership transfers, state changes, and metadata repairs with drift checks, migration records, post-write proof, and idempotence | Must | Approval is exact and per epic |
| FR23 | Preserve ambiguous or unverifiable records without mutation and provide an explicit path to draft any missing executable child | Must | Never guess ownership |
| FR24 | Audit and update all affected user-facing documentation and distributed templates, especially contribution guidance | Must | Documentation must match executable behavior |
| FR25 | Add contract and disposable-repository exercises for ordinary issues, nested epics, first-child spec creation, terminal merge, stale-complete epics, premature closure, ownership transfer, and reruns | Must | PathCast is read-only evidence; writes use disposable fixtures |

---

## Non-Functional Requirements

| Aspect | Requirement |
|--------|-------------|
| **Performance** | Parent-link resolution in `/write-spec` must complete in under 5 seconds for epics with up to 20 children (bounded by number of `gh issue view` calls; cache per-run) |
| **Cross-Platform** | All new shell commands POSIX-compatible; Node.js code uses `node:path`; no Bash-specific syntax (see `steering/tech.md`) |
| **Reliability** | `/open-pr` race detection (AC7d) must be idempotent — re-running after a failed push must not double-bump |
| **Security** | No secrets introduced; all GitHub writes go through `gh` CLI with existing auth |
| **Stack-Agnosticism** | Epic/child concepts must be described in skill prompts without leaking into steering templates; the feature belongs to nmg-sdlc skills only, not to projects adopting the pipeline |
| **Lifecycle Completion** | No delivery command reports completion before the exact pull request is merged and the issue postconditions are refreshed |
| **Migration Safety** | Backlog repair is read-only until exact approval, rejects drift and ambiguity, preserves unrelated content, and proves idempotence |
| **Documentation Parity** | Managed guidance and templates advertise only behavior covered by executable contract tests |

---

## Dependencies

### Internal Dependencies
- [ ] Existing `/draft-issue` Steps 1b–1d batch-creation mechanism (reused for epic child creation)
- [ ] Existing `/write-spec` spec-discovery (extended, not replaced)
- [ ] Existing `/open-pr` version-bump classification in `steering/tech.md`
- [ ] Existing `sdlc-runner.mjs` milestone-pool selection logic
- [ ] Shared epic-relationship, canonical-spec, issue-scope, and deliverable-dependency classifiers
- [ ] Existing `start-issue`, `status`, `address-pr-comments`, and `upgrade-project` lifecycle boundaries
- [ ] Shared contribution-guide, issue-form, contribution-gate, onboarding, and upgrade managed assets

### External Dependencies
- [ ] GitHub sub-issue parent field (`gh issue view --json parent`) — requires `gh` CLI version that supports sub-issues
- [ ] GitHub `closedByPullRequestsReferences` JSON field — standard in current `gh` CLI

### Blocked By
- None

---

## Out of Scope

- UI dashboard for epic progress visualization
- Multi-repo or cross-organization epics
- Changes to `retrospective`, `onboard-project`, `upgrade-project`, `run-retro` skills
- Changes to unattended-mode semantics (existing `.codex/unattended-mode` file contract is unchanged)
- New slash commands beyond what FR3 requires (seal-spec is implemented inline in `/write-spec`; may be extracted to `/seal-spec` during design if warranted, but the default is inline)
- Automatic rollback of an already-sealed umbrella spec (once committed, sealing is one-way)
- Migration of existing multi-PR features that pre-date this change (issue #138 stays in its current shape)
- Plugin-owned background services, webhook daemons, or repository event automation
- Epic implementation branches, executable epic tasks, or epic delivery pull requests
- Weakening genuine execution-dependency or deliverable-readiness rules
- Guessing ambiguous ownership, mutating an unapproved repair, or closing a zero-child or unverifiable epic
- Cross-repository epic orchestration

---

## Success Metrics

| Metric | Target | Measurement |
|--------|--------|-------------|
| Epic pipeline completeness | All four pipeline steps (`/draft-issue`, `/write-spec`, `/open-pr`, runner) handle epics natively | Exercise against a synthetic 2-child epic; no manual coordination required |
| Parent-spec resolution accuracy | 100% of child issues with valid `Depends on:` links resolve to the correct parent spec | Exercise with 3 test scenarios: single parent, multiple candidates, no parent |
| Unattended-mode determinism | Zero `interactive prompt` prompts fire during unattended runs of the new gates | Exercise each new gate with `.codex/unattended-mode` present; grep logs for `interactive prompt` |
| CHANGELOG correctness | Intermediate PRs carry the partial-delivery note; final PR closes the epic cleanly | Manual review of the first real epic shipped with this feature |
| Executable-only selection | Zero confirmed epics appear in automatic choices or create a branch through explicit start | Contract exercise with ordinary, child, nested, and epic fixtures |
| Spec authority | Every executable obligation resolves to one child package and no epic owns a task | Scope/traceability helper tests plus disposable migration fixture |
| Terminal delivery | `open-pr` reports completion only after the exact head merges and the child closes | Pending/failing/review/CLEAN/merged-state exercise matrix |
| Backlog repair safety | Every approved repair is drift-checked, scoped, evidenced, and idempotent | Disposable legacy graph plus read-only PathCast #108 audit |
| Documentation parity | Every affected distributed template and contribution surface matches runtime | Contract tests over repository and generated consumer assets |

---

## Open Questions

- [ ] Should seal-spec eventually be extracted to a standalone `/seal-spec` skill for reuse outside the `/write-spec` flow? (Design phase decision)
- [ ] For AC6 topological ordering, should the runner treat an epic itself as processable (running an empty `/write-code` pass to close it) or skip epics entirely in the milestone queue? (Design phase decision)
- [ ] AC5 sibling detection: when an epic has children across multiple milestones, does sibling state look at all children or only those in the same milestone as the current PR? (Design phase decision — default assumption is all children of the epic regardless of milestone)

### Issue #177 Resolution

- Epics are never processable work items; `start-issue` skips them and an explicit
  epic input returns ready-child guidance without mutation.
- Completion considers the complete native child set regardless of milestone.
- The first executable child establishes the aggregate contract and its own
  child package; later children use separate linked packages.
- No standalone seal skill or background automation is introduced.
- Issue #177 has no unresolved requirements questions.

---

## Change History

| Issue | Date | Summary |
|-------|------|---------|
| #149 | 2026-04-19 | Initial feature spec |
| #177 | 2026-08-16 | Made epics coordination-only across selection, specs, terminal delivery, closure, repair, and documentation |

---

## Validation Checklist

- [x] User story follows "As a / I want / So that" format
- [x] All acceptance criteria use Given/When/Then format
- [x] No implementation details in requirements (design phase covers that)
- [x] All criteria are testable and unambiguous
- [x] Success metrics are measurable
- [x] Edge cases and error states are specified (AC7 + AC8)
- [x] Dependencies are identified
- [x] Out of scope is defined
- [x] Open questions are documented (3 design-phase questions)
