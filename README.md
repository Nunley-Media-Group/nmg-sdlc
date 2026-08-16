# nmg-sdlc

Stack-agnostic BDD spec-driven development toolkit for Codex, by Nunley Media Group.

## Overview

The nmg-sdlc plugin provides a manual, GitHub issue-driven delivery workflow with explicit human review gates:

```text
$nmg-sdlc:draft-issue
  → $nmg-sdlc:start-issue
  → $nmg-sdlc:write-spec
  → $nmg-sdlc:write-code
  → $nmg-sdlc:simplify
  → $nmg-sdlc:verify-code
  → $nmg-sdlc:open-pr
  → $nmg-sdlc:address-pr-comments
```

The read-only `$nmg-sdlc:status` utility is available throughout the lifecycle. Project steering documents (`steering/product.md`, `steering/tech.md`, and `steering/structure.md`) encode product and engineering conventions. `$nmg-sdlc:run-retro` analyzes past defect specs and writes reusable learnings to `steering/retrospective.md`.

Every decision point waits for explicit user input. Skills inspect only the active spec plus a bounded set of relevant neighboring specs, which keeps context focused while preserving cross-feature constraints.

## Installation

This plugin is packaged through `.codex-plugin/plugin.json` and distributed through the [nmg-plugins marketplace](https://github.com/Nunley-Media-Group/nmg-plugins):

```bash
codex plugin marketplace add Nunley-Media-Group/nmg-plugins
codex plugin marketplace upgrade nmg-plugins
```

For private repositories, configure `GITHUB_TOKEN` with read access to both the marketplace and plugin repositories.

## First-Time Setup

Interactive gates use Codex `request_user_input` prompts. Before a gate opens, nmg-sdlc checks `~/.codex/config.toml` for:

```toml
suppress_unstable_features_warning = true

[features]
default_mode_request_user_input = true
ask_user_questions = true
```

If nmg-sdlc repairs these settings, close and reopen Codex before retrying the original command.

Run onboarding once from the project root:

```bash
$nmg-sdlc:onboard-project
```

- Greenfield projects receive a seven-question product/technology interview, root steering docs, `VERSION` and manifest initialization, a `v1` milestone, and 3–7 starter issues.
- Greenfield-enhancement projects preserve existing steering content and propose targeted updates.
- Brownfield projects reconcile specs from closed issues, merged PR evidence, and the current source tree. With no closed issues, source-tree backfill is deterministic.
- Already-initialized projects can delegate current-contract reconciliation to `$nmg-sdlc:upgrade-project`.

After steering exists, onboarding manages these repository artifacts directly:

- `CONTRIBUTING.md` plus an idempotent README link.
- A bounded nmg-sdlc spec-context section in root `AGENTS.md`.
- `.github/workflows/nmg-sdlc-contribution-gate.yml`.
- `.github/ISSUE_TEMPLATE/nmg-sdlc-ready-issue.yml`.

The contribution gate checks issue/spec identity, task or verification evidence for changed paths, steering context, and documented exception predicates. It uses read-only GitHub token permissions and does not replace project CI or human review. The issue form captures issue type, context, current state, Given/When/Then acceptance criteria, functional requirements, scope boundaries, priority, and optional notes.

## Spec Context

Project-root `specs/` is the canonical BDD archive. Skills first resolve the active spec, then scan compact metadata across neighboring specs and load only a capped, ranked relevant set. Legacy `.codex/specs/` projects must run `$nmg-sdlc:upgrade-project` before other pipeline skills.

Feature packages contain:

```text
specs/feature-<slug>/
├── requirements.md
├── design.md
├── tasks.md
├── feature.gherkin
└── issue-scope.json
```

Defect packages use `specs/bug-<slug>/` and retain links to the affected feature contract when applicable.

Feature specs use `issue-scope.json` to assign every AC, FR, task, and stable `@SCN...` scenario identifier to one contributing issue. An issue's current delivery slice is its owned elements plus any explicitly adopted elements whose historical owner remains unchanged. Prior ACs, FRs, and scenarios may be declared separately as regression obligations; they are preservation evidence, not current implementation tasks. A single-contributor feature or singular defect without a manifest remains compatible through unambiguous whole-spec scope. A multi-issue spec with a missing or incomplete map stops at `$nmg-sdlc:write-spec #N` for explicit repair instead of defaulting to the cumulative document.

## Workflow

### Draft an Issue

```bash
$nmg-sdlc:draft-issue "add user authentication"
```

Classifies the request, investigates relevant code, interviews the user, drafts BDD acceptance criteria, and presents an inline approval gate before creating the issue. Multi-part requests may be split into dependency-aware child issues after explicit graph approval. Cross-child task or artifact prerequisites must resolve to an extracted baseline issue or a whole-issue dependency; prose-only midpoint checkpoints are not schedulable. Baseline extraction stops the current flow for a separately reviewed issue/spec plan; a later approved plan carries the baseline ask and structured prerequisite records into drafting.

### Start an Issue

```bash
$nmg-sdlc:start-issue #42
```

With an issue number, validates readiness, confirms the start, creates a linked branch, and updates project status. Without a number, presents milestones and ready issues for explicit selection. Automatic discovery expands its bounded candidate window after dependency filtering until it can offer four choices or exhausts the scope, and omits open issues whose readable Project statuses are all `Done`; explicit issue-number starts remain available for intentional recovery. Open coordination epics do not block their children; genuine prerequisites do. New umbrellas persist an `epic` parent label, a matching `epic-child-of-N` child label, the native relationship, and body fallback so every fresh lifecycle command reconstructs the same identity. A structured `Requires deliverable` record is ready only when its matching whole-issue dependency has a closing pull request merged into the live default branch; issue closure alone is insufficient.

### Write Specs

```bash
$nmg-sdlc:write-spec #42
```

Creates human-reviewed requirements, technical design, tasks, stable-ID Gherkin scenarios, and feature issue-scope mappings. Feature work may amend an existing related feature spec; the Tasks gate shows the exact owned, adopted, and regression identifiers before the manifest is written. Defect work uses a focused defect package. Spike issues produce a gap-analysis ADR under `docs/decisions/` and require the user to choose the resulting scope shape.

For multi-PR umbrella work, sealing retains the issue-linked source branch but publishes the exact seal commit from a separate, deterministic Git ref that is never created through GitHub's issue-development flow. The spec-only pull request targets the detected default branch, changes only the approved spec directory, does not bump a version, and is never merged automatically. Before reporting it as pending, write-spec proves that GitHub's `closingIssuesReferences` excludes the umbrella. Re-run `$nmg-sdlc:write-spec #N` after merge: it requires both refreshed canonical default-branch content and current issue/timeline proof that the umbrella stayed open. If an older exact marked publication closed its umbrella, write-spec shows the matching PR and `ClosedEvent` evidence and can reopen only that exact issue after explicit approval. Ordinary implementation pull-request closure is unchanged. Child creation and downstream start, spec, and code entry points remain blocked until the canonical and coordination proofs succeed.

### Implement

```bash
$nmg-sdlc:write-code #42
```

Reads the active and relevant specs, resolves the active issue's delivery slice, presents a decision-complete implementation plan, waits for approval, executes only mapped owned-plus-adopted tasks sequentially, and runs simplification before reporting completion. Resumption reconstructs progress inside that same task set and ignores earlier or future cumulative tasks.

### Simplify

```bash
$nmg-sdlc:simplify
```

Reviews changed files for behavior-preserving improvements across reuse, code quality, and efficiency. Risky or behavior-changing refactors are skipped and reported.

### Verify

```bash
$nmg-sdlc:verify-code #42
```

Checks every mapped delivery acceptance criterion and task, exercises only explicitly declared prior regression obligations, reviews SOLID/security/performance/testability/error handling, applies safe scoped fixes, and posts an issue-bound verification report. The report includes normalized delivery/regression IDs so another contributor's evidence cannot satisfy the active issue.

When every local obligation passes but a mapped acceptance criterion requires GitHub evidence that cannot exist before pull-request creation, verification records `PR Evidence Pending` plus a bounded machine marker instead of mislabeling the work Partial or Pass. Only named required checks and check runs proven with exact `event: pull_request` provenance, plus merge-blocking observations that intrinsically require a PR, qualify. Any push-capable/unknown event, local failure, failed/incomplete steering gate, stale scope, malformed marker, or arbitrary deferred-work exception remains blocked. After a controlled draft exists, verification can record satisfied evidence only for that draft's exact head SHA.

Skill-bundled fixes route through `$skill-creator`. Optional Codex subagents are used only when the user explicitly authorizes delegation.

### Open a Pull Request

```bash
$nmg-sdlc:open-pr #42
```

Inspects and stages the approved delivery tree, requires matching active-scope verification, presents the version decision, updates version artifacts, commits, rebases safely, pushes, and creates a spec-linked pull request. Its acceptance criteria and test plan contain only mapped delivery plus separate declared regression evidence, link `issue-scope.json` when present, and close only the active issue.

Ordinary current Pass verification keeps the normal PR path. Qualified `PR Evidence Pending` uses a controlled draft: delivery proves the exact branch/base/issue identity, captures draft head H1, gathers only the declared GitHub evidence, reruns verification, safely commits and pushes any report update, then gathers the same evidence again for final head H2. H1 evidence cannot satisfy H2. The PR body records a validated final-H2 marker before `gh pr ready`; any missing, failed, cancelled, timed-out, stale, or malformed result leaves the draft and feature branch intact. If H2 validation fails after the H1 report was pushed, the exact preserved draft can resume from its current satisfied report and re-poll H2 instead of deadlocking on the now-absent pending marker. Only then may the existing automated-review, required-check, mergeability, explicit merge-choice, and cleanup gates run. Merge still requires success-equivalent required checks and GitHub `mergeStateStatus: CLEAN`; repository protections are never weakened or bypassed.

### Address Review Comments

```bash
$nmg-sdlc:address-pr-comments #42
```

Reads unresolved automated-reviewer threads, classifies them as clear fix, ambiguous, or disagreement, applies and verifies clear fixes, and asks the user to decide ambiguous or disputed findings. Successful threads are replied to and resolved; the loop stops when review-clean or when its round cap is reached.

## Lifecycle Status

```bash
$nmg-sdlc:status
$nmg-sdlc:status --json
```

Status combines read-only git, normalized active issue scope, verification-report, issue, PR, body-marker, and check evidence. It reports the active stage, completed artifacts, material gaps, active umbrella coordination identity, compact delivery/regression IDs, deliverable availability, draft/head/merge metadata, and the exact owning next command. A committed current qualified pending report—or satisfied H1 report whose commit advanced the draft to H2—produces `delivery-validation-pending`: local verification is complete, PR evidence is missing, and `$nmg-sdlc:open-pr #N` owns the next transition without claiming full Pass. Status validates final delivery evidence against H2 separately and fails closed if a controlled PR becomes ready or merged without it. JSON mode emits `schemaVersion: 1` with stable top-level lifecycle fields, nullable `issue.coordination` and `issue.deliverableDependencies` results, and the resolver result under `spec.scope`. Missing, invalid, cross-issue, unmerged-deliverable, or unrepresentable dependency evidence cannot advance the lifecycle; an active issue whose body cannot be hydrated is deliverable-unverifiable and blocked. Legacy free-form checkpoint heuristics remain upgrade-audit findings and do not gate status before approved structured repair. Status never prompts or mutates local or remote state.

## Project Upgrades and V2 Cleanup

`$nmg-sdlc:upgrade-project` relocates legacy steering/spec trees, reconciles current templates and frontmatter, preserves manual changelog content, and applies the same managed contribution assets as onboarding. It also audits bounded local and `origin/*` refs for sealed multi-PR specs that never reached the refreshed default branch. Canonical and history-marker-loss states are report-only. A single unambiguous stranded tree can be restored to an absent worktree path only after exact-path approval; an already byte-identical path is a no-op. Recovery remains unstaged for the normal reviewed `$nmg-sdlc:write-spec #N` publication flow. Divergent default-branch content always wins, while ambiguous or unverifiable findings are preserved for manual resolution.

The upgrade audit also reconciles umbrella identity. Native sub-issue relationships are authoritative; supported body checklists remain report-only fallback and drift evidence when native discovery fails and cannot authorize lifecycle mutation. Legacy identity requires agreeing native and body relationships. Deterministic repairs are bound to the audited repository, require their own exact per-parent approval, and are revalidated immediately before writing. Automated full-body repair is allowed only through a proven server-enforced compare-and-set operation, and post-apply proof is scoped to the approved records while remaining findings are reported separately.

The same audit reports cross-child task/artifact checkpoints that lack a deliverable boundary. It can render an exact approved manual whole-issue line-edit handoff after revalidating canonical ownership, body/spec digests, labels/states, native relationships, default branch, and closing-PR/merge evidence. It never performs an unconditional full-body overwrite without a documented server-enforced compare-and-set. After operator confirmation it verifies the result and proves a second audit is a no-op. Extracting an independently reviewable baseline remains a separate issue/spec workflow; ambiguous or incomplete ownership and closing-PR evidence stays report-only.

For existing projects, its v2 migration proposes deletion of only these obsolete exact paths when they are regular files:

```text
sdlc-config.json
.codex/unattended-mode
.codex/sdlc-state.json
```

It can also remove those exact ignore entries only when they occur inside a recognized `# SDLC runner config` or `# SDLC runner artifacts` block. Matching rules outside those blocks, unknown lines, unrelated files, workflows, issue templates, specs, and configuration are preserved. The findings gate lists every proposed deletion and supports narrowing or declining the batch. The state file's contents are never read or acted upon. Repeating the migration is safe and reports an already-clean state.

Existing GitHub labels and issue label assignments are not migration targets.

## Versioning

`VERSION` is the single version source. `$nmg-sdlc:open-pr` reads `steering/tech.md` for label-to-bump rules and stack-specific version paths, then presents the proposed bump before writing:

| Issue label | Default bump |
|-------------|--------------|
| `bug` | Patch |
| `enhancement` | Minor |
| `spike` | Skip |

Major bumps require an explicit `--major` request and user confirmation. `[Unreleased]` changelog entries roll into the accepted version during delivery.

## Verification Gates

`steering/tech.md` may declare project-specific verification gates with applicability conditions, commands, and success predicates. `$nmg-sdlc:verify-code` treats applicable gates as mandatory evidence.

For plugin skills, `scripts/skill-exercise-runner.mjs` supports deterministic artifact/rubric exercises. Set `RUN_EXERCISE_TESTS=1` only when live skill invocation is intended.

## Skills Reference

| Skill | Purpose |
|-------|---------|
| `$nmg-sdlc:onboard-project` | Initialize greenfield or brownfield projects and install managed repository assets |
| `$nmg-sdlc:draft-issue` | Create a groomed GitHub issue with BDD acceptance criteria |
| `$nmg-sdlc:start-issue [#N]` | Select and start ready work on a linked branch |
| `$nmg-sdlc:write-spec #N` | Create or amend requirements, design, tasks, and Gherkin specs |
| `$nmg-sdlc:write-code #N` | Plan and implement the approved spec |
| `$nmg-sdlc:simplify` | Apply behavior-preserving cleanup to changed code |
| `$nmg-sdlc:verify-code #N` | Verify implementation, fix scoped findings, and update the issue |
| `$nmg-sdlc:open-pr #N` | Version, commit, rebase, push, and create a pull request |
| `$nmg-sdlc:address-pr-comments [#N]` | Close the automated-reviewer feedback loop |
| `$nmg-sdlc:status [--json]` | Report manual lifecycle state without mutation |
| `$nmg-sdlc:upgrade-project` | Reconcile current contracts, audit sealed specs and umbrella identity, recover exact approved findings, and perform v2 cleanup |
| `$nmg-sdlc:run-retro` | Derive spec-writing learnings from defect history |

## License

MIT License. See [LICENSE](LICENSE) for details.
