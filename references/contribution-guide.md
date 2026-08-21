# Contribution Guide Contract

**Consumed by**: `onboard-project` after steering bootstrap or verification succeeds, and `upgrade-project` when analyzing managed project artifacts.

Use this reference to ensure a project-root `CONTRIBUTING.md` for nmg-sdlc-managed projects. The guide is project content, not plugin metadata: it must preserve project-authored policy, derive project-specific expectations from steering, and remain stack-agnostic unless steering provides concrete stack details.

## Preconditions

Run this contract only after all three steering docs exist:

- `steering/product.md`
- `steering/tech.md`
- `steering/structure.md`

If any steering doc is missing, do not create or update `CONTRIBUTING.md`. Record a gap and let the calling skill finish or abort according to its existing steering-bootstrap rules.

## Inputs

Read these files when present:

| File | Required | Purpose |
|------|----------|---------|
| `steering/product.md` | Yes | Product goals, users, priorities, and success expectations |
| `steering/tech.md` | Yes | Technical conventions, testing standards, verification gates, and versioning rules |
| `steering/structure.md` | Yes | Repository layout, naming, layer boundaries, and ownership conventions |
| `CONTRIBUTING.md` | No | Existing contributor policy to preserve |
| `README.md` | No | Existing public entry point that should link to the guide |

When summarizing steering, prefer short, factual bullets. Do not copy long sections, secrets, internal URLs, credentials, or unrelated policy text from steering into the guide.

## Coverage Detection

Classify the current guide state:

| State | Detection | Action |
|-------|-----------|--------|
| Missing guide | `CONTRIBUTING.md` does not exist | Create the default guide |
| Incomplete guide | Guide exists but lacks nmg-sdlc issue/spec/steering coverage, automated delivery, PR readiness, evidence-consistency examples, validated exceptions, or managed contribution-gate remediation coverage | Append or extend targeted nmg-sdlc guidance |
| Complete guide | Guide has equivalent issue/spec/steering coverage plus automated delivery, terminal delivery, PR readiness, evidence-consistency examples, validated exceptions, and contribution-gate remediation coverage | Report already present |

Equivalent issue/spec/steering coverage is present when either condition is true:

- The guide contains `## nmg-sdlc Contribution Workflow`.
- The guide has contributor workflow text that mentions GitHub issues, specs, and steering expectations near one another.

Equivalent lifecycle, PR-readiness, and gate-remediation coverage is present when the guide states that specs live under `specs/{N}-{slug}/` owned by a singular issue, interactive work uses `/sdlc-draft-issue` and `/sdlc-write-spec #N`, automated delivery uses `/sdlc-execute`, PRs are intermediate and success requires exact-head merge + issue closure, and also mentions issue/spec correlation, changed-path evidence, specific verification results, validated exceptions, and the managed contribution gate or its broken-evidence failure categories near one another.

Be conservative. If an existing guide has close equivalent coverage, report `already present` instead of duplicating a near-identical section.

## Missing Guide Creation

When `CONTRIBUTING.md` is absent, create it at the project root with this structure:

```markdown
# Contributing

## Project Context

## Issue and Spec Workflow

## Steering Expectations

## Implementation and Verification
```

Generated content must cover:

- Contributors should start work from a clear GitHub issue with acceptance criteria.
- Feature and bug implementation should flow through nmg-sdlc specs in `specs/`.
- Contributors should consult `steering/product.md`, `steering/tech.md`, and `steering/structure.md` before drafting issues, writing specs, or implementing code.
- Interactive work uses `/sdlc-draft-issue [need]` and `/sdlc-write-spec #N`.
- Automated delivery after an approved spec uses `/sdlc-execute [#N …]` which drives Herdr omp worker panes through implementation, verification, and delivery.
- `/sdlc-execute` continues through exact-head merge and issue closure.
- `/sdlc-upgrade-project` reconciles contracts and proposes legacy layout repairs (never silently).
- PRs should include a readiness checklist covering issue linkage, spec artifacts, steering alignment, implementation scope, verification evidence, and review readiness.
- The managed GitHub Actions contribution gate checks for issue, spec, steering, verification, and guide evidence; failures should name the missing category and point contributors back to this guide.
- Existing code and reconciled specs are contribution context for brownfield projects.
- Project-specific expectations should be summarized from steering where safe. If steering does not contain stack-specific guidance, keep the language stack-agnostic.

The default guide must include concrete sections or bullets for:

- Issue quality: a linked GitHub issue with a user story or bug context, BDD acceptance criteria (Given/When/Then), scope, and out-of-scope notes.
- Spec location and frontmatter: executable work uses `specs/{N}-{slug}/` with `requirements.md`, `design.md`, `tasks.md`, `feature.gherkin` and singular `**Issue**: #N`. Legacy `feature-*` / `bug-*` are upgrade inputs only.
- Steering alignment: how the change respects `product.md`, `tech.md`, and `structure.md`.
- Implementation scope: stay within the approved spec, avoid unrelated refactors, and preserve existing project-owned files.
- Verification evidence: summarize tests, verification results, steering verification gates, or `verification-report.md`.
- PR readiness: include executable issue + child-spec links, verification summary, known gaps, and reviewer context. PR creation is intermediate; success requires exact-head merge and issue closure.
- Contribution-gate remediation: fix missing issue, spec, steering, verification, or guide evidence rather than bypassing the workflow.

## Evidence Consistency Guidance

Generated or extended guidance must explain the evidence graph with concrete, stack-agnostic examples:

