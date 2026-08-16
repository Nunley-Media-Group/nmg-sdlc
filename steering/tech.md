# nmg-sdlc Technical Steering

This document defines the technical architecture, development standards, verification gates, and integration boundaries for nmg-sdlc.

---

## Architecture Overview

nmg-sdlc is a prompt-driven Codex plugin with deterministic validators and exercise tooling:

```text
Codex plugin manifest
        │
        ▼
Manual skill pipeline
draft → start executable child → spec → implement → simplify → verify → terminal delivery
        │
        ├── project steering and bounded spec context
        ├── managed repository assets
        └── GitHub issue/PR evidence

Contract scripts
        ├── prompt configuration repair
        ├── lifecycle status inspection
        ├── skill inventory audit
        ├── plugin-surface validation
        └── deterministic exercise fixtures
```

Every workflow decision is interactive. Scripts may inspect, classify, or validate contracts, but do not select product scope or advance lifecycle state on their own. Epic membership is coordination metadata: epics cannot enter the executable pipeline, while their children use the ordinary dependency graph.

---

## Technology Stack

| Component | Technology | Minimum |
|-----------|------------|---------|
| Skill and reference contracts | Markdown + YAML frontmatter | Codex plugin-compatible |
| BDD specifications | Gherkin | Gherkin 6+ |
| Contract and inspection scripts | Node.js ESM | Node.js 20+ |
| Test suite | Jest ESM | Jest 29+ |
| GitHub integration | `gh` CLI / GraphQL where required | Authenticated current CLI |
| Plugin packaging | `.codex-plugin/plugin.json` | Current Codex plugin schema |

Runtime scripts should remain zero-dependency outside Node built-ins. Jest is a development dependency isolated to `scripts/`.

---

## Versioning

`VERSION` is the single version source. Stack-specific files are synchronized during `$nmg-sdlc:open-pr`.

| File | Path | Notes |
|------|------|-------|
| `.codex-plugin/plugin.json` | `version` | Plugin manifest version |

### Version Bump Classification

| Label | Bump Type | Description |
|-------|-----------|-------------|
| `bug` | patch | Backwards-compatible defect fix |
| `enhancement` | minor | Backwards-compatible capability |
| `spike` | skip | Research ADR only |

Default unmatched issues to minor. Major bumps are never inferred: the user must pass `$nmg-sdlc:open-pr #N --major` and approve the displayed major-version gate.

`$nmg-sdlc:open-pr` reads this table, updates `VERSION`, the manifest, declared stack files, and `CHANGELOG.md`, then includes all version artifacts in the delivery commit.

The delivery stage continues through checks, review remediation, exact-head merge, executable-issue closure, and eligible epic-ancestor reconciliation. A prepared or open PR is not a successful terminal state.

Breaking changes still use the accepted bump unless the user explicitly chooses major. Mark them under `### Changed (BREAKING)` and provide migration notes.

---

## Codex Plugin Standards

Before introducing a new Codex-facing feature or changing model/tool behavior, verify current official Codex documentation.

### Skill Bundles

**Authoring rule:** Every file under `skills/{skill}/`, every root `references/*.md`, and every `agents/*.md` prompt contract must be created or edited through `$skill-creator`. There is no hand-edit fallback. If the skill is unavailable, stop and tell the user which dependency is missing.

SKILL.md frontmatter declares only `name` and `description`.

| Aspect | Standard |
|--------|----------|
| Trigger description | State what the skill does, when to use it, and important exclusions |
| Entry size | Keep under 500 lines; move details to on-demand references |
| Integration | Every skill includes `Integration with SDLC Workflow` |
| Arguments | Treat `$ARGUMENTS` as untrusted data and validate accepted shapes |
| Decisions | Use `request_user_input` and wait for explicit user response |
| Supporting content | Place single-skill details within that skill bundle |
| Shared content | Use root `references/` only for contracts with multiple consumers |

### Agent Prompt Contracts

Files under `agents/` are reusable prompt contracts included in built-in Codex subagent prompts. They are not installable plugin components. Delegation is optional and only occurs after explicit user authorization.

Agent files use `name` and `description` frontmatter only, define one bounded task, inherit the parent session's available tools and permissions, and return structured evidence.

### Plugin Manifest

| Aspect | Standard |
|--------|----------|
| Location | `.codex-plugin/plugin.json` |
| Component paths | Relative paths beginning with `./`; no traversal |
| Repository | `https://github.com/Nunley-Media-Group/nmg-sdlc` |
| Version | Semver synchronized with `VERSION` by delivery |
| Validation | Parse JSON and verify all declared component roots exist |

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
- interactive decision gates;
- error states naming exact paths or remote objects;
- an Integration with SDLC Workflow section.

### Epic Specification Authority

