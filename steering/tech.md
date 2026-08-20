# nmg-sdlc Technical Steering

This document defines the technical architecture, development standards, verification gates, and integration boundaries for nmg-sdlc.

---

## Architecture Overview

nmg-sdlc is an Oh My Pi extension with skills, agents, a Herdr CLI supervisor, and Node classifiers:

```text
package.json + src/extension.ts
        │
        ▼
Native /plan interactive skills
draft-issue → write-spec → onboard-project / upgrade-project
        │
        ▼
/sdlc-execute (main Herdr pane)
        │
        ├── herdr pane split + herdr agent start --kind omp
        ├── .omp/sdlc/run.json + handoffs
        └── GitHub issue/PR evidence

Contract scripts
        ├── lifecycle status inspection
        ├── execute helpers (parse, backlog, handoff, run state)
        ├── upgrade detectors
        ├── skill inventory audit
        ├── plugin-surface validation
        └── deterministic exercise fixtures
```

Interactive skills interview with built-in `ask` and finish at `xd://propose`. Scripts may inspect, classify, or validate contracts, but do not select product scope. Automated workers never call `ask`. Sequencing is `Depends on:` between ordinary issues.

---

## Technology Stack

| Component | Technology | Minimum |
|-----------|------------|---------|
| Extension factory | `src/extension.ts` default export | OMP `omp.extensions` |
| Skill and reference contracts | Markdown + YAML frontmatter | OMP skill loader |
| Task agents | `agents/*.md` | OMP `listOmpExtensionRoots` |
| Delivery supervisor | Herdr CLI | Herdr 0.8.0 hook contract (`HERDR_ENV=1`, `HERDR_SOCKET_PATH`, `HERDR_PANE_ID`) |
| BDD specifications | Gherkin | Gherkin 6+ |
| Contract and inspection scripts | Node.js ESM | Node.js 20+ |
| Test suite | Jest ESM | Jest 29+ |
| GitHub integration | `gh` CLI / GraphQL where required | Authenticated current CLI |
| Plugin packaging | root `package.json` | `omp.extensions` = `["./src/extension.ts"]` |

### Automated Review

`address-pr-comments` may address a review thread only when its author
matches this configuration. Human-reviewer threads always remain outside the
automated fix loop.

| Predicate | Value | Meaning |
|-----------|-------|---------|
| `bots` | `true` | Any GitHub author with `__typename: Bot` is eligible. |
| `logins` | `["coderabbitai"]` | Explicit automated-reviewer logins are eligible in addition to the Bot predicate. |

Runtime scripts should remain zero-dependency outside Node built-ins. Jest is a development dependency isolated to `scripts/`.

---

## Versioning

`VERSION` is the single version source. Stack-specific files are synchronized during `open-pr`.

| File | Path | Notes |
|------|------|-------|
| `VERSION` | file text | Source of truth |
| `package.json` | `version` | OMP plugin manifest version |
| `.claude-plugin/plugin.json` | `version` | Marketplace catalog pointer |

During the v3 landing, all three are `3.0.0`.

### Version Bump Classification

| Label | Bump Type | Description |
|-------|-----------|-------------|
| `bug` | patch | Backwards-compatible defect fix |
| `enhancement` | minor | Backwards-compatible capability |

Default unmatched issues to minor. Never infer major. A leftover `spike` label is unmatched.

Approved major note used by `open-pr`: a line in the approved spec `requirements.md` or `design.md` matching `^\*\*Version bump\*\*:\s*major\s*$` (case-insensitive). If the issue title or body contains `BREAKING` and that line is absent, fail closed with `reasonCode: major_bump_required`. There is no `--major` CLI flag and no interactive version gate.

`open-pr` reads this table, updates `VERSION`, `package.json` `version`, `.claude-plugin/plugin.json` `version`, declared stack files, and `CHANGELOG.md`, then includes all version artifacts in the delivery commit.

