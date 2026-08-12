# Design: Add GitHub Actions Contribution Gates to Project Setup

**Issues**: #125, #143
**Date**: 2026-08-12
**Status**: Draft
**Author**: Codex

---

## Overview

This feature adds one shared contribution-gate contract that defines the managed GitHub Actions workflow template, ownership marker, validation expectations, idempotency rules, collision handling, and summary status shape. `$nmg-sdlc:init-config` consumes that contract when setting up a project's unattended runner config, and `$nmg-sdlc:upgrade-project` consumes the same contract when reconciling initialized projects to the current plugin standard.

The generated workflow is intentionally narrow. It is a contribution-readiness gate, not a replacement for project CI. By default it checks PR metadata and repository artifacts for nmg-sdlc evidence: issue linkage, spec linkage, steering presence/alignment cues, and verification evidence. It emits actionable GitHub Actions errors pointing to `CONTRIBUTING.md`, `specs/`, and `steering/` rather than executing arbitrary project code or language-specific commands.

The richer `CONTRIBUTING.md` content completes the loop. A contributor without the plugin installed should be able to read the guide, prepare a compliant PR, understand what the gate checks, and remediate failures. Existing project-authored contributor policy remains user-owned and is preserved.

---

## Architecture

### Component Diagram

```text
Consumer project setup and upgrade
  |
  |-- skills/init-config/SKILL.md
  |     |-- writes sdlc-config.json
  |     |-- updates .gitignore
  |     `-- applies contribution-gate contract
  |
  |-- skills/upgrade-project/SKILL.md
  |     |-- analyzes managed project artifacts
  |     |-- reports contribution-gate findings
  |     `-- applies safe managed workflow updates
  |
  |-- references/contribution-gate.md
  |     |-- approved workflow path
  |     |-- managed marker and version
  |     |-- workflow template
  |     |-- validation and failure-output contract
  |     |-- idempotency and collision rules
  |     `-- summary status contract
  |
  `-- references/contribution-guide.md
        |-- contributor checklist
        |-- gate remediation guidance
        `-- existing guide preservation rules
```

### Data Flow

```text
1. init-config or upgrade-project resolves the consumer project root.
2. The caller reads references/contribution-gate.md.
3. The contract inspects .github/workflows/nmg-sdlc-contribution-gate.yml when present.
4. If absent, the caller creates parent directories and writes the managed workflow.
5. If present with the nmg-sdlc marker and an older managed version, the caller updates only that workflow.
6. If present without the nmg-sdlc marker, the caller leaves it untouched and records a path-collision gap.
7. The caller applies contribution-guide updates so humans can understand the workflow.
8. The caller reports contribution-gate and contribution-guide statuses in its normal summary.
9. On PRs, GitHub Actions runs the managed workflow and emits pass/fail diagnostics.
```

---

## API / Interface Changes

### Shared Contribution Gate Reference

| Interface | Type | Purpose |
|-----------|------|---------|
| `references/contribution-gate.md` | Shared reference | Defines the managed GitHub Actions contribution-gate workflow and how lifecycle skills install or reconcile it |
| `.github/workflows/nmg-sdlc-contribution-gate.yml` | Consumer-project workflow | Runs on PRs to validate nmg-sdlc contribution evidence |
| Managed marker | YAML comment metadata | Identifies files safe for nmg-sdlc to update |
| Contribution Gate status block | Skill summary text | Reports workflow path outcome and gaps |

### Managed Workflow Metadata

The generated workflow should include stable metadata near the top:

```yaml
# nmg-sdlc-managed: contribution-gate
# nmg-sdlc-managed-version: 1
```

Upgrade logic treats a file as nmg-sdlc-owned only when the managed marker is present. Version comparison is numeric and scoped to the managed workflow. Missing marker means collision, not outdated managed content.

### Summary Status Shape

The shared reference should define this stable result shape for callers:

```text
Contribution Gate:
- Workflow: created | updated | already present | skipped (<reason>)
- Path: .github/workflows/nmg-sdlc-contribution-gate.yml
- Gaps: none | <comma-separated gaps>
```

`init-config`, `upgrade-project`, README examples, and tests should use the same words so downstream logs and automated assertions remain stable.

### Workflow Validation Surface

The workflow validates contribution readiness from safe inputs:

| Evidence | Source | Default Pass Condition |
|----------|--------|------------------------|
| Issue linkage | PR body/title and changed spec frontmatter | At least one local issue reference such as `#125`, `Closes #125`, or `**Issues**: #125` is present |
| Spec linkage | PR body and changed files | PR references or changes a `specs/feature-*` or `specs/bug-*` directory with expected spec artifacts |
| Steering context | Repository files and PR text | `steering/product.md`, `steering/tech.md`, and `steering/structure.md` exist, and PR/spec evidence does not bypass steering entirely |
| Verification evidence | PR body, issue comments copied into PR body, or committed verification artifact | PR includes a non-empty verification/test plan or updates a `verification-report.md` artifact |
| Guide discoverability | Repository files | `CONTRIBUTING.md` exists or the workflow points failures to the missing guide remediation |

