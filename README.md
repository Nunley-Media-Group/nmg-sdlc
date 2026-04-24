# nmg-sdlc

Stack-agnostic BDD spec-driven development toolkit for Claude Code, by Nunley Media Group.

## Overview

The **nmg-sdlc** plugin brings structured software delivery to Claude Code. It covers the entire development lifecycle — issue grooming with acceptance criteria, three-phase specification writing, plan-mode implementation, automated verification with integrated versioning, PR creation, and closing the PR review loop — but the core flow is six commands: `/start-issue` → `/write-spec` → `/write-code` → `/verify-code` → `/open-pr` → `/address-pr-comments`. Each command runs in a fresh context window with only the artifacts it needs — specs, steering docs, and issue metadata — keeping token usage small and efficient across the entire lifecycle. A dedicated architecture reviewer agent scores every implementation across five quality checklists (SOLID principles, security, performance, testability, and error handling), while a retrospective system analyzes past defects to continuously improve spec quality. Steering documents (`product.md`, `tech.md`, `structure.md`) let teams encode project-specific conventions that guide every step. A retrospective system (`/run-retro`) analyzes past defect specs to identify recurring gaps and produces actionable learnings in `retrospective.md` — which `/write-spec` and `/write-code` automatically consume, so lessons from previous cycles directly improve future specs and implementations. For Claude Code plugin projects, exercise-based verification goes beyond static checks — it scaffolds a temporary workspace, installs the plugin, and runs the changed skills end-to-end to validate they actually work. The entire workflow runs interactively with human review gates or fully headless through the built-in SDLC runner.

It provides a GitHub issue-driven workflow. Projects first run `/onboard-project` (once per project lifetime) to bootstrap steering docs and — for existing codebases — reconcile specs from closed issues; afterward the per-feature cycle kicks in:

```
Setup (once)         Step 1               Step 2                   Step 3                  Step 4                     Optional                 Step 5                    Step 6                Step 7
/onboard-project  →  /draft-issue  →  /start-issue #42  →  /write-spec #42  →  /write-code #42  →  /simplify  →  /verify-code #42  →  /open-pr #42  →  /address-pr-comments #42
Greenfield bootstrap Interview user,      Select issue, create     Read issue, create      Read specs, enter plan     Clean & simplify         Verify implementation,    Create PR with        Close the PR review loop:
or brownfield spec   create groomed       linked branch, set       specs (requirements/    mode, create plan,         changed code             review architecture,      summary referencing   read automated-reviewer
reconciliation       GitHub issue         status to In Progress    design/tasks)           then execute               (optional external)      update issue              specs and issue       threads, fix via
                                                                                                                                                                                                /write-code + /verify-code,
                                                                                                                                                                                                loop until review-clean
```

`/simplify` is an optional marketplace skill. When installed, `/write-code` invokes it before signalling completion and `/verify-code` re-runs it after each batch of fixes. When not installed, both steps log `simplify skill not available — skipping simplification pass` and proceed without failing.

## Installation

