# nmg-plugins Technical Steering

This document defines the technology stack, constraints, and integration standards.
All technical decisions should align with these guidelines.

---

## Architecture Overview

```
Codex CLI
    ↓ (plugin system)
nmg-sdlc Plugin
    ├── Skills (SKILL.md files — prompt-based workflows)
    ├── Agents (Markdown prompt contracts for optional Codex delegation)
    └── Templates (spec, steering, checklist files)

SDLC Runner (automation layer)
    ├── run-loop Skill (in-session)
    └── sdlc-runner.mjs (Node.js orchestrator)
        └── Spawns `codex exec` subprocesses per SDLC step
```

---

## Technology Stack

| Layer | Technology | Version |
|-------|------------|---------|
| Plugin host | Codex CLI | Latest |
| Skill definitions | Markdown (SKILL.md) | N/A |
| Automation runner | Node.js (ESM) | v24+ |
| Issue tracker | GitHub Issues + Projects | gh CLI |
| Automation runner | Node.js (sdlc-runner.mjs) | v24+ |

### External Services

| Service | Purpose | Notes |
|---------|---------|-------|
| GitHub API | Issue/PR management, branch creation | Via `gh` CLI; requires `GITHUB_TOKEN`. Sub-issue parent queries (`gh issue view --json parent`) require `gh` >= 2.62.0. If an older `gh` is installed, parent-link resolution in `/write-spec` and `/open-pr` degrades gracefully — the `parent` field is absent from the JSON response, so resolution falls back to body-cross-ref parsing (`Depends on: #N`, `Blocks: #N`) with a logged warning. |
| Console/Log | Status updates from SDLC runner | Via log files in `<tmpdir>/sdlc-logs/` |
| OpenAI API | Powers Codex sessions | Underlying LLM for all skills |

### Automated Review

The `/address-pr-comments` skill reads this section to decide which PR review threads it may address. Treat threads whose author satisfies either predicate below as in-scope; all other threads (including human reviewers) are out of scope and left untouched.

| Predicate | Default | Description |
|-----------|---------|-------------|
| `bots` | `true` | When `true`, any thread whose first comment has `author.__typename == "Bot"` is eligible |
| `logins` | `["codex[bot]"]` | Explicit GitHub login allow-list (in addition to the Bot typename rule); add a login here to opt a new reviewer in |

Modify the defaults above to change the eligibility rules — no skill or script changes are needed. The skill fails closed: if this section is missing or malformed, `/address-pr-comments` treats every thread as out of scope and exits with the no-reviewer message.

---

## Versioning

The `VERSION` file at the project root is the single source of truth for the current version. Stack-specific files are kept in sync via `/open-pr`.

| File | Path | Notes |
|------|------|-------|
| `.codex-plugin/plugin.json` | `version` | Codex plugin manifest version |

### Version Bump Classification

The `/open-pr` skill and the `sdlc-runner.mjs` deterministic bump postcondition both read this table to classify version bumps. Modify this table to change the classification rules — no skill or script changes are needed.

| Label | Bump Type | Description |
|-------|-----------|-------------|
| `bug` | patch | Bug fix — backwards-compatible |
| `enhancement` | minor | New feature — backwards-compatible |
| `spike` | skip | Research-only PR — no release, no bump |

The `skip` verdict is a special value — not a placeholder. When `skip` is the classified bump type, `/open-pr` skips Steps 2 and 3 entirely and produces a PR with no version change. The spike-skip logic is implemented in `skills/open-pr/references/version-bump.md` § Spike handling; this row makes the classification discoverable in the canonical table.

**Default**: If an issue's labels do not match any row, the bump type is **minor**.

**Major bumps are manual-only.** They are never triggered by labels, milestones, or breaking changes. A developer must opt in explicitly via `/open-pr #N --major`; the SDLC runner will not apply a major bump. In unattended mode, `--major` escalates and exits without bumping — major-version bumps are a deliberate release decision that a headless runner cannot make on a human's behalf.

**Breaking changes use minor bumps.** A `### Changed (BREAKING)` sub-section in a CHANGELOG version entry does NOT override the bump type. Communicate the breaking nature via a `**BREAKING CHANGE:**` bold prefix on the affected bullet, and (recommended) add a `### Migration Notes` sub-section to the entry. Example:

```markdown
## [1.50.0] - 2026-04-19

### Changed (BREAKING)

- **BREAKING CHANGE:** Renamed `foo()` to `bar()`; update callers accordingly.

### Migration Notes

Replace any calls to `foo(x)` with `bar(x)` — the signature is otherwise unchanged.
```

