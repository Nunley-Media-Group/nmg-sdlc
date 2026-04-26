# nmg-sdlc

Stack-agnostic BDD spec-driven development toolkit for Codex, by Nunley Media Group.

## Overview

The **nmg-sdlc** plugin brings structured software delivery to Codex. It covers the entire development lifecycle — issue grooming with acceptance criteria, three-phase specification writing, plan-mode implementation, bundled simplification, automated verification, integrated versioning, PR creation, and closing the PR review loop — but the core flow is seven commands: `$nmg-sdlc:start-issue` → `$nmg-sdlc:write-spec` → `$nmg-sdlc:write-code` → `$nmg-sdlc:simplify` → `$nmg-sdlc:verify-code` → `$nmg-sdlc:open-pr` → `$nmg-sdlc:address-pr-comments`. Each command runs in a fresh context window with only the artifacts it needs — specs, steering docs, and issue metadata — keeping token usage small and efficient across the entire lifecycle. Architecture review runs inline by default and may use Codex `explorer` delegation when explicitly authorized, scoring every implementation across five quality checklists (SOLID principles, security, performance, testability, and error handling). Steering documents (`product.md`, `tech.md`, `structure.md`) let teams encode project-specific conventions that guide every step. A retrospective system (`$nmg-sdlc:run-retro`) analyzes past defect specs to identify recurring gaps and produces actionable learnings in `retrospective.md` — which `$nmg-sdlc:write-spec` and `$nmg-sdlc:write-code` automatically consume, so lessons from previous cycles directly improve future specs and implementations. For Codex plugin projects, exercise-based verification goes beyond static checks — it scaffolds a temporary workspace, installs the plugin, and runs the changed skills end-to-end to validate they actually work. The entire workflow runs interactively with human review gates or fully headless through the built-in SDLC runner.

It provides a GitHub issue-driven workflow. Projects first run `$nmg-sdlc:onboard-project` (once per project lifetime) to bootstrap steering docs and — for existing codebases — reconcile specs from closed issues; afterward the per-feature cycle kicks in:

```
Setup (once)         Step 1               Step 2                   Step 3                  Step 4                     Step 5                         Step 6                    Step 7                Step 8
$nmg-sdlc:onboard-project  →  $nmg-sdlc:draft-issue  →  $nmg-sdlc:start-issue #42  →  $nmg-sdlc:write-spec #42  →  $nmg-sdlc:write-code #42  →  $nmg-sdlc:simplify  →  $nmg-sdlc:verify-code #42  →  $nmg-sdlc:open-pr #42  →  $nmg-sdlc:address-pr-comments #42
Greenfield bootstrap Interview user,      Select issue, create     Read issue, create      Read specs, enter plan     Clean changed code             Verify implementation,    Create PR with        Close the PR review loop:
or brownfield spec   create groomed       linked branch, set       specs (requirements/    mode, create plan,         changed code             review architecture,      summary referencing   read automated-reviewer
reconciliation       GitHub issue         status to In Progress    design/tasks)           then execute               reuse/quality/efficiency update issue              specs and issue       threads, fix via
                                                                                                                                                                                                $nmg-sdlc:write-code + $nmg-sdlc:verify-code,
                                                                                                                                                                                                loop until review-clean
```

`$nmg-sdlc:simplify` is bundled with this plugin. `$nmg-sdlc:write-code` invokes it before signalling completion, `$nmg-sdlc:verify-code` re-runs it after each batch of fixes, and the unattended runner executes it as the dedicated step between implementation and verification.

## Installation