- **Issue/spec identity**: ordinary feature and bug PRs use an explicit reference such as `Closes #143`, and every selected spec directory references the same issue in singular `**Issue**: #143` or its current body. Issue numbers found only in quoted examples, hidden HTML comments, historical sections, or an unrelated spec do not correlate. Only the validated repository-rewrite mode may waive current issue/spec identity.
- **Exact path evidence**: a task or verification entry may name `scripts/check-gate.mjs` exactly.
- **Directory-prefix evidence**: a task may explicitly scope work to `scripts/__tests__/`; a basename such as `check-gate.mjs` is not sufficient because another directory can contain a similarly named file.
- **Path-specific behavior evidence**: use a structured entry such as `Behavior for scripts/check-gate.mjs: rejects mismatched issue/spec sets` when behavior, rather than a file operation, is the useful trace.
- **Command and outcome**: record both sides, for example `` `node scripts/check-gate.mjs` — passed (12 cases) ``. `Tests run` or `verification complete` alone is not specific evidence.
- **Other accepted verification**: name a non-empty `verification-report.md`, record `AC9: passed`, or pair a changed path with a `passed`, `failed`, `verified`, or `covered` result.

Document the reduced-evidence contracts without presenting them as bypasses:

| Mode | Declaration and validation | Reduced checks | Still required | Invalidating conditions |
|------|----------------------------|----------------|----------------|-------------------------|
| Documentation-only | `SDLC-Exception: docs-only — <non-empty reason>` and every change is project documentation | Spec correlation, relevant-path mapping, and specific verification | Current issue linkage, steering artifacts and alignment, guide discoverability, all other checks | Source, workflow, script, skill, template, shared reference, spec, ADR, or any other non-documentation path |
| Repository rewrite | `SDLC-Exception: repository-rewrite — <non-empty reason>`; title starts `feat!:`; package/version, public guides, all steering, managed gate, `references/rewrite-contract.{json,md}`, and `references/rewrite-verification.md` change | Current PR issue/spec identity only | Genuinely owned current specs, explicit rewrite contract, durable verification, steering alignment, exact changed-path mapping, specific verification, and guide discoverability | Missing contract path, non-breaking title, unmatched relevant path, missing steering, or missing verification |
| Spec-only write-spec | Title matches `^docs: approve spec for #(\d+)$`; that issue number appears in current PR text; every changed path is class `spec` under exactly one `specs/{N}-{slug}/` whose leading number is that issue | Steering alignment text and specific verification | Current issue linkage, spec correlation, steering artifacts, guide discoverability, and all other checks | Any non-spec path, title mismatch, multiple spec directories, or issue number mismatch |

The rewrite mode is only for an owner-approved clean cutover whose implementation predates the current singular issue/spec workflow. Tell contributors to remove an invalid exception or split invalidating implementation changes into a normally evidenced PR. A marker, label, or rationale never overrides incompatible changed paths.

## Existing Guide Update

When `CONTRIBUTING.md` exists but lacks nmg-sdlc coverage:

1. Preserve the file byte-for-byte outside the inserted section.
2. If the file lacks the canonical heading, append one section named `## nmg-sdlc Contribution Workflow`.
3. If the canonical heading exists but lacks automated delivery, terminal delivery, PR readiness, evidence-consistency examples, validated exceptions, or contribution-gate remediation detail, append a focused subsection under that existing section instead of duplicating the heading.
4. Include issue, singular spec authority under `specs/{N}-{slug}/`, steering, implementation, verification, automated delivery to exact-head merge + closure, and repair expectations.
5. Include a concrete PR readiness checklist, the evidence examples and exception matrix above, and managed contribution-gate remediation guidance.
6. Include a short note that existing code and reconciled specs are context when the caller is in brownfield or upgrade mode.
7. Do not rewrite headings, reformat custom project policies, delete sections, or move unrelated content.

If the existing file has no trailing newline, add one before appending the section.

## README Link

When `README.md` exists:

1. Search for any existing Markdown link or plaintext reference to `CONTRIBUTING.md`.
2. If one exists, report `README.md link: already present`.
3. If none exists, add a discoverable link to `CONTRIBUTING.md` in the most appropriate existing setup or contribution section.
4. If no setup or contribution section exists, append a concise `## Contributing` section with a link to `CONTRIBUTING.md`.
5. Re-read the README and verify that exactly one new contribution-guide link was added.

When `README.md` is absent, do not create it. Report `README.md link: skipped (README missing)` and add that to the caller's gaps list.

## Lifecycle Behavior

- `onboard-project` applies this contract as part of lifecycle setup after steering exists.
- `upgrade-project` presents missing-guide creation, missing nmg-sdlc section insertion, and README-link insertion as non-destructive managed-artifact findings through its existing Step 8 approval flow.

- Record every applied or skipped outcome in the final summary.

## Summary Status

Return this stable result shape to the calling skill:

```text
Contribution Guide:
- CONTRIBUTING.md: created | updated | already present | skipped (<reason>)
- README.md link: added | already present | skipped (README missing)
- Gaps: none | <comma-separated gaps>
```

Use these exact status words so summaries and tests can compare results consistently.

## Safety Rules

- Never overwrite an existing `CONTRIBUTING.md`.
- Never delete, move, or reformat project-authored contribution policy.
- Never create a `README.md`.
- Never hardcode language, framework, deployment, or test-tool assumptions unless they are explicitly present in steering.
- Never proceed before steering exists.
- Never generate guidance that references epic coordination, cumulative specs, or treats PR creation as completed delivery.