This plugin is distributed through the [nmg-plugins marketplace](https://github.com/Nunley-Media-Group/nmg-plugins):

```bash
# Add the marketplace
/plugin marketplace add Nunley-Media-Group/nmg-plugins

# Install the plugin
/plugin install nmg-sdlc@nmg-plugins
```

For auto-updates from a private repo, ensure `GITHUB_TOKEN` is set with read access to both the marketplace and plugin repositories.

## First-Time Setup

Run `/onboard-project` in your project — it is the single entry point for adopting nmg-sdlc:

```bash
/onboard-project
```

- **Greenfield projects** (no code yet): optionally ingests a Claude Design URL, runs an intent + tech-selection interview (vision, personas, success criteria, language, framework, test tooling, deployment target), bootstraps `steering/product.md`, `tech.md`, and `structure.md` from the interview answers, seeds `v1 (MVP)` and `v2` GitHub milestones, generates 3–7 starter issues via a `/draft-issue` loop with dependency-aware autolinking, then offers to run `/init-config` for the unattended runner. Pass `--design-url <url>` to skip the interactive prompt for the design URL.
- **Greenfield-Enhancement (re-run)**: when steering files already exist but `specs/` does not, the same Step 2G pipeline runs in enhancement mode — steering files are edited in place (no overwrites), and milestones or issues already seeded by a prior run (detected via the `seeded-by-onboard` label) are skipped.
- **Brownfield projects** (existing code with closed GitHub issues but no specs): bootstraps steering docs if missing, then reconciles one `specs/{feature,bug}-{slug}/` directory per closed issue — or per consolidated group — using the issue body, merged PR body, PR diff, commit messages, and current implementation as evidence.
- **Already-initialized projects**: offers to delegate to `/upgrade-project` rather than duplicating work.

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
/start-issue #42
```

Selects an issue (or presents a picker if no number is given), creates a linked feature branch via `gh issue develop`, and sets the issue to "In Progress" in any associated GitHub Project.

### Step 1: Create an Issue

```bash
/draft-issue "add user authentication"
```

**Interactive-only** (v1.41.0+) — `/draft-issue` always runs the full interactive workflow regardless of `.claude/unattended-mode`. Classifies the issue type (Bug or Enhancement/Feature), investigates the codebase for relevant context, then interviews you with adaptive depth (core 3-round or extended 4-round with NFR/edge-case probing). Assigns the issue to a version milestone. Plays back its understanding before drafting (Step 5c), then renders a structured inline summary with `[1] Approve / [2] Revise` review menu before creating the issue.

**Multi-issue mode (v1.46.0)**: Step 1b heuristically detects multi-part asks (conjunction markers, bullet lists, distinct component mentions) and proposes a split with per-ask summaries and a `high`/`medium`/`low` confidence indicator. A split-confirm menu (`[1] Approve / [2] Adjust / [3] Collapse`) lets you recover from false-positive splits. Step 1d infers a dependency DAG with a graph-confirm menu before any drafting begins. Each planned issue runs the full Steps 2–9 independently; created issues are autolinked via `gh issue edit --add-sub-issue` (availability probe + body cross-ref fallback). Batch abandonment at any review gate preserves already-created issues with no rollback.

**Claude Design URL**: supply an optional `claude.ai` design URL to share parsed archive context read-only across every per-issue investigation, interview, and synthesis in the batch — reuses the `/onboard-project` fetch/gzip-decode/README-parse helper.

### Step 2: Write Specs

```bash
/write-spec #42
```

Reads the GitHub issue and creates three specification documents through human-gated phases:

1. **SPECIFY** — Requirements with BDD acceptance criteria
2. **PLAN** — Technical design with architecture decisions
3. **TASKS** — Phased implementation tasks with dependencies

Output: `specs/{feature-name}/requirements.md`, `design.md`, `tasks.md`, `feature.gherkin`

The `{feature-name}` is the issue number + kebab-case slug of the title (e.g., `42-add-precipitation-overlay`), matching the branch name format.

### Step 3: Implement

```bash
/write-code #42
```

Reads the specs, enters plan mode to design the implementation approach, then executes tasks sequentially after your approval.

### Step 4: Verify

```bash
/verify-code #42
```

Verifies the implementation against the spec:
- Checks each acceptance criterion against actual code
- Runs architecture review via the dedicated `nmg-sdlc:architecture-reviewer` agent, scoring five checklists 1–5:

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

### Step 5: Create PR

```bash
/open-pr #42
```

Determines the version bump (patch for bugs, minor for enhancements; major bumps are always manual via the `--major` opt-in), updates the `VERSION` file, rolls `CHANGELOG.md` entries from `[Unreleased]` to a versioned heading, and updates any stack-specific version files declared in `tech.md`. Then creates a pull request with:
- Summary from the spec
- Acceptance criteria checklist
- Test plan
- Version bump details
- `Closes #42` to auto-close the issue on merge

### Step 6: Close the PR Review Loop

```bash
/address-pr-comments #42
```

Reads the automated reviewer's unresolved threads on the open PR via GitHub GraphQL, classifies each as `clear-fix` / `ambiguous` / `disagreement`, invokes `/write-code` + `/verify-code` to apply clear-fix changes, verifies postconditions (commit SHA changed, referenced file touched, no regressions) before replying and resolving each thread, pushes with plain `git push` (never force), polls for the reviewer to re-run (30 s / 30 min, mirroring `/open-pr` Step 7), and loops until the PR is review-clean or a configurable round cap is reached. Ambiguous and disagreement threads prompt the user in interactive mode and emit `ESCALATION: address-pr-comments — …` sentinels in unattended mode. Automated-reviewer identity is configured in `steering/tech.md` → Automated Review.

## Unattended Mode

The plugin supports fully automated operation through a deterministic Node.js runner (`scripts/sdlc-runner.mjs`) that drives the full development cycle — issue selection, spec writing, implementation, verification, PR creation, CI monitoring, and merge — looping continuously until no open issues remain.

### Setup

#### 1. Generate a project config

From within the target project (must have a `.claude/` directory):

```bash
/init-config
```

This writes `sdlc-config.json` to the project root and adds it to `.gitignore`. The config specifies the project path, per-step timeouts and turn limits, and which nmg-sdlc skills to inject.

#### 2. Launch the runner

From within a Claude Code session:

```bash
/run-loop
```

Or run directly:

```bash
node scripts/sdlc-runner.mjs --config /path/to/sdlc-config.json
```

Available flags: `--resume`, `--dry-run`, `--step N`, `--issue N`.

### Unattended-mode flag

> **Not to be confused with Claude Code's native Auto Mode.** Claude Code (since v2.1.83) ships its own "Auto Mode" — a permission feature that auto-approves safe tool calls via a classifier. This plugin's `.claude/unattended-mode` flag is independent: it signals that the SDLC runner is driving the session headlessly and causes skills to skip interactive gates. The two features are orthogonal — you can run either, both, or neither.

The runner creates `.claude/unattended-mode` automatically. When this file exists, skills skip interactive prompts. You can also toggle it manually:

```bash
# Enable unattended mode
mkdir -p .claude && touch .claude/unattended-mode

# Disable unattended mode
rm .claude/unattended-mode
```

To stop an in-flight runner cleanly (signal the live PID and clear both runner artifacts in one step), use `/end-loop` — the explicit counterpart to `/run-loop`.

### Default behaviors in unattended mode

- **Issue selection**: picks the first open issue in the milestone, sorted by issue number ascending (oldest first)
- **Confirmations**: answers yes
- **Review gates**: auto-approves all phases (requirements, design, tasks)
- **Plan mode**: skipped — `EnterPlanMode` is never called; Claude designs the approach internally from specs
- **Skill output**: all "Next step" suggestions suppressed; skills output `Done. Awaiting orchestrator.` instead

### Safety net

`/verify-code` runs fully autonomously (even outside unattended mode) and validates the implementation against specs. It serves as the quality gate — catching deviations, running architecture review, and auto-fixing findings.

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

### Versioning

The plugin includes an integrated versioning system built on a `VERSION` file (plain text semver at the project root). When `VERSION` exists, skills automatically:

- **`/draft-issue`** — Assigns issues to a milestone derived from the major version (e.g., `v1`), creating the milestone if needed. As of v1.41.0, this skill is **interactive-only** and does not participate in unattended-mode workflows.
- **`/open-pr`** — Classifies the version bump from issue labels, updates `VERSION`, rolls `CHANGELOG.md` entries to a versioned heading, and updates stack-specific files.

The **classification matrix**:

| Issue Label | Bump Type | Example |
|-------------|-----------|---------|
| `bug` | Patch | 1.5.1 → 1.5.2 |
| `enhancement` | Minor | 1.5.1 → 1.6.0 |
| `spike` | Skip | No bump — research-only PR |

**Stack-specific files** (e.g., `package.json`, `Cargo.toml`) are declared in `tech.md`'s `## Versioning` section. The `/open-pr` skill reads this mapping to update all version files in a single commit. Run `/upgrade-project` to bootstrap `CHANGELOG.md` and `VERSION` from git history if they don't exist yet.

**Spike research ADRs** are committed to `docs/decisions/YYYY-MM-DD-<slug>-gap-analysis.md` by `/write-spec` Phase 0. The directory is created on demand (on the first spike); no pre-existing file or placeholder is required. `/run-retro` scans this directory for ADRs older than 180 days and surfaces them as re-spike candidates in the retrospective output.

### Verification Gates

The `## Verification Gates` section in `tech.md` declares mandatory verification steps that `/verify-code` enforces as hard gates. Each gate specifies when it applies, what command to run, and how to determine success.

## Skills Reference

| Skill | Description |
|-------|-------------|
| `/start-issue [#N]` | Select a GitHub issue, create a linked feature branch, and set the issue to In Progress |
| `/draft-issue [description] [design-url]` | Interview user about a feature need, assign to version milestone, create groomed GitHub issue with BDD acceptance criteria |
| `/write-spec #N` | Create BDD specifications from a GitHub issue: requirements, technical design, and task breakdown |
| `/write-code #N` | Read specs for current branch, enter plan mode, then execute implementation tasks sequentially |
| `/verify-code #N` | Verify implementation against spec, fix findings, review architecture and test coverage, update GitHub issue |
| `/open-pr #N` | Determine version bump, update VERSION/CHANGELOG/stack files, create PR with spec-driven summary |
| `/address-pr-comments [#N] [--max-rounds=K]` | Close the PR review loop: read automated-reviewer threads, apply fixes via `/write-code` + `/verify-code`, reply and resolve until review-clean |
| `/run-retro` | Batch-analyze defect specs to identify spec-writing gaps and produce `steering/retrospective.md` with actionable learnings |
| `/run-loop [#N]` | Run the full SDLC pipeline from within an active Claude Code session — processes a specific issue or loops over all open issues via `sdlc-runner.mjs` |
| `/end-loop` | Stop unattended mode and clear runner state |
| `/upgrade-project` | Upgrade an existing project to current plugin standards — relocates legacy `.claude/steering/` and `.claude/specs/` to the project root |
| `/init-config` | Generate an `sdlc-config.json` for the SDLC runner |
| `/onboard-project [--dry-run] [--design-url <url>]` | Initialize a project for the SDLC — greenfield bootstrap (interview, steering, `VERSION` + stack-native manifest init at `0.1.0`, `v1` milestone seeding, 3–7 starter issues), greenfield-enhancement re-run, or brownfield spec reconciliation (always includes the current source tree; when a manifest declares a version, `VERSION` mirrors it — otherwise seeds `0.1.0`; with zero closed issues, deterministically backfills specs from the source tree) |

## Updating

```bash
/plugin marketplace update nmg-plugins
```

## License

MIT License. See [LICENSE](LICENSE) for details.