The delivery stage continues through checks, review remediation, exact-head merge, and issue closure. A prepared or open PR is not a successful terminal state.

Breaking changes still use the accepted bump unless the approved major note is present. Mark them under `### Changed (BREAKING)` and provide migration notes.

---

## OMP Extension Standards

Before introducing a new OMP-facing feature or changing model/tool behavior, verify current official Oh My Pi documentation.

### Skill Bundles

**Authoring rule for workers:** Every file under `skills/{skill}/`, every root `references/*.md`, and every `agents/*.md` must be created or edited through `/skill:skill-creator` when that skill is loaded. If it is missing, fail the handoff with `reasonCode: skill_creator_missing`. There is no hand-edit fallback in workers. The v3 landing of this repository is exempt and edits files directly.

SKILL.md frontmatter declares only `name` and `description`.

| Aspect | Standard |
|--------|----------|
| Trigger description | State what the skill does, when to use it, and important exclusions |
| Entry size | Keep under 500 lines; move details to on-demand references |
| Integration | Every skill includes `Integration with SDLC Workflow` |
| Arguments | Treat `$ARGUMENTS` as untrusted data and validate accepted shapes |
| Interactive decisions | Built-in `ask` inside native `/plan` only |
| Worker decisions | Failed handoff; never `ask` |
| Supporting content | Place single-skill details within that skill bundle |
| Shared content | Use root `references/` only for contracts with multiple consumers |

### Agent Files

Files under `agents/` are installable OMP task agents. Required frontmatter: `name` and `description`. Optional: `model`, `autoloadSkills`, `tools`.

`model` is only `@fast`, `@review`, or `@good` when those roles are documented as configured. If a role is unset, omit `model`. Never hardcode provider model ids.

| File | `name` | `model` | `autoloadSkills` |
|------|--------|---------|------------------|
| `agents/starter.md` | `starter` | `@fast` | `["start-issue"]` |
| `agents/spec-implementer.md` | `spec-implementer` | omit | `["write-code","simplify","skill-creator"]` |
| `agents/architecture-reviewer.md` | `architecture-reviewer` | `@review` | `["verify-code"]` |
| `agents/deliverer.md` | `deliverer` | omit | `["open-pr","address-pr-comments"]` |

`execute` does not use the OMP `task` tool for pipeline steps. Herdr sessions are the isolation boundary.

### Plugin Manifest

| Aspect | Standard |
|--------|----------|
| Location | root `package.json` |
| Extensions | `omp.extensions` is exactly `["./src/extension.ts"]` |
| Skills | package-root `skills/` (directory convention; `omp.skills` may also list `["./skills"]`) |
| Agents | package-root `agents/*.md` via OMP `listOmpExtensionRoots` |
| Catalog pointer | `.claude-plugin/plugin.json` → `./skills/` |
| Version | Semver synchronized with `VERSION` by delivery |
| Validation | `node scripts/verify-plugin-surface.mjs --root . --label repository` |

Do not add `omp.agents`. Do not add `.omp-plugin/marketplace.json` in this repository.

---

## Coding Standards

### Markdown

- Use ATX headings and a clear H1 → H2 → H3 hierarchy.
- Use tables for repeated structured mappings.
- Use language-tagged code fences.
- Keep instructions imperative, testable, and free of ambiguous defaults.
- Avoid inline HTML except managed comments.
- Preserve truthful historical specs and released changelog entries.

### JavaScript

- Use ESM imports and `node:` built-ins.
- Use `node:path` for cross-platform paths.
- Prefer argument arrays over shell interpolation.
- Validate CLI arguments at entry and provide stable exit codes.
- Distinguish read/parse failures from contract violations.
- Do not follow symlinks when enforcing a root or deletion boundary.
- Avoid synchronous I/O in repeated hot paths; bounded CLI startup inspection may use it when clarity improves.

### TypeScript

