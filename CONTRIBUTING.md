# Contributing

## Project Context

`nmg-sdlc` is a Codex plugin that turns GitHub issues into BDD specs, implementation work, simplification, verification, and pull requests. Contributors should keep changes stack-agnostic, OS-agnostic, and aligned with the issue -> spec -> code -> simplify -> verify -> PR workflow described in `README.md`.

Before drafting issues, writing specs, or changing implementation files, review:

- `steering/product.md` for the plugin mission, target users, product principles, and success metrics.
- `steering/tech.md` for Codex plugin architecture, versioning, compatibility, security, verification, and resource-authoring rules.
- `steering/structure.md` for repository layout, naming conventions, layer responsibilities, and anti-patterns.

Existing source files, closed issue specs, and retrospective learnings are project context. Preserve that history when enhancing existing behavior.

## Issue and Spec Workflow

Start work from a clear GitHub issue with acceptance criteria. Feature and bug work should flow through nmg-sdlc specs under `specs/`:

- Use `$nmg-sdlc:draft-issue` for new issue discovery and acceptance-criteria drafting.
- Use `$nmg-sdlc:start-issue` to create the linked feature branch and move the issue into progress.
- Use `$nmg-sdlc:write-spec` to create or amend `requirements.md`, `design.md`, `tasks.md`, and `feature.gherkin`.
- Keep specs committed with their feature branches instead of leaving them as untracked local files.

Feature specs use `specs/feature-{slug}/`. Bug specs use `specs/bug-{slug}/`. Legacy spec naming is tolerated only as upgrade input.

## Steering Expectations

Steering docs are part of the contract for this project:

- Product changes should support a structured, issue-driven SDLC for Codex users and unattended runner automation.
- Technical changes must preserve cross-platform behavior, use Node.js ESM conventions for scripts, avoid hardcoded platform separators, and respect the `VERSION` plus `.codex-plugin/plugin.json` versioning flow.
- Skill-bundled file changes must follow the `skill-creator` requirement in `steering/tech.md`.
- Structure changes should keep reusable rules in `references/`, skill-specific branches under `skills/{skill}/references/`, templates under each owning skill, and runner behavior in `scripts/`.

When steering and a proposed implementation conflict, update the issue or spec before changing code.

## Implementation and Verification

Implement from the approved spec and keep edits scoped to the issue. Run `$nmg-sdlc:simplify` before final verification when behavior-preserving cleanup is available.

Verification should cover the behavior promised by the spec:

- Run relevant script tests and audits from `scripts/`.
- Exercise changed skills when the behavior depends on prompt workflows, not just static text.
- Verify generated or managed artifacts such as `README.md`, `CHANGELOG.md`, `VERSION`, and plugin manifest metadata stay in sync.
- Use `$nmg-sdlc:verify-code` before `$nmg-sdlc:open-pr`.

Pull requests should reference the issue and spec, include a practical test plan, and leave human-reviewer comments for humans while `$nmg-sdlc:address-pr-comments` handles only eligible automated-review threads.

## nmg-sdlc Contribution Workflow

Before requesting review, confirm the pull request is ready for the managed nmg-sdlc contribution gate:

- Link the GitHub issue in the PR body or spec frontmatter, using `Closes #N`, `Fixes #N`, or `**Issues**: #N`.
- Link or update the relevant `specs/feature-*` or `specs/bug-*` artifacts, including `requirements.md`, `design.md`, `tasks.md`, and `feature.gherkin` when generated.
- Explain steering alignment against `steering/product.md`, `steering/tech.md`, and `steering/structure.md`.
- Summarize verification evidence from tests, exercise runs, `$nmg-sdlc:verify-code`, or a committed `verification-report.md`.
- Include reviewer context for known gaps, intentionally deferred work, or follow-up issues.

If the contribution gate fails, fix the missing evidence category instead of bypassing the workflow. Missing issue, spec, steering, verification, or guide evidence should be remediated in the PR body or committed artifacts before re-running the gate.

### Evidence Consistency

The version-2 contribution gate evaluates a connected evidence graph rather than accepting unrelated keywords:

- **Issue/spec identity**: reference the current issue explicitly, such as `Closes #143`, and ensure every selected spec directory names that same issue in `**Issues**: #143` or its current body. Quoted examples, HTML comments, historical sections, and unrelated specs do not correlate.
- **Exact path evidence**: name an affected path exactly when a task or verification entry covers one file, such as `scripts/check-gate.mjs`.
- **Directory-prefix evidence**: use an explicit directory ending in `/`, such as `scripts/__tests__/`, when the evidence covers that directory. A basename alone is insufficient.
- **Path-specific behavior evidence**: use a structured entry such as `Behavior for scripts/check-gate.mjs: rejects mismatched issue/spec sets` when behavior is more useful than a file-operation description.
- **Command and outcome**: record both the command and result, for example `` `node scripts/check-gate.mjs` — passed (12 cases) ``. Generic statements such as “tests run” are not specific evidence.
- **Other accepted verification**: a non-empty `verification-report.md`, an `AC9: passed` result, or a changed path paired with `passed`, `failed`, `verified`, or `covered` can also provide concrete evidence.

Reduced-evidence modes are validated contracts, not bypasses:

| Mode | Declaration and validation | Reduced checks | Still required | Invalidating paths |
|------|----------------------------|----------------|----------------|--------------------|
| Documentation-only | `SDLC-Exception: docs-only — <non-empty reason>` and every change is project documentation | Spec correlation, relevant-path mapping, and specific verification | Current issue linkage, steering artifacts and alignment, guide discoverability, and all other checks | Source, workflow, script, skill, template, shared reference, spec, ADR, or any other non-documentation path |
| Spike/ADR | A PR/spec-correlated issue has the `spike` label and every change is documentation, a spec artifact, or `docs/decisions/*.md` | Relevant-path mapping and specific verification | Current issue/spec correlation, steering artifacts and alignment, guide discoverability, and all other checks | Source, workflow, script, skill, template, shared reference, or any other implementation path |

Remove an invalid exception or split invalidating implementation changes into a normally evidenced pull request. A marker, label, or rationale never overrides incompatible changed paths.