---

## Technical Constraints

### Performance

| Metric | Target | Rationale |
|--------|--------|-----------|
| Skill execution | Reasonable for task complexity | Skills are interactive; no hard time limits in manual mode |
| Runner step timeout | Per-step config (5–30 min) | Prevents runaway automation sessions |

### Cross-Platform Compatibility

This project MUST work on macOS, Windows, and Linux. All contributions must respect cross-platform constraints:

| Constraint | Guideline |
|------------|-----------|
| File paths | Use forward slashes or `path.join()` — never hardcode `\` or `/` separators |
| Line endings | Files should use LF (`\n`); configure `.gitattributes` if needed |
| Shell commands in skills | Use POSIX-compatible commands; avoid Bash-specific syntax (e.g., `[[ ]]`, `<<<`) |
| Scripts | Node.js scripts must use `node:path` for path manipulation, never string concatenation |
| Case sensitivity | Treat file paths as case-sensitive (Linux is case-sensitive, macOS/Windows are not by default) |
| Symlinks | Do not rely on symlinks for core functionality (Windows requires elevated privileges) |
| Environment variables | Use cross-platform approaches; document platform differences where unavoidable |
| Executable permissions | Document `chmod +x` requirements; Windows users may need alternative setup |

### Security

| Requirement | Implementation |
|-------------|----------------|
| GitHub authentication | `GITHUB_TOKEN` env var or gh CLI auth |
| No secrets in code | Steering docs and specs committed to repo; no credentials |
| Plugin permissions | Declared in SKILL.md `allowedTools` sections |

---

## Codex Resource Development

**Before creating or modifying any Codex resource (skill, agent, hook, plugin manifest), review the official Codex documentation to ensure best practices are followed.**

### Skills (SKILL.md and the rest of the skill bundle)

**Authoring rule:** Any time a **skill-bundled file** is created or edited — whether by a human or by an SDLC workflow (spec implementation, verify-code autofix, etc.) — the work MUST be driven through the `skill-creator` skill (`/skill-creator`). A skill-bundled file is anything inside a skill's directory tree (`skills/{skill}/SKILL.md` and everything under `skills/{skill}/references/`, `scripts/`, `templates/`, `checklists/`, `assets/`), every file in `references/` at the plugin/repo root (cross-skill shared references), and every prompt contract under `agents/*.md`. `skill-creator` enforces Codex plugin best practices for frontmatter, triggering descriptions, structure, and validation; bundled files that ride alongside a SKILL.md inherit the same authoring contract because they are loaded by the same skill at runtime and their wording shapes how the skill behaves.

**No hand-edit fallback.** If `/skill-creator` is unavailable, do not silently fall back to direct Codex editing. In interactive mode, surface the missing dependency to the user and stop. In unattended mode, emit an `ESCALATION:` line stating `/skill-creator is required for skill-bundled file edits` and exit non-zero. The earlier "fall back to direct authoring with a warning" path is removed — it consistently produced silent drift from skill-creator's best practices.

| Aspect | Best Practice |
|--------|---------------|
| Authoring tool | **Always use `/skill-creator` for creation and edits** — never hand-edit SKILL.md |
| Frontmatter | Use YAML frontmatter for `name` and `description` only; put UI metadata in `agents/openai.yaml` when needed |
| Size | Keep under 500 lines — move detailed reference material to separate files |
| Arguments | Use `$ARGUMENTS` placeholder to capture user input |
| Supporting files | Place templates, examples, and scripts alongside SKILL.md in the skill directory |
| Dynamic context | Use `` !`command` `` syntax to inject shell output before Codex processes the skill |

### Agents (.md files)

| Aspect | Best Practice |
|--------|---------------|
| Frontmatter | Use YAML frontmatter for `name`, `description`, `tools`, `disallowedTools`, `model`, `maxTurns`, `permissionMode` |
| Tool access | Grant only necessary tools — use `disallowedTools` to deny inherited ones |
| Focus | Each agent should excel at one specific task |
| Description | Write detailed descriptions — Codex uses them to decide when to delegate |

### Plugin Manifests

| Aspect | Best Practice |
|--------|---------------|
| plugin.json location | Codex manifest goes inside `.codex-plugin/`; all other components stay at plugin root |
| Component paths | Must be relative, starting with `./` (no absolute or traversing paths) |
| Versioning | Semver (MAJOR.MINOR.PATCH); update `.codex-plugin/plugin.json` and any stack-specific version files |
| Testing | Use `codex exec --cd ./my-plugin` during development |

---

## Coding Standards

### Markdown (Skills, Templates, Steering)

```markdown
# GOOD patterns
- Use ATX-style headings (# not ===)
- Tables for structured data
- Code blocks with language hints
- Clear section hierarchy: H1 > H2 > H3
- TODO comments with <!-- TODO: --> for user-customizable sections

# BAD patterns
- Inline HTML (except comments)
- Deeply nested lists (prefer tables)
- Ambiguous placeholder text
```

### JavaScript (Runner Scripts)

```javascript
// GOOD patterns
- ESM imports (import/from)
- Node.js built-in modules (node:child_process, node:fs, node:path)
- parseArgs for CLI argument parsing
- JSDoc comments for script headers
- Explicit error handling with process.exit codes

// BAD patterns
- CommonJS require()
- External npm dependencies (scripts must be zero-dependency)
- Synchronous I/O in hot paths
```

### JSON (Plugin Manifests, Config)

```json
// GOOD patterns
- Consistent 2-space indentation
- Descriptive field names (camelCase)
- Version strings following semver

// BAD patterns
- Trailing commas
- Comments (not valid JSON)
- Deeply nested structures
```

---

## API / Interface Standards

### Plugin Interface

Skills are defined as Markdown files (`SKILL.md`) with:
- Workflow steps (numbered, imperative)
- `allowedTools` sections listing permitted tool patterns
- Integration with SDLC Workflow section
- Unattended-mode conditionals for headless operation

### GitHub CLI (`gh`)

```bash
# Issue operations
gh issue view <number> --json title,body,labels
gh issue develop <number> --checkout
gh issue comment <number> --body "..."

# PR operations
gh pr create --title "..." --body "..."
gh pr checks <number>
gh pr merge <number> --merge
```

---

## Database Standards

<!-- Pre-fill if database conventions are discoverable -->

### Naming

| Element | Convention | Example |
|---------|------------|---------|
| Tables | [convention] | [example] |
| Columns | [convention] | [example] |
| Primary keys | [convention] | [example] |

---

## Testing Standards

### Core Principle: Exercise-Based Verification

**This project is a Codex plugin. Skills are Markdown instructions, not executable code. The only way to verify a skill change is to exercise it in Codex.**

Traditional test frameworks (Jest, pytest, etc.) apply only to the SDLC runner script. For everything else — skills, agents, templates — verification means loading the plugin and running the skill against a real or test project.

### BDD Testing

**Every acceptance criterion MUST have a Gherkin test.**

| Layer | Framework | Location |
|-------|-----------|----------|
| BDD specs | Gherkin feature files | `specs/{feature-name}/feature.gherkin` |
| Runner tests | Jest (ESM) | `scripts/__tests__/` |

Gherkin specs serve as **design artifacts and verification criteria** — they define the expected behavior that exercise-based testing validates.

```gherkin
# specs/{feature-name}/feature.gherkin
Feature: [Feature name from issue title]
  As a [developer/automation agent]
  I want [capability]
  So that [benefit]

  Scenario: [Acceptance criterion]
    Given [precondition]
    When [action]
    Then [expected outcome]
```

### Plugin Exercise Testing

#### Loading the Plugin for Development

```bash
codex exec --cd /path/to/test-project "/nmg-sdlc:skill-name args"
```

Then invoke each changed skill directly (e.g., `/nmg-sdlc:write-spec #42`) and verify:
- The skill loads without errors
- Workflow steps execute in the expected order
- Output artifacts (files, GitHub comments, PR bodies) match downstream skill expectations
- Interactive gates appear in manual mode (or are skipped when `.codex/unattended-mode` exists)

#### Test Project Pattern

When verifying SDLC skill changes, exercise them against a **disposable test project** — not the nmg-plugins repo itself:

1. **Scaffold** a temporary project directory with minimal structure:
   - `README.md`, a basic source file, and `.gitignore`
   - `steering/` with minimal `product.md`, `tech.md`, `structure.md`
   - Initialized git repo (`git init`) for branch/commit operations
   - A GitHub repo if the skill under test needs issue/PR operations (or use dry-run evaluation — see below)
2. **Load** the modified plugin: `codex exec --cd /path/to/test-project "/nmg-sdlc:skill-name args"`
3. **Exercise** the changed skill against the test project
4. **Evaluate** the output against the spec's acceptance criteria
5. **Clean up** the test project after verification

#### Dry-Run Evaluation for GitHub-Integrated Skills

For skills that create GitHub resources (`/draft-issue`, `/open-pr`, `/start-issue`):

| Instead of... | Do this... |
|---------------|------------|
| Creating a real GitHub issue | Generate the issue title, body, and labels; evaluate the content against ACs |
| Creating a real PR | Generate the PR title, body, and branch diff; evaluate completeness |
| Setting issue status | Verify the `gh` commands that WOULD be invoked are correctly formed |

This avoids polluting real repositories during verification while still validating that the skill produces correct output. **The content and structure of what the skill would create is the testable artifact.**

#### Automated Exercise Testing via Codex

Use `codex exec` for non-interactive smoke tests. Skills that normally request user input must be given enough context up front and instructed to choose deterministic defaults:

```bash
codex exec \
  --cd /path/to/test-project \
  --full-auto \
  "Exercise the skill: /nmg-sdlc:skill-name args"
```

This tests the non-interactive execution path. For full interactive paths, run the skill manually in Codex and record the transcript as verification evidence.

### Validation Approach Summary

| Type | Method | Applies To | interactive user prompt |
|------|--------|------------|-----------------|
| Codex exec smoke test | `codex exec --cd <test-project>` | Quick verification | Provide deterministic context up front |
| Manual Codex exercise | Interactive Codex session | Skills with interactive gates | Full support |
| Spec verification | `/verify-code` skill — behavioral contract checking | All changes | N/A |
| Architecture review | Inline review by default; optional Codex `explorer` delegation when explicitly authorized — 5 checklists scored 1–5 | Code structure, scripts | N/A |
| Runner unit tests | Jest (`npm test` in `scripts/`) | `sdlc-runner.mjs` | N/A |
| Structural validation | Verify `.codex-plugin/plugin.json` schema and file existence | Plugin manifest | N/A |
| Prompt quality review | Unambiguous instructions, complete workflow paths, correct tool references | SKILL.md files | N/A |

---

## Verification Gates

Declare mandatory verification steps that `/verify-code` enforces as hard gates. Each gate specifies when it applies, what command to run, and how to determine success.

This project is prompt-based: skills are Markdown instructions that Codex executes. Traditional code quality metrics (test coverage, cyclomatic complexity) don't apply to most of the codebase. The gates below combine automated tests (for the runner script) with contract-based review (for skills and templates). Verification uses **Design by Contract** — each skill and component has preconditions, postconditions, invariants, and behavioral boundaries that `/verify-code` checks.

| Gate | Condition | Action | Pass Criteria |
|------|-----------|--------|---------------|
| SDLC runner tests | `scripts/__tests__/` directory exists | `cd scripts && npm test` | Exit code 0 |
| Skill exercise test | Any `skills/**/SKILL.md` file changed | Load plugin and invoke changed skill against a test project (see Testing Standards → Test Project Pattern) | Skill produces expected output OR verification report explicitly notes manual exercise follow-up |
| Skill inventory audit | Any `skills/**/SKILL.md` or `**/references/**` file changed | `node scripts/skill-inventory-audit.mjs --check` | Exit code 0 |
| Prompt quality review | Any `skills/**/SKILL.md` file changed | Review against Prompt Quality Criteria below | All criteria satisfied |
| Behavioral contract review | Any skill or script changed | Review against Contract Framework below | Preconditions, postconditions, invariants, and boundaries all addressed |

### Condition Evaluation Rules

- `Always` — gate always applies
- `{path} directory exists` — gate applies only when the directory is present (`test -d {path}`)
- `{glob} file changed` — gate applies only when matching files are in the diff

### Pass Criteria Evaluation Rules

- `Exit code 0` — the Action command must exit with code 0
- `{file} file generated` — the named file must exist after the Action command completes (artifact verification)
- `output contains "{text}"` — stdout or stderr must contain the specified text
- Textual criteria (e.g., "reviewer confirms ...") are evaluated by `/verify-code` against the verification report

### Self-Verification (Dogfooding)

This project develops the SDLC toolkit itself. When `/verify-code` runs for changes to SDLC skills, it MUST go beyond static analysis:

1. **Read the changed skill** — verify prompt quality (unambiguous, complete, correct tool refs)
2. **Check behavioral contracts** — preconditions, postconditions, invariants per the tables below
3. **Exercise the skill** — if feasible within the verification session, load the plugin and invoke the changed skill against a test project (see Testing Standards → Test Project Pattern)
4. **Evaluate output** — for GitHub-integrated skills, evaluate what WOULD be created rather than creating real artifacts (see Testing Standards → Dry-Run Evaluation)

If exercise testing is not feasible during automated verification (time or tool constraints), `/verify-code` should explicitly note this in the verification report and recommend manual exercise testing as a follow-up.

### Contract Framework

| Contract Type | Question It Answers |
|---------------|-------------------|
| **Preconditions** | What must be true before the skill/component runs? |
| **Postconditions** | What must be true after successful execution? |
| **Invariants** | What must remain true throughout execution? |
| **Behavioral boundaries** | What must the skill/component NOT do? |

### Skill-Level Contracts

Every skill has implicit contracts. When verifying a skill change, check:

#### Preconditions (Step 0 / Prerequisites)
- Required files exist (specs, steering docs, issues)
- Required tools are available (`gh` CLI, git)
- Correct branch / working directory state

#### Postconditions (Step N / Output)
- Output files created in the correct location and format
- GitHub issue/PR updated with expected content
- No orphaned files or partial state left behind
- Downstream skills can consume the output (e.g., `/write-spec` output feeds `/write-code`)

#### Invariants (Throughout Execution)
- Stack-agnostic: no project-specific technology hardcoded in skill instructions
- Steering docs used as the abstraction layer for project-specific details
- Unattended-mode gates: interactive prompts present unless `.codex/unattended-mode` exists
- Cross-platform: no platform-specific paths, commands, or assumptions

#### Behavioral Boundaries
- Skills must not modify files outside their declared scope
- Skills must not commit, push, or merge unless that is their explicit purpose
- Skills must not skip interactive gates in manual mode
- Skills must not introduce dependencies on external services not declared in tech.md

### Checklist Applicability

The architecture-reviewer checklists were designed for runtime codebases. Apply them to nmg-plugins with these adjustments:

| Checklist | Applies To | Skip For | Reinterpretation |
|-----------|-----------|----------|-----------------|
| SOLID | Scripts (sdlc-runner.mjs) | Markdown skills | For skills: SRP = one skill does one workflow step; DIP = skills reference steering docs, not hardcoded details |
| Security | Scripts | Markdown templates | Focus: no secrets in committed files, safe `gh` CLI patterns, no shell injection in skill commands |
| Performance | Runner script | Skills, templates | Focus: runner timeouts configured, no blocking operations |
| Testability | All — reinterpret | N/A | For skills: steps can be followed manually with predictable results; scenarios are independent; templates produce valid output |
| Error Handling | Scripts | Markdown skills | Focus: runner exit codes, graceful failures with meaningful stderr |

### Prompt Quality Criteria

For Markdown skills, the "code quality" equivalent is prompt quality. The Prompt Quality Review gate above is satisfied when every row of this table is addressed:

| Criterion | What to Check |
|-----------|---------------|
| **Unambiguous instructions** | Each step has one clear interpretation; no room for Codex to guess |
| **Complete workflow paths** | Happy path, error/edge cases, and unattended mode all covered |
| **Correct tool references** | Skills use Codex-native language from `references/codex-tooling.md` and do not name legacy-only tools |
| **Logical step ordering** | Dependencies flow forward; no step references information from a later step |
| **Gate integrity** | Decision points have interactive user prompt (or unattended-mode bypass) |
| **Template-output chain** | Output format matches what downstream skills expect as input |
| **Cross-reference validity** | Links to templates, checklists, and other skills resolve correctly |

### Script Verification

For `sdlc-runner.mjs` and other runtime scripts:

| Contract | Check |
|----------|-------|
| Preconditions | Required env vars documented; input validation at entry point |
| Postconditions | Non-zero exit on failure; meaningful stdout/stderr; no partial state on error |
| Invariants | Zero external dependencies (`node:*` only); cross-platform paths via `node:path` |
| Boundaries | No network calls beyond declared services; idempotent re-runs |

---

## Environment Variables

### Required

| Variable | Description |
|----------|-------------|
| `GITHUB_TOKEN` | GitHub access for `gh` CLI operations and private marketplace updates |

### Optional

| Variable | Description |
|----------|-------------|
| `OPENCLAW_DISCORD_CHANNEL` | Discord channel ID for automation status updates |

---

## References

- AGENTS.md for project overview
- `steering/product.md` for product direction
- `steering/structure.md` for code organization