This plugin is packaged for Codex via `.codex-plugin/plugin.json` and distributed through the [nmg-plugins marketplace](https://github.com/Nunley-Media-Group/nmg-plugins):

```bash
# Add the marketplace
codex plugin marketplace add Nunley-Media-Group/nmg-plugins
```

For auto-updates from a private repo, ensure `GITHUB_TOKEN` is set with read access to both the marketplace and plugin repositories.

## First-Time Setup

Run `$nmg-sdlc:onboard-project` in your project — it is the single entry point for adopting nmg-sdlc:

```bash
$nmg-sdlc:onboard-project
```

- **Greenfield projects** (no code yet): runs an intent + tech-selection interview (vision, personas, success criteria, language, framework, test tooling, deployment target) through Plan Mode input gates, bootstraps `steering/product.md`, `tech.md`, and `structure.md` from the interview answers, seeds the `v1` GitHub milestone, generates 3–7 starter issues via a `$nmg-sdlc:draft-issue` loop with dependency-aware autolinking, then offers to run `$nmg-sdlc:init-config` for the unattended runner.
- **Greenfield-Enhancement (re-run)**: when steering files already exist but `specs/` does not, the same Step 2G pipeline runs in enhancement mode — steering files are edited in place (no overwrites), and milestones or issues already seeded by a prior run (detected via the `seeded-by-onboard` label) are skipped.
- **Brownfield projects** (existing code with closed GitHub issues but no specs): bootstraps steering docs if missing, then reconciles one `specs/{feature,bug}-{slug}/` directory per closed issue — or per consolidated group — using the issue body, merged PR body, PR diff, commit messages, and current implementation as evidence.
- **Already-initialized projects**: offers to delegate to `$nmg-sdlc:upgrade-project` rather than duplicating work.

The three steering documents written during greenfield bootstrap:

| Document | Purpose |
|----------|---------|
| `product.md` | Product vision, target users, feature priorities |
| `tech.md` | Tech stack, testing standards, coding conventions |
| `structure.md` | Code organization, layer architecture, naming |

Review and customize these documents — they provide project-specific context for all other skills.

## Workflow

### Quick Start: Start an Issue

```bash
$nmg-sdlc:start-issue #42
```

Selects an issue (or presents a picker if no number is given), creates a linked feature branch via `gh issue develop`, and sets the issue to "In Progress" in any associated GitHub Project.

### Step 1: Create an Issue

```bash
$nmg-sdlc:draft-issue "add user authentication"
```

**Interactive-only** (v1.41.0+) — `$nmg-sdlc:draft-issue` always runs the full interactive workflow regardless of `.codex/unattended-mode`. Classifies the issue type (Bug or Enhancement/Feature), investigates the codebase for relevant context, then interviews you with adaptive depth (core 3-round or extended 4-round with NFR/edge-case probing). Assigns the issue to a version milestone. Plays back its understanding before drafting (Step 5c), then renders a structured inline summary with `[1] Approve / [2] Revise` review menu before creating the issue.

**Multi-issue mode (v1.46.0)**: Step 1b heuristically detects multi-part asks (conjunction markers, bullet lists, distinct component mentions) and proposes a split with per-ask summaries and a `high`/`medium`/`low` confidence indicator. A split-confirm menu (`[1] Approve / [2] Adjust / [3] Collapse`) lets you recover from false-positive splits. Step 1d infers a dependency DAG with a graph-confirm menu before any drafting begins. Each planned issue runs the full Steps 2–9 independently; created issues are autolinked via `gh issue edit --add-sub-issue` (availability probe + body cross-ref fallback). Batch abandonment at any review gate preserves already-created issues with no rollback.

### Step 2: Write Specs

```bash
$nmg-sdlc:write-spec #42
```

Reads the GitHub issue and creates three specification documents through human-gated phases:

1. **SPECIFY** — Requirements with BDD acceptance criteria
2. **PLAN** — Technical design with architecture decisions
3. **TASKS** — Phased implementation tasks with dependencies

Output: `specs/{feature-name}/requirements.md`, `design.md`, `tasks.md`, `feature.gherkin`

The `{feature-name}` is the issue number + kebab-case slug of the title (e.g., `42-add-precipitation-overlay`), matching the branch name format.

### Step 3: Implement

```bash
$nmg-sdlc:write-code #42
```

Reads the specs, enters plan mode to design the implementation approach, then executes tasks sequentially after your approval.

### Step 4: Simplify

```bash
$nmg-sdlc:simplify
```

Reviews changed files for behavior-preserving cleanup opportunities across reuse, code quality, and efficiency. It uses git diffs first, falls back to recently edited or conversation-mentioned files when the worktree is clean, applies worthwhile fixes in place, and reports skipped risky changes.

### Step 5: Verify

```bash
$nmg-sdlc:verify-code #42
```

Verifies the implementation against the spec:
- Checks each acceptance criterion against actual code
- Runs architecture review inline by default, with optional Codex `explorer` delegation only when explicitly authorized, scoring five checklists 1–5:

| Checklist | Focus |
|-----------|-------|
| SOLID Principles | Single responsibility, open/closed, Liskov substitution, interface segregation, dependency inversion |
| Security | OWASP-aligned input validation, authentication, authorization, data protection |
| Performance | Query efficiency, caching, lazy loading, resource management |
| Testability | Dependency injection, mock-friendly boundaries, deterministic behavior |
| Error Handling | Error hierarchy, propagation, recovery, logging |

- Checks BDD test coverage
- Fixes findings under ~20 lines of change; defers architectural changes or out-of-scope modifications
- Posts verification report as a comment on the GitHub issue

### Step 6: Create PR

```bash
$nmg-sdlc:open-pr #42
```

Stages eligible non-runner work, determines the version bump (patch for bugs, minor for enhancements; major bumps are always manual via the `--major` opt-in), updates the `VERSION` file, rolls `CHANGELOG.md` entries from `[Unreleased]` to a versioned heading, updates any stack-specific version files declared in `tech.md`, commits, rebases safely when needed, pushes, and then creates a pull request with:
- Summary from the spec
- Acceptance criteria checklist
- Test plan
- Version bump details
- `Closes #42` to auto-close the issue on merge

### Step 7: Close the PR Review Loop

```bash
$nmg-sdlc:address-pr-comments #42
```

Reads the automated reviewer's unresolved threads on the open PR via GitHub GraphQL, classifies each as `clear-fix` / `ambiguous` / `disagreement`, invokes `$nmg-sdlc:write-code` + `$nmg-sdlc:verify-code` to apply clear-fix changes, verifies postconditions (commit SHA changed, referenced file touched, no regressions) before replying and resolving each thread, pushes with plain `git push` (never force), polls for the reviewer to re-run (30 s / 30 min, mirroring `$nmg-sdlc:open-pr` Step 7), and loops until the PR is review-clean or a configurable round cap is reached. Ambiguous and disagreement threads prompt the user in interactive mode and emit `ESCALATION: address-pr-comments — …` sentinels in unattended mode. Automated-reviewer identity is configured in `steering/tech.md` → Automated Review.

## Unattended Mode

The plugin supports fully automated operation through a deterministic Node.js runner (`scripts/sdlc-runner.mjs`) that drives the full development cycle — issue selection, spec writing, implementation, verification, PR creation, CI monitoring, and merge — looping continuously until no open issues remain.

### Setup

#### 1. Generate a project config

From within the target project (must have a `.codex/` directory):

```bash
$nmg-sdlc:init-config
```

This writes `sdlc-config.json` to the project root and adds it to `.gitignore`. The config specifies the project path, per-step timeouts, model/effort choices, and which nmg-sdlc skills to inject.

#### 2. Launch the runner

From within a Codex session:

```bash
$nmg-sdlc:run-loop
```

Or run directly:

```bash
node scripts/sdlc-runner.mjs --config /path/to/sdlc-config.json
```

Available flags: `--resume`, `--dry-run`, `--step N`, `--issue N`.

### Unattended-mode flag

> **Not to be confused with Codex's native Auto Mode.** Codex (since v2.1.83) ships its own "Auto Mode" — a permission feature that auto-approves safe tool calls via a classifier. This plugin's `.codex/unattended-mode` flag is independent: it signals that the SDLC runner is driving the session headlessly and causes skills to skip interactive gates. The two features are orthogonal — you can run either, both, or neither.

The runner creates `.codex/unattended-mode` automatically. When this file exists, skills skip Plan Mode `request_user_input` gates. You can also toggle it manually:

```bash
# Enable unattended mode
mkdir -p .codex && touch .codex/unattended-mode

# Disable unattended mode
rm .codex/unattended-mode
```

To stop an in-flight runner cleanly (signal the live PID and clear both runner artifacts in one step), use `$nmg-sdlc:end-loop` — the explicit counterpart to `$nmg-sdlc:run-loop`.

### Default behaviors in unattended mode

- **Issue selection**: picks the first open issue in the milestone, sorted by issue number ascending (oldest first)
- **Confirmations**: answers yes
- **Review gates**: auto-approves all phases (requirements, design, tasks)
- **Plan mode**: skipped — interactive plan review is never called; Codex designs the approach internally from specs
- **Skill output**: all "Next step" suggestions suppressed; skills output `Done. Awaiting orchestrator.` instead

### Safety net

`$nmg-sdlc:verify-code` runs fully autonomously (even outside unattended mode) and validates the implementation against specs. It serves as the quality gate — catching deviations, running architecture review, and auto-fixing findings.

## Customization

The plugin provides the **process**. Your project provides **specifics** via steering docs:

| What to Customize | Where | Example |
|---|---|---|
| BDD framework | `tech.md` → Testing Standards | pytest-bdd, jest-cucumber, SpecFlow |
| Feature file location | `tech.md` | `tests/features/*.feature` |
| Step definition patterns | `tech.md` | Framework-specific code examples |
| Directory layout | `structure.md` | Project's actual paths |
| Design tokens / branding | `structure.md` | Project's design system |
| Target users | `product.md` | User personas and constraints |
| API conventions | `tech.md` | REST, GraphQL, gRPC |

The `agents/*.md` files in this repo are reusable prompt contracts for optional Codex delegation. They are loaded by skills when a workflow explicitly asks for a built-in Codex `worker` or `explorer`; they are not standalone plugin components in `.codex-plugin/plugin.json`.

### Versioning

The plugin includes an integrated versioning system built on a `VERSION` file (plain text semver at the project root). When `VERSION` exists, skills automatically:

- **`$nmg-sdlc:draft-issue`** — Assigns issues to a milestone derived from the major version (e.g., `v1`), creating the milestone if needed. As of v1.41.0, this skill is **interactive-only** and does not participate in unattended-mode workflows.
- **`$nmg-sdlc:open-pr`** — Classifies the version bump from issue labels, updates `VERSION`, rolls `CHANGELOG.md` entries to a versioned heading, and updates stack-specific files.

The **classification matrix**:

| Issue Label | Bump Type | Example |
|-------------|-----------|---------|
| `bug` | Patch | 1.5.1 → 1.5.2 |
| `enhancement` | Minor | 1.5.1 → 1.6.0 |
| `spike` | Skip | No bump — research-only PR |

**Stack-specific files** (e.g., `package.json`, `Cargo.toml`) are declared in `tech.md`'s `## Versioning` section. The `$nmg-sdlc:open-pr` skill reads this mapping to update all version files in a single commit. Run `$nmg-sdlc:upgrade-project` to bootstrap `CHANGELOG.md` and `VERSION` from git history if they don't exist yet.

**Spike research ADRs** are committed to `docs/decisions/YYYY-MM-DD-<slug>-gap-analysis.md` by `$nmg-sdlc:write-spec` Phase 0. The directory is created on demand (on the first spike); no pre-existing file or placeholder is required. `$nmg-sdlc:run-retro` scans this directory for ADRs older than 180 days and surfaces them as re-spike candidates in the retrospective output.

### Verification Gates

The `## Verification Gates` section in `tech.md` declares mandatory verification steps that `$nmg-sdlc:verify-code` enforces as hard gates. Each gate specifies when it applies, what command to run, and how to determine success.

## Skills Reference

| Skill | Description |
|-------|-------------|
| `$nmg-sdlc:start-issue [#N]` | Select a GitHub issue, create a linked feature branch, and set the issue to In Progress |
| `$nmg-sdlc:draft-issue [description]` | Interview user about a feature need, assign to version milestone, create groomed GitHub issue with BDD acceptance criteria |
| `$nmg-sdlc:write-spec #N` | Create BDD specifications from a GitHub issue: requirements, technical design, and task breakdown |
| `$nmg-sdlc:write-code #N` | Read specs for current branch, enter plan mode, then execute implementation tasks sequentially |
| `$nmg-sdlc:verify-code #N` | Verify implementation against spec, fix findings, review architecture and test coverage, update GitHub issue |
| `$nmg-sdlc:open-pr #N` | Stage eligible work, apply the version bump, commit, rebase safely, push, and create a PR with spec-driven summary |
| `$nmg-sdlc:address-pr-comments [#N] [--max-rounds=K]` | Close the PR review loop: read automated-reviewer threads, apply fixes via `$nmg-sdlc:write-code` + `$nmg-sdlc:verify-code`, reply and resolve until review-clean |
| `$nmg-sdlc:run-retro` | Batch-analyze defect specs to identify spec-writing gaps and produce `steering/retrospective.md` with actionable learnings |
| `$nmg-sdlc:run-loop [#N]` | Run the full SDLC pipeline from within an active Codex session — processes a specific issue or loops over all open issues via `sdlc-runner.mjs` |
| `$nmg-sdlc:end-loop` | Stop unattended mode and clear runner state |
| `$nmg-sdlc:upgrade-project` | Upgrade an existing project to current plugin standards — relocates legacy `.codex/steering/` and `.codex/specs/` to the project root |
| `$nmg-sdlc:init-config` | Generate an `sdlc-config.json` for the SDLC runner |
| `$nmg-sdlc:onboard-project [--dry-run]` | Initialize a project for the SDLC — greenfield bootstrap (interview, steering, `VERSION` + stack-native manifest init at `0.1.0`, `v1` milestone seeding, 3–7 starter issues), greenfield-enhancement re-run, or brownfield spec reconciliation (always includes the current source tree; when a manifest declares a version, `VERSION` mirrors it — otherwise seeds `0.1.0`; with zero closed issues, deterministically backfills specs from the source tree) |

## Updating

```bash
codex plugin marketplace upgrade nmg-plugins
```

## License

MIT License. See [LICENSE](LICENSE) for details.
