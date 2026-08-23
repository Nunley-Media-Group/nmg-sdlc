# Contributing

## Project Context

`nmg-sdlc` is an Oh My Pi extension that turns executable GitHub issues into BDD specs, implementation work, simplification, verification, and terminal pull-request delivery via Herdr automated workers. Contributors should keep changes stack-agnostic, OS-agnostic, and aligned with the issue -> spec (`/sdlc-draft-issue`, `/sdlc-write-spec`) -> automated delivery (`/sdlc-execute`) -> exact-head merge -> issue closure workflow described in `README.md`.

Before drafting issues, writing specs, or changing implementation files, review:

- `steering/product.md` for the plugin mission, target users, product principles, and success metrics.
- `steering/tech.md` for OMP extension architecture, versioning, compatibility, security, verification, and resource-authoring rules.
- `steering/structure.md` for repository layout, naming conventions, layer responsibilities, and anti-patterns.

Git history is the archive for superseded behavior. The working-tree `specs/` directory contains only current capability contracts and active issue specs; remove obsolete packages during an approved breaking repository rewrite.

## Issue and Spec Workflow

Start work from a clear GitHub issue with acceptance criteria. Feature and bug work should flow through nmg-sdlc specs under `specs/`:

- Use `/sdlc-draft-issue [need]` for new issue discovery and acceptance-criteria drafting.
- Use `/sdlc-write-spec #N` to create or amend the executable spec under `specs/{N}-{slug}/` (`requirements.md`, `design.md`, `tasks.md`, `feature.gherkin`).
- Keep specs committed with their feature branches instead of leaving them as untracked local files.

Specs use `specs/{N}-{slug}/` (N = issue number, slug derived from title). Legacy `feature-*` / `bug-*` naming is tolerated only as upgrade input via `/sdlc-upgrade-project`.

There is no epic type. GitHub's official blocked-by relation is the sole sequencing authority between ordinary issues. One issue owns exactly one spec directory with singular `**Issue**: #N` frontmatter; `Depends on:` and `Blocks:` body text is legacy migration evidence only.

## Steering Expectations

Steering docs are part of the contract for this project:

- Product changes should support a structured, issue-driven SDLC using native `/plan` for interactive stages and Herdr `omp` workers for automated delivery.
- Technical changes must preserve cross-platform behavior, use Node.js ESM conventions for scripts, avoid hardcoded platform separators, and respect the `VERSION` + `package.json` versioning flow.
- Skill-bundled file changes must follow the `skill-creator` requirement in `steering/tech.md` when the skill is present.
- Structure changes should keep reusable rules in `references/`, workflow-specific branches under `workflows/{name}/references/`, templates under each owning workflow, and runner behavior in `scripts/`.

When steering and a proposed implementation conflict, update the issue or spec before changing code.

## Implementation and Verification

Implement from the approved spec and keep edits scoped to the issue. Run simplification before final verification when behavior-preserving cleanup is available.

Verification should cover the behavior promised by the spec:

- Run relevant script tests and audits from `scripts/`.
- Exercise changed skills when the behavior depends on prompt workflows, not just static text.
- Verify generated or managed artifacts such as `README.md`, `CONTRIBUTING.md`, steering templates, issue forms, contribution workflows, `CHANGELOG.md`, `VERSION`, `package.json`, and extension metadata stay in sync.
- Use verification evidence before delivery.

Pull requests should reference the executable issue and spec, include a practical test plan, and close only that issue. The only issue-less implementation path is the validated repository-rewrite exception below. Delivery continues through exact-head merge and issue closure when an executable issue exists. Human-reviewer comments remain human-owned; eligible automated-review threads use the bounded review-loop contract.

Legacy backlog correction and layout modernization belong to `/sdlc-upgrade-project`. Its audit is read-only and proposes repairs only on explicit per-group approval; ambiguous ownership is preserved for an explicit decision. Unrelated issues, specs, and Project items remain untouched.

## nmg-sdlc Contribution Workflow