The workflow should not execute project build/test commands by default. Project-specific CI stays in project-authored workflows. If a project declares steering-level verification gates, the contribution gate may require PR evidence that those gates were run, but arbitrary gate command execution remains the responsibility of project CI or `$nmg-sdlc:verify-code`.

### Evidence Consistency Graph — Issue #143

Managed workflow version 2 replaces independent keyword-presence verdicts with a bounded evidence graph. The generated `actions/github-script` step keeps all pull-request content as inert text and performs these stages in order:

1. Extract normalized issue-number sets from the current pull-request title/body, prioritizing closing references and explicit issue fields without treating quoted historical examples as current evidence.
2. Resolve candidate spec directories from changed spec artifacts and explicit `specs/feature-*` or `specs/bug-*` paths in the pull-request body. Deduplicate the directories and read only their expected requirements, design, tasks, and Gherkin artifacts within a documented cap.
3. Extract issue references from each selected spec and require a non-empty intersection with the pull-request issue set. A number found in unrelated text or another spec does not create an edge.
4. Classify changed paths as relevant implementation, evidence-only, documentation-only, or ADR/spec artifacts. For each relevant path, require an exact normalized path, an explicit containing-directory prefix, or path-specific behavior evidence in the selected tasks or verification source.
5. Parse only the current verification section and committed verification artifacts for specific signals: a command paired with an outcome, a non-empty report, an acceptance-criterion result, or a changed-path-specific result. Generic verification words do not create an evidence edge.
6. Validate any reduced-evidence exception against both metadata and paths. A `docs-only` marker requires a non-empty rationale and documentation-only changes. A spike/ADR reduction requires the correlated issue to carry the `spike` label and changes to remain within ADR, spec, or documentation artifacts.
7. Emit one concise diagnostic per broken edge, including the mismatched issue/spec pair or unmatched changed paths, followed by the existing `CONTRIBUTING.md` remediation pointer.

The evaluator uses pure internal helpers such as `extractIssueNumbers(text)`, `resolveSpecDirectories(prText, changedPaths)`, `classifyChangedPath(path)`, `hasSpecificVerification(evidence)`, and `validateException(evidence)`. They are implementation details inside the generated workflow rather than a public JavaScript API.

### Version 2 Distribution

`references/contribution-gate.md` remains the canonical workflow source. Its managed version advances from 1 to 2, and `.github/workflows/nmg-sdlc-contribution-gate.yml` in this repository stays byte-for-byte aligned with the embedded template for dogfooding. Existing `init-config` and `upgrade-project` contracts already create missing workflows and replace lower managed versions, so they distribute version 2 without new workflow branches; tests verify that integration and fail if their shared-reference pointers drift.

### Issue #143 Components

