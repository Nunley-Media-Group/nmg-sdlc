# Requirements: Add GitHub Actions Contribution Gates to Project Setup

**Issues**: #125
**Date**: 2026-04-27
**Status**: Draft
**Author**: Codex

---

## User Story

**As a** project maintainer using nmg-sdlc-managed repositories
**I want** project setup and upgrade flows to install a GitHub Actions PR contribution gate and richer contribution guidance
**So that** pull requests that bypass nmg-sdlc issue, spec, steering, and verification expectations are blocked before merge with actionable feedback

---

## Background

nmg-sdlc already manages project contribution guidance through `references/contribution-guide.md`, `$nmg-sdlc:onboard-project`, and `$nmg-sdlc:upgrade-project`. That guide is advisory: it explains issue, spec, steering, implementation, verification, and PR expectations, but repositories that adopt the plugin still need maintainers to add their own CI if they want non-compliant pull requests blocked before merge.

This feature adds a managed GitHub Actions contribution gate for consumer projects. `$nmg-sdlc:init-config` should install the gate during unattended-runner setup, `$nmg-sdlc:upgrade-project` should create or reconcile the managed workflow for initialized projects, and the contribution guide should become detailed enough for contributors who do not have nmg-sdlc installed locally to understand the gate and fix failures.

The spec applies retrospective learnings about automation branches, generated artifacts, external status signals, and managed-file reconciliation: every success and skip path must be explicit, unmanaged project files must be preserved, non-interactive flows must be deterministic, and workflow failures must be actionable rather than merely reporting that a check ran.

---

## Acceptance Criteria

### AC1: Init Creates the Managed PR Gate

**Given** a project runs `$nmg-sdlc:init-config`
**When** runner config setup completes and the managed workflow path is absent or already owned by nmg-sdlc
**Then** the project has `.github/workflows/nmg-sdlc-contribution-gate.yml`
**And** the workflow contains the current nmg-sdlc managed marker and managed-version metadata
**And** the workflow validates pull requests against nmg-sdlc contribution expectations.

### AC2: Upgrade Reconciles Missing or Outdated Gates

**Given** an initialized project is missing `.github/workflows/nmg-sdlc-contribution-gate.yml` or has an older nmg-sdlc-managed version at that path
**When** `$nmg-sdlc:upgrade-project` runs
**Then** the workflow is reported as a managed non-destructive upgrade finding
**And** applying the finding creates or updates only the managed nmg-sdlc workflow
**And** unrelated project files and unmanaged workflows are preserved.

### AC3: Non-Compliant PRs Fail with Actionable Output

**Given** a pull request lacks required nmg-sdlc contribution evidence, such as issue linkage, spec linkage, steering alignment, or verification evidence
**When** the generated contribution-gate workflow runs
**Then** CI fails
**And** the output names each missing expectation
**And** the output points contributors to `CONTRIBUTING.md` or the relevant nmg-sdlc artifact path.

### AC4: Existing GitHub Actions Are Preserved

**Given** a project already has unrelated workflows under `.github/workflows/`
**When** `$nmg-sdlc:init-config` or `$nmg-sdlc:upgrade-project` manages the contribution gate
**Then** unrelated workflows are not overwritten, moved, deleted, or reformatted
**And** only `.github/workflows/nmg-sdlc-contribution-gate.yml` is created or reconciled when that path is nmg-sdlc-owned.

### AC5: CONTRIBUTING.md Becomes a North Star for Non-Plugin Contributors

**Given** a developer does not have nmg-sdlc installed locally
**When** they read generated or updated `CONTRIBUTING.md`
**Then** they can understand the expected issue quality, spec location, steering alignment, implementation scope, verification evidence, PR readiness checklist, and contribution-gate failure remediation without invoking an nmg-sdlc skill.

### AC6: Workflow Security and Portability Hold

**Given** the generated workflow runs on pull requests
**When** it evaluates repository content and PR metadata
**Then** it uses minimal GitHub token permissions
**And** it requires no repository secrets by default
**And** it does not run untrusted PR content as code
**And** it remains stack-agnostic unless a project explicitly declares additional steering-level verification expectations.