- `src/extension.ts` uses a local structural `ExtensionAPI` type. Do not add an `@oh-my-pi` dependency.

### JSON and YAML

- Use 2-space indentation.
- Preserve unrelated keys and formatting when targeted edits are possible.
- Parse before writing and re-parse after writing.
- Never add comments to JSON.
- Validate issue-form YAML structure, unique ids/labels/options, and required-field semantics.

---

## API / Interface Standards

### Skill Interface

Public skill behavior consists of:

- trigger-oriented two-key frontmatter;
- ordered workflow steps;
- explicit preconditions and postconditions;
- interactive `/plan` interview or automated handoff;
- error states naming exact paths or remote objects;
- an Integration with SDLC Workflow section.

### GitHub CLI

Use `gh` for scoped issue, project, PR, check, and GraphQL operations. Treat issue titles, bodies, comments, paths, and API values as data. Prefer `--body-file` or safe API arguments for multiline untrusted content.

Read-only evidence gathering does not authorize a write. Issue creation, status changes, comments, PR creation, thread resolution, merge, label mutation, and Project updates remain owned by their explicit workflow stages. `open-pr` owns the configured exact-head merge after a successful worker run; `upgrade-project` owns only separately approved repair groups.

### Managed Repository Assets

| Artifact | Ownership |
|----------|-----------|
| Contribution workflow | Requires the managed marker/version; unmarked collision is preserved |
| Structured issue form | Exact managed target path; unrelated templates are preserved |
| Root AGENTS guidance | Only the marked spec-context section is managed |
| Contribution guide | Targeted workflow section and README link; existing policy is preserved |
| V2 cleanup | Exact regular-file paths and exact entries inside recognized ignore blocks |

Onboarding owns managed assets for new projects. Upgrade owns reconciliation and cleanup for existing projects.

---

## Testing Standards

### Core Principle: Contract and Exercise Verification

Skill Markdown is executable instruction content. Verification therefore combines static contract tests, deterministic fixture exercises, and live OMP / Herdr exercises where the acceptance criteria require actual tool behavior.

Every executable issue acceptance criterion has a corresponding Gherkin scenario or an explicit documented reason why runtime execution is the evidence source.

| Layer | Method | Location |
|-------|--------|----------|
| BDD design | Gherkin scenarios | `specs/*/feature.gherkin` |
| Contract tests | Jest ESM | `scripts/__tests__/` |
| Skill fixtures | Deterministic artifact/rubric runner | `scripts/__fixtures__/skill-exercise/` |
| Live skill proof | Disposable project via `omp --print --no-session` | Verification evidence |
| Installed-surface proof | Fresh install or actual upgrade root | Release verification evidence |

### Disposable Exercise Pattern

1. Create a temporary project with only the files required by the skill.
2. Initialize git and, when necessary, a disposable GitHub repository or dry-run fixture.
3. Load this repository's extension and skills.
4. Invoke the changed skill with `omp --print --no-session`.
5. Compare filesystem, command, and rendered-output artifacts with the approved spec.
6. Remove the temporary project after capturing evidence.

Do not pollute production repositories to prove issue/PR content. When a remote mutation is not essential, evaluate the exact command/body artifact through a deterministic fixture.

### Verification Evidence Boundaries

- Local source tests prove the source tree only.
- A staged-release fixture proves the packaged candidate only.
- A clean installed root plus fresh session proves discovery behavior.
- An actual consumer-project upgrade proves cleanup and preservation behavior.
- GitHub checks and mergeability are separate from local test success.

Never infer a stronger layer from a weaker one.

---

## Verification Gates

`verify-code` enforces applicable gates as hard requirements:

| Gate | Condition | Action | Pass Criteria |
|------|-----------|--------|---------------|
| Contract tests | `scripts/__tests__/` exists | `cd scripts && npm test` | Exit 0; no unexpected skips or orphaned imports |
| Skill inventory | Skill/reference/agent surface changed | `node scripts/skill-inventory-audit.mjs --check` | Exit 0 and baseline current |
| OMP plugin surface | Plugin surface changed | `node scripts/verify-plugin-surface.mjs --root . --label repository` | Exit 0 |
| Skill creator validation | Skill-bundled files changed in a worker | Validate each affected skill through `/skill:skill-creator` | All bundles valid, or handoff `skill_creator_missing` |
| Skill exercise | Changed skill has a deterministic fixture | `node scripts/skill-exercise-runner.mjs --skill <name>` | Exit 0 and rubric satisfied |
| Prompt quality | Skill contract changed | Review against Prompt Quality Criteria | Every criterion satisfied |
| Git hygiene | Any tracked text changed | `git diff --check` | Exit 0 |

Exercise live proof uses `omp --print --no-session` loading this repository's skills, not `codex exec`.

### Condition Evaluation

- Evaluate changed-file conditions against the actual scoped diff.
- A missing applicable fixture is a named verification gap, not an implicit pass.
- A command pass must include exit status and relevant output summary.
- Published-install acceptance criteria remain incomplete until the published artifact exists.

### Contract Framework

| Contract | Question |
|----------|----------|
| Preconditions | What must exist or be true before the component runs? |
| Postconditions | What exact artifacts or state must exist afterward? |
| Invariants | What remains true throughout execution? |
| Boundaries | What must the component never do? |

### Skill-Level Invariants

- Stack-specific details come from project steering.
- Interactive decisions wait inside native `/plan` with `ask`.
- Automated skills write failed handoffs instead of asking.
- Skills do not mutate beyond their declared stage.
- Pull-request delivery is incomplete until exact-head merge and issue closure are proven.
- Dirty unrelated work is preserved.
- Skill-bundled worker edits route through `/skill:skill-creator`.
- Active spec context is bounded; historical specs are preserved.
- Remote writes require the owning workflow and exact target.

### Prompt Quality Criteria

| Criterion | Check |
|-----------|-------|
| Unambiguous instructions | Each step has one testable interpretation |
| Complete paths | Success, empty, failure, and user-decline branches are covered |
| Correct tool references | OMP-native tools and safe argument handling are used |
| Logical ordering | Every step depends only on previously available evidence |
| Gate integrity | Interactive skills wait in `/plan`; workers never call `ask` |
| Output chain | Postconditions satisfy the downstream skill's preconditions |
| Cross-reference validity | Every referenced file exists in the packaged surface |
| Historical boundary | Active claims do not rewrite or load historical records as capability |

### Checklist Applicability

| Checklist | Runtime scripts | Markdown contracts |
|-----------|-----------------|--------------------|
| SOLID | Module responsibility and dependency direction | One workflow responsibility; shared rules referenced, not duplicated |
| Security | Input/path validation, no shell injection, safe deletion | Exact scope, no secret requests, safe command examples |
| Performance | Bounded scans, concurrency where safe | Progressive disclosure and bounded context loading |
| Testability | Deterministic inputs, stable diagnostics | Steps produce observable artifacts and independent scenarios |
| Error handling | Stable exit codes and exact errors | Named gaps, preservation, and non-overstated completion |

---

## Environment Variables

### Required When Applicable

| Variable | Purpose |
|----------|---------|
| `GITHUB_TOKEN` | Authenticated GitHub operations and private marketplace access |
| `HERDR_ENV` | Must be `1` for `/sdlc-execute` |
| `HERDR_SOCKET_PATH` | Herdr 0.8.0 socket for execute |
| `HERDR_PANE_ID` | Calling pane id for execute splits |

No optional environment variable may change interactive `/plan` behavior or broaden mutation scope.

---

## References

- Product direction: `steering/product.md`
- Repository organization: `steering/structure.md`
- Project instructions: `AGENTS.md`
- Public workflow: `README.md`