| File | Amendment |
|------|-----------|
| `references/contribution-gate.md` | Version-2 evidence graph, correlation rules, exception predicates, bounded reads, and diagnostics |
| `.github/workflows/nmg-sdlc-contribution-gate.yml` | Dogfooded copy synchronized with the canonical version-2 template |
| `references/contribution-guide.md` | Contributor examples for issue/spec mapping, path evidence, specific verification, and exceptions |
| `scripts/__tests__/contribution-gate-contract.test.mjs` | Static version, safety, distribution, and template-synchronization assertions |
| `scripts/__tests__/exercise-contribution-gate.test.mjs` | Mocked GitHub fixtures that execute the exact embedded evaluator |
| `scripts/skill-inventory.baseline.json` | Refresh only when the shared-reference inventory reports intentional changes |
| `README.md` | Public explanation of consistency checks and reduced-evidence paths |
| `CHANGELOG.md` | Issue #143 entry under `[Unreleased]` |

No edit to `skills/init-config/SKILL.md` or `skills/upgrade-project/SKILL.md` is expected unless implementation exposes wording drift: both already consume the versioned canonical contract.

---

## Database / Storage Changes

No database changes.

### Consumer Project Files

| File | Change | Rule |
|------|--------|------|
| `.github/workflows/nmg-sdlc-contribution-gate.yml` | Created or updated when absent/currently managed | Never overwrite an unmanaged file at the same path |
| `CONTRIBUTING.md` | Expanded with concrete contribution checklist and gate remediation guidance | Preserve existing content; append/update only nmg-sdlc-managed coverage |
| `README.md` | Existing README may link to `CONTRIBUTING.md` via existing contribution-guide contract | Do not create README when absent |

### Repository Files For Implementation

| File | Purpose |
|------|---------|
| `references/contribution-gate.md` | Shared contract and workflow template |
| `skills/init-config/SKILL.md` | Calls the contribution-gate contract during setup |
| `skills/upgrade-project/SKILL.md` | Analyzes contribution-gate managed artifact and reports findings |
| `skills/upgrade-project/references/upgrade-procedures.md` | Applies approved or unattended-managed gate creation/update |
| `references/contribution-guide.md` | Adds north-star checklist and gate remediation guidance |
| `README.md` | Public docs for generated PR gate and contributor expectations |
| `CHANGELOG.md` | Unreleased entry |
| `scripts/__tests__/contribution-gate-contract.test.mjs` | Static contract coverage |
| `scripts/__tests__/exercise-contribution-gate.test.mjs` | Disposable-project or fixture exercise coverage |
| `scripts/skill-inventory.baseline.json` | Inventory baseline refresh when reference content changes |

---

## State Management

No persistent runtime state is added. Each run derives contribution-gate state from the filesystem.

| State | Detection | Action |
|-------|-----------|--------|
| Missing workflow | Approved path absent | Create parent directories and managed workflow |
| Current managed workflow | Managed marker present and version equals current | Report already present |
| Outdated managed workflow | Managed marker present and version lower than current | Update only the managed workflow |
| Future managed workflow | Managed marker present and version higher than current | Leave unchanged and report skipped (newer managed version) |
| Unmanaged path collision | Approved path exists without marker | Leave unchanged and record gap |
| Existing unrelated workflows | Other files under `.github/workflows/` | Leave unchanged |

---

## UI Components

No graphical UI is introduced.

### User-Facing Output

| Output | Location | Purpose |
|--------|----------|---------|
| Contribution Gate status | `init-config` completion summary | Shows whether the workflow was created, updated, already present, or skipped |
| Contribution Gate finding | `upgrade-project` Step 8 findings | Lets interactive users approve managed workflow creation/update with other non-destructive findings |
| Contribution Gate status | `upgrade-project` Step 9 summary | Reports applied/skipped outcomes in unattended and interactive modes |
| GitHub Actions annotations | PR checks | Names missing issue/spec/steering/verification evidence and points to remediation |
| Contributor checklist | `CONTRIBUTING.md` | Gives non-plugin contributors enough process detail to satisfy the gate |

---

## Alternatives Considered