### AC7: Path Collisions Are Safe

**Given** `.github/workflows/nmg-sdlc-contribution-gate.yml` exists without the nmg-sdlc managed marker
**When** `$nmg-sdlc:init-config` or `$nmg-sdlc:upgrade-project` reaches the contribution-gate step
**Then** the workflow is not overwritten
**And** the skill records a gap naming the occupied path and the required manual remediation
**And** unattended mode does not prompt or force the replacement.

### AC8: Gate Installation Is Idempotent

**Given** the managed contribution-gate workflow and guide content are already current
**When** `$nmg-sdlc:init-config` or `$nmg-sdlc:upgrade-project` runs again
**Then** no duplicate workflow content, duplicate README links, duplicate contribution-guide sections, or unrelated diffs are produced
**And** the skill summary reports the gate as already present.

---

## Functional Requirements

| ID | Requirement | Priority | Notes |
|----|-------------|----------|-------|
| FR1 | Define a reusable managed contribution-gate contract and workflow template for nmg-sdlc-managed projects. | Must | The contract owns the approved path, managed markers, validation expectations, idempotency, status shape, and collision behavior. |
| FR2 | Update `$nmg-sdlc:init-config` so new runner setup creates the managed workflow and required parent directories without disturbing existing workflows. | Must | Must run after project root resolution and before final output. |
| FR3 | Update `$nmg-sdlc:upgrade-project` so initialized projects analyze, report, create, and reconcile the managed workflow through normal interactive and unattended upgrade rules. | Must | Missing/outdated managed workflows are non-destructive managed-artifact findings; unmanaged path collisions are gaps. |
| FR4 | Expand `references/contribution-guide.md` and generated `CONTRIBUTING.md` content into a concrete contributor checklist covering issue quality, spec evidence, steering alignment, verification evidence, PR readiness, and gate failure remediation. | Must | Existing guide content remains project-owned and preserved. |
| FR5 | The generated workflow must fail non-compliant PRs with actionable diagnostics for missing issue, spec, steering, or verification evidence. | Must | Diagnostics should use GitHub Actions annotations where practical. |
| FR6 | The workflow must use minimal permissions, require no repository secrets by default, avoid `pull_request_target`, and avoid executing untrusted PR content. | Must | Keeps default gate safe for public and private repositories. |
| FR7 | Add static and exercise coverage for init, upgrade, workflow idempotency, existing-workflow preservation, missing/outdated managed workflow handling, path-collision handling, non-compliant PR output, and richer contribution-guide output. | Must | Exercise coverage should use disposable projects or deterministic fixtures. |
| FR8 | Update README and public plugin documentation to describe the generated PR gate and richer contribution-guide expectations. | Should | README is the public entry point for adopting projects. |
| FR9 | Update `CHANGELOG.md` under `[Unreleased]` for the generated gate and guide expansion. | Must | `/open-pr` will roll the entry into the release. |
| FR10 | Keep generated gate behavior stack-agnostic by default and reflect steering-level verification expectations as required contribution evidence rather than arbitrary command execution. | Must | Language-specific builds/tests remain project CI or steering-gate responsibilities. |

---

## Non-Functional Requirements

| Aspect | Requirement |
|--------|-------------|
| **Security** | The workflow uses `pull_request`, `contents: read`, and `pull-requests: read`; it does not require secrets, `pull_request_target`, or arbitrary code execution from the PR branch. |
| **Reliability** | Re-running init or upgrade against a current managed workflow produces no diff and reports `already present`. |
| **Portability** | The workflow is stack-agnostic and relies only on GitHub Actions runner capabilities suitable for default hosted runners unless the project explicitly opts into more. |
| **Preservation** | Existing workflows, existing contributor policy, README content, and project-authored CI remain untouched except for the approved managed file/link updates. |
| **Observability** | Failing gates emit concrete missing-evidence messages and pointers to `CONTRIBUTING.md`, `specs/`, `steering/`, or PR-body sections. |
| **Automation** | Unattended mode auto-applies safe managed workflow creation/update and records deterministic gaps for collisions rather than prompting. |