Before requesting review, confirm the pull request is ready for the managed nmg-sdlc contribution gate:

- Link the GitHub issue in the PR body or spec frontmatter, using `Closes #N`, `Fixes #N`, or `**Issue**: #N`.
- Link or update the relevant `specs/{N}-{slug}/` artifacts, including `requirements.md`, `design.md`, `tasks.md`, and `feature.gherkin` (or the matching ADR) when generated.
- Explain steering alignment against `steering/product.md`, `steering/tech.md`, and `steering/structure.md`.
- Summarize verification evidence from tests, exercise runs, verification results, or a committed `verification-report.md`.
- Include reviewer context for known gaps, intentionally deferred work, or follow-up issues.

If the contribution gate fails, fix the missing evidence category instead of bypassing the workflow. Missing issue, spec, steering, verification, or guide evidence should be remediated in the PR body or committed artifacts before re-running the gate.

### Evidence Consistency

The contribution gate evaluates a connected evidence graph rather than accepting unrelated keywords:

- **Issue/spec identity**: reference the current issue explicitly, such as `Closes #143`, and ensure the selected spec directory names that same issue in singular `**Issue**: #143` or its current body. Quoted examples, HTML comments, historical sections, and unrelated specs do not correlate.
- **Exact path evidence**: name an affected path exactly when a task or verification entry covers one file, such as `scripts/check-gate.mjs`.
- **Directory-prefix evidence**: use an explicit directory ending in `/`, such as `scripts/__tests__/`, when the evidence covers that directory. A basename alone is insufficient.
- **Path-specific behavior evidence**: use a structured entry such as `Behavior for scripts/check-gate.mjs: rejects mismatched issue/spec sets` when behavior is more useful than a file-operation description.
- **Command and outcome**: record both the command and result, for example `` `node scripts/check-gate.mjs` — passed (12 cases) ``. Generic statements such as “tests run” are not specific evidence.
- **Other accepted verification**: a non-empty `verification-report.md`, an `AC9: passed` result, or a changed path paired with `passed`, `failed`, `verified`, or `covered` can also provide concrete evidence.

Reduced-evidence modes are validated contracts, not bypasses:

| Mode | Declaration and validation | Reduced checks | Still required | Invalidating conditions |
|------|----------------------------|----------------|----------------|-------------------------|
| Documentation-only | `SDLC-Exception: docs-only — <non-empty reason>` and every change is project documentation | Spec correlation, relevant-path mapping, and specific verification | Current issue linkage, steering artifacts and alignment, guide discoverability, and all other checks | Source, workflow, script, skill, template, shared reference, spec, ADR, or any other non-documentation path |
| Repository rewrite | `SDLC-Exception: repository-rewrite — <non-empty reason>`; PR title starts `feat!:`; `package.json`, `VERSION`, `README.md`, `CONTRIBUTING.md`, all steering files, the managed contribution gate, `references/rewrite-contract.{json,md}`, and `references/rewrite-verification.md` change | Current PR issue/spec identity only | Genuinely owned current spec archive, explicit rewrite contract, durable verification, steering alignment, exact changed-path mapping, specific verification, and guide discoverability | Missing contract path, non-breaking title, unmatched relevant path, missing steering, or missing verification |
| Spec-only write-spec | Title matches `^docs: approve spec for #(\d+)$`; that issue number appears in current PR text; every changed path is class `spec` under exactly one `specs/{N}-{slug}/` whose leading number is that issue | Steering alignment text and specific verification | Current issue linkage, spec correlation, steering artifacts, guide discoverability, and all other checks | Any non-spec path, title mismatch, multiple spec directories, or issue number mismatch |

The repository-rewrite exception exists for an owner-approved clean cutover where pre-cutover work predates the current singular issue/spec workflow. It must not be used for ordinary feature or bug delivery.

Remove an invalid exception or split invalidating implementation changes into a normally evidenced pull request. A marker, label, or rationale never overrides incompatible changed paths.