| Option | Description | Pros | Cons | Decision |
|--------|-------------|------|------|----------|
| Init-config only | Install the workflow only during new runner setup | Smallest lifecycle change | Existing initialized projects never receive the gate | Rejected |
| Upgrade-project only | Let upgrades install the workflow but leave init-config unchanged | Avoids expanding setup skill | New projects miss the gate until a later upgrade | Rejected |
| Shared contribution-gate reference | One shared contract consumed by init-config and upgrade-project | One source of truth, testable status shape, consistent idempotency | Adds shared reference inventory work | Selected |
| Inline gate logic separately in each skill | Add workflow YAML directly to both skills | No new reference file | High drift risk and harder testing | Rejected |
| Execute steering gate commands inside contribution workflow | Run project-declared verification commands from `tech.md` in generated workflow | Stronger enforcement | Risks arbitrary command execution and stack-specific assumptions | Rejected |
| Require verification evidence instead of executing arbitrary gates | Check that PR/spec evidence documents verification and steering-gate results | Safe, stack-agnostic, consistent with nmg-sdlc workflow | Cannot prove language-specific tests passed without separate CI | Selected |
| Overwrite occupied managed path | Replace any file at the approved path | Ensures gate exists | Can destroy user-authored workflow content | Rejected |
| Skip unmanaged path collision with gap | Preserve unknown file and report remediation | Safe and deterministic | Requires human cleanup when path is occupied | Selected |
| Continue independent regex presence checks | Tighten the existing patterns without correlating evidence sources | Smallest patch | Cosmetic or unrelated references can still combine into a false pass | Rejected for issue #143 |
| Build a bounded evidence graph | Correlate issue identity, selected specs, relevant paths, and specific verification | Auditable, actionable, and resistant to quoted-text false positives | Requires more structured pull-request evidence and fixture coverage | Selected for issue #143 |
| Trust an exception marker by itself | Let contributors declare docs-only or spike status in free text | Minimal contributor effort | Becomes an unvalidated bypass for implementation changes | Rejected for issue #143 |
| Validate exception metadata and paths | Require rationale, compatible changed paths, and spike labels where applicable | Preserves lightweight workflows without weakening unrelated checks | Adds one issue metadata lookup for spike validation | Selected for issue #143 |

---

## Security Considerations

- [x] **Authentication**: Uses the GitHub Actions-provided token only for read operations.
- [x] **Authorization**: Workflow permissions are limited to `contents: read` and `pull-requests: read`.
- [x] **Event Safety**: Uses `pull_request`; does not use `pull_request_target` by default.
- [x] **Input Handling**: Treats PR body, title, branch names, changed paths, and Markdown content as untrusted data; never evaluates them as shell or JavaScript source.
- [x] **Secrets**: Requires no repository secrets by default.
- [x] **Third-Party Actions**: Avoid unpinned third-party actions; official actions such as `actions/checkout@v4` are acceptable when needed.

---

## Performance Considerations

- [x] **Small Scan Surface**: The workflow inspects PR metadata and a bounded set of repository paths (`CONTRIBUTING.md`, `steering/`, `specs/`, changed files).
- [x] **No Dependency Install**: The default gate should not run package installs.
- [x] **Idempotent Setup**: Init and upgrade short-circuit when the managed workflow is already current.
- [x] **Large PRs**: Changed-file scans should operate on path lists and targeted files instead of broad repository traversal where possible.

---

## Testing Strategy