---

## Data Requirements

### Input Data

| Field | Type | Validation | Required |
|-------|------|------------|----------|
| Pull request body | Markdown text | Treat as untrusted input; search for issue/spec/verification evidence without shell interpolation | Yes, when workflow runs |
| Changed files | Path list | Derived from GitHub event or `git diff`; treat paths as data, not commands | Yes, when workflow runs |
| `.github/workflows/nmg-sdlc-contribution-gate.yml` | YAML file | Managed marker and version identify nmg-sdlc-owned content | No |
| `CONTRIBUTING.md` | Markdown file | Preserve existing content; append/update only nmg-sdlc-managed guidance | No |
| `steering/product.md`, `steering/tech.md`, `steering/structure.md` | Markdown files | Used as contribution context; do not copy sensitive details wholesale | Expected in initialized projects |
| `specs/*/{requirements,design,tasks}.md`, `specs/*/feature.gherkin` | Markdown/Gherkin | Used to verify referenced spec paths and issue frontmatter when available | Conditional |

### Output Data

| Field | Type | Description |
|-------|------|-------------|
| `.github/workflows/nmg-sdlc-contribution-gate.yml` | YAML file | Managed PR workflow installed in consumer projects |
| Contribution Gate status | Summary text | `Workflow: created | updated | already present | skipped (<reason>)`; includes path and gaps |
| GitHub Actions annotations | CI output | Names missing contribution expectations and remediation pointers |
| Enriched `CONTRIBUTING.md` section | Markdown | Contributor-facing issue/spec/steering/verification/PR checklist and gate remediation guidance |

---

## Dependencies

### Internal Dependencies

- [x] `references/contribution-guide.md` managed contribution guide contract from issue #109
- [x] `$nmg-sdlc:init-config` runner setup workflow
- [x] `$nmg-sdlc:upgrade-project` managed artifact reconciliation workflow
- [x] `steering/tech.md` verification-gate convention
- [x] `scripts/skill-inventory-audit.mjs` baseline audit for shared reference changes

### External Dependencies

- [x] GitHub Actions `pull_request` event
- [x] GitHub-provided token with read-only repository and pull-request access
- [ ] No repository secrets required by default

### Blocked By

- [ ] None

---

## Out of Scope

- Directly modifying GitHub branch protection rules or repository settings.
- Centralizing all project CI in the generated contribution-gate workflow.
- Requiring repository secrets for the default gate.
- Enforcing language-specific build or test commands unless the project explicitly declares them as steering-level expectations and supplies separate CI.
- Replacing human code review.
- Overwriting an unmanaged workflow already occupying the approved nmg-sdlc path.

---

## Success Metrics

| Metric | Target | Measurement |
|--------|--------|-------------|
| Gate installation coverage | Init and upgrade tests both produce the managed workflow when safe | Static/exercise tests over disposable projects |
| Preservation | Zero unrelated workflow or contributor-policy diffs | Fixture diffs before/after init and upgrade |
| Non-compliance detection | Missing issue/spec/verification evidence causes failing gate output with actionable messages | Workflow fixture or script-level exercise test |
| Idempotency | Second run yields no file changes | `git status --short` or fixture diff after rerun |
| Security posture | Workflow has minimal permissions, no secrets, and no `pull_request_target` | Static workflow-template contract test |

---

## Open Questions

None.

---

## Change History

| Issue | Date | Summary |
|-------|------|---------|
| #125 | 2026-04-27 | Initial feature spec |

---

## Validation Checklist

Before moving to PLAN phase:

- [x] User story follows "As a / I want / So that" format
- [x] All acceptance criteria use Given/When/Then format
- [x] No implementation details required beyond managed artifact contracts and safety boundaries
- [x] All criteria are testable and unambiguous
- [x] Success metrics are measurable
- [x] Edge cases and error states are specified
- [x] Dependencies are identified
- [x] Out of scope is defined
- [x] Open questions are documented or resolved
