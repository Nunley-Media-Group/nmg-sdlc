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
└── feature.gherkin
```

Defect packages use `specs/bug-<slug>/` and retain links to the affected feature contract when applicable.

## Workflow

### Draft an Issue

```bash
$nmg-sdlc:draft-issue "add user authentication"
```

Classifies the request, investigates relevant code, interviews the user, drafts BDD acceptance criteria, and presents an inline approval gate before creating the issue. Multi-part requests may be split into dependency-aware child issues after explicit graph approval.

### Start an Issue

```bash
$nmg-sdlc:start-issue #42
```

With an issue number, validates readiness, confirms the start, creates a linked branch, and updates project status. Without a number, presents milestones and unblocked issues for explicit selection. Open coordination epics do not block their children; genuine prerequisites do.

### Write Specs

```bash
$nmg-sdlc:write-spec #42
```

Creates human-reviewed requirements, technical design, tasks, and Gherkin scenarios. Feature work may amend an existing related feature spec; defect work uses a focused defect package. Spike issues produce a gap-analysis ADR under `docs/decisions/` and require the user to choose the resulting scope shape.

### Implement

```bash
$nmg-sdlc:write-code #42
```

Reads the active and relevant specs, presents a decision-complete implementation plan, waits for approval, executes tasks sequentially, and runs simplification before reporting completion.

### Simplify

```bash
$nmg-sdlc:simplify
```

Reviews changed files for behavior-preserving improvements across reuse, code quality, and efficiency. Risky or behavior-changing refactors are skipped and reported.

### Verify

```bash
$nmg-sdlc:verify-code #42
```

Checks every acceptance criterion, exercises plugin changes where applicable, reviews SOLID/security/performance/testability/error handling, applies safe scoped fixes, and posts a verification report to the issue.

Skill-bundled fixes route through `$skill-creator`. Optional Codex subagents are used only when the user explicitly authorizes delegation.

### Open a Pull Request

```bash
$nmg-sdlc:open-pr #42
```

Inspects and stages the approved delivery tree, presents the version decision, updates version artifacts, commits, rebases safely, pushes, and creates a spec-linked pull request. After creation, the user may opt into CI monitoring and squash merge; merge occurs only when required checks pass and GitHub reports a clean merge state.

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

Status combines read-only git, spec, verification-report, issue, PR, and check evidence. It reports the active stage, completed artifacts, material gaps, and the exact owning next command. JSON mode emits `schemaVersion: 1` with stable top-level lifecycle fields. Status never prompts or mutates local or remote state.

## Project Upgrades and V2 Cleanup

`$nmg-sdlc:upgrade-project` relocates legacy steering/spec trees, reconciles current templates and frontmatter, preserves manual changelog content, and applies the same managed contribution assets as onboarding.

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
| `$nmg-sdlc:upgrade-project` | Reconcile current contracts, managed assets, and v2 cleanup |
| `$nmg-sdlc:run-retro` | Derive spec-writing learnings from defect history |

## License

MIT License. See [LICENSE](LICENSE) for details.