| Layer | Type | Coverage |
|-------|------|----------|
| Shared contract | Static/unit | Assert approved path, managed marker/version, minimal permissions, no secrets, no `pull_request_target`, status shape, and collision rules |
| Init-config integration | Static/unit + fixture exercise | Assert init-config references the shared contract, creates parent directories/workflow in a disposable project, and reports status |
| Upgrade-project integration | Static/unit + fixture exercise | Assert upgrade-project analyzes the workflow, updates missing/outdated managed versions, preserves unrelated workflows, and skips unmanaged path collisions |
| Contribution guide | Static/unit | Assert checklist covers issue quality, spec location, steering alignment, verification evidence, PR readiness, and gate failure remediation |
| Workflow behavior | Fixture exercise | Evaluate compliant and non-compliant PR metadata/file sets and assert actionable pass/fail output |
| Inventory | Audit | Run `node scripts/skill-inventory-audit.mjs --check`; regenerate `scripts/skill-inventory.baseline.json` if shared-reference inventory changes |
| Compatibility | Audit | Run `npm --prefix scripts run compat` and `npm --prefix scripts test -- --runInBand` |
| Evidence correlation | Exact-template fixture exercise | Run the embedded workflow script with mocked pull-request files, repository content, issue metadata, and GitHub API responses; cover matching and mismatched issue/spec sets |
| Changed-path mapping | Exact-template fixture exercise | Cover exact file paths, explicit directory prefixes, path-specific behavior, evidence-only files, similarly named paths, and unmatched-path diagnostics |
| Verification specificity | Exact-template fixture exercise | Cover command-plus-outcome, report, AC result, and path-specific passes plus generic-keyword and quoted-history failures |
| Exceptions | Exact-template fixture exercise | Cover valid docs-only and spike/ADR reductions plus invalid rationale, label, and changed-path combinations |
| Template synchronization | Static/unit | Extract the canonical YAML template and assert the dogfooded managed workflow is identical |

---

## Risks & Mitigations

| Risk | Likelihood | Impact | Mitigation |
|------|------------|--------|------------|
| Workflow blocks valid PRs because evidence detection is too strict | Medium | High | Accept evidence from PR body, spec frontmatter, changed spec paths, and verification artifacts; make error messages name the missing signal |
| Workflow silently passes PRs with no real nmg-sdlc evidence | Medium | High | Require issue, spec, steering, and verification categories independently; tests include negative fixtures |
| Existing project CI is overwritten | Low | High | Only manage the approved path and only when the marker is present or the file is absent |
| Unmanaged file at approved path blocks automation | Medium | Medium | Report deterministic collision gap with manual remediation; do not overwrite |
| Workflow security regresses via `pull_request_target` or secrets | Low | High | Static tests assert forbidden constructs are absent |
| Guide grows vague despite richer content | Medium | Medium | Tests assert concrete checklist terms and remediation pointers, not just generic "follow process" copy |
| Skill-bundled file edits bypass skill-creator | Medium | High | Implementation tasks explicitly route shared references and skill files through `$skill-creator` per steering invariant |
| Evidence matching rejects legitimate aliases or similarly structured paths | Medium | High | Normalize repository-relative paths, accept explicit directory prefixes, reject basename-only ambiguity, and cover similar-name fixtures |
| Evidence matching accepts quoted or historical text | Medium | High | Restrict identity and verification extraction to current structured sources and test quoted-history counterexamples |
| Large pull requests amplify GitHub API reads | Medium | Medium | Deduplicate spec directories, cap artifact reads, reuse fetched content, and fail with bounded actionable diagnostics |
| Reduced-evidence exceptions become bypasses | Low | High | Validate the exception rationale, correlated issue label, and entire changed-path set while retaining issue, steering, and guide checks |
| Canonical and dogfooded workflows drift | Medium | High | Exercise the exact embedded evaluator and assert byte-for-byte template synchronization |

---

## Open Questions

None.

---

## Change History

| Issue | Date | Summary |
|-------|------|---------|
| #125 | 2026-04-27 | Initial feature spec |
| #143 | 2026-08-12 | Designed version-2 evidence consistency graph and exceptions |

---

## Validation Checklist

Before moving to TASKS phase:

- [x] Architecture follows existing project patterns per `structure.md`
- [x] All API/interface changes documented
- [x] Database/storage changes planned
- [x] State management approach is clear
- [x] UI components and hierarchy addressed
- [x] Security considerations addressed
- [x] Performance impact analyzed
- [x] Testing strategy defined
- [x] Alternatives were considered and documented
- [x] Risks identified with mitigations