- An issue classified as an epic is coordination-only: `start-issue`, `write-spec`, `write-code`, `verify-code`, and `open-pr` must not create an executable lifecycle for it.
- A child follows the same dependency and deliverable rules as an ordinary issue. Confirmed epic lineage is displayed but removed only from execution in-degree.
- `specs/epic-*` contains `requirements.md`, `design.md`, and `epic-scope.json` only. It owns cross-child outcomes and topology, never executable tasks or Gherkin.
- Each child package owns its AC/FR/task/scenario identifiers through `issue-scope.json` and links bidirectionally to the aggregate through `epic-link.json`.
- Legacy cumulative ownership, closed-state drift, and Project drift are audited read-only and repaired only as an exact, per-epic, explicitly approved, digest-revalidated mutation.

### GitHub CLI

Use `gh` for scoped issue, project, PR, check, and GraphQL operations. Treat issue titles, bodies, comments, paths, and API values as data. Prefer `--body-file` or safe API arguments for multiline untrusted content.

Read-only evidence gathering does not authorize a write. Issue creation, status changes, comments, PR creation, thread resolution, merge, label mutation, Project reconciliation, and epic close/reopen remain owned by their explicit workflow stages. `$nmg-sdlc:open-pr` owns the configured exact-head merge and post-merge eligible-ancestor closure after its approval gates; `$nmg-sdlc:upgrade-project` owns only separately approved repair groups.

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

Skill Markdown is executable instruction content. Verification therefore combines static contract tests, deterministic fixture exercises, and live Codex exercises where the acceptance criteria require actual tool behavior.

Every executable child acceptance criterion has a corresponding Gherkin scenario or an explicit documented reason why runtime execution is the evidence source. Epic aggregate outcomes deliberately have no Gherkin scenarios; completion is derived from all direct child closures plus valid aggregate/child authority.

| Layer | Method | Location |
|-------|--------|----------|
| BDD design | Gherkin scenarios | `specs/*/feature.gherkin` |
| Contract tests | Jest ESM | `scripts/__tests__/` |
| Skill fixtures | Deterministic artifact/rubric runner | `scripts/__fixtures__/skill-exercise/` |
| Live skill proof | Disposable Codex project/session | Verification evidence |
| Installed-surface proof | Fresh install or actual upgrade root | Release verification evidence |

### Disposable Exercise Pattern

1. Create a temporary project with only the files required by the skill.
2. Initialize git and, when necessary, a disposable GitHub repository or dry-run fixture.
3. Load the changed plugin root.
4. Invoke the changed skill and answer every gate explicitly.
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

`$nmg-sdlc:verify-code` enforces applicable gates as hard requirements:

| Gate | Condition | Action | Pass Criteria |
|------|-----------|--------|---------------|
| Contract tests | `scripts/__tests__/` exists | `cd scripts && npm test` | Exit 0; no unexpected skips or orphaned imports |
| Skill inventory | Skill/reference/agent surface changed | `node scripts/skill-inventory-audit.mjs --check` | Exit 0 and baseline current |
| Codex compatibility | Codex-facing contracts changed | `node scripts/codex-compatibility-check.mjs` | Exit 0 |
| Active plugin surface | Plugin surface changed | `node scripts/verify-plugin-surface.mjs --root . --label repository` | Exit 0 |
| Skill creator validation | Skill-bundled files changed | Validate each affected skill through `$skill-creator` tooling | All bundles valid |
| Skill exercise | Changed skill has a deterministic fixture | `node scripts/skill-exercise-runner.mjs --skill <name>` | Exit 0 and rubric satisfied |
| Prompt quality | Skill contract changed | Review against Prompt Quality Criteria | Every criterion satisfied |
| Git hygiene | Any tracked text changed | `git diff --check` | Exit 0 |

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
- User decisions wait for explicit `request_user_input` responses.
- Skills do not mutate beyond their declared stage.
- Epics remain coordination-only; children own executable spec and delivery evidence.
- Pull-request delivery is incomplete until exact-head merge and executable-issue closure are proven.
- Automatic epic closure requires fully paged child, spec-authority, and readable Project evidence.
- Dirty unrelated work is preserved.
- Skill-bundled edits route through `$skill-creator`.
- Active spec context is bounded; historical specs are preserved.
- Remote writes require the owning workflow and exact target.

### Prompt Quality Criteria

| Criterion | Check |
|-----------|-------|
| Unambiguous instructions | Each step has one testable interpretation |
| Complete paths | Success, empty, failure, and user-decline branches are covered |
| Correct tool references | Codex-native tools and safe argument handling are used |
| Logical ordering | Every step depends only on previously available evidence |
| Gate integrity | Decisions wait for explicit user input |
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

No optional environment variable may change interactive gate behavior or broaden mutation scope.

---

## References

- Product direction: `steering/product.md`
- Repository organization: `steering/structure.md`
- Project instructions: `AGENTS.md`
- Public workflow: `README.md`
