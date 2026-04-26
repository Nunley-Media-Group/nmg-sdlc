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
| Incomplete guide | Guide exists but lacks nmg-sdlc issue, spec, and steering coverage | Append one targeted nmg-sdlc section |
| Complete guide | Guide has the canonical nmg-sdlc heading or equivalent nearby issue/spec/steering coverage | Report already present |

Equivalent coverage is present when either condition is true:

- The guide contains `## nmg-sdlc Contribution Workflow`.
- The guide has contributor workflow text that mentions GitHub issues, specs, and steering expectations near one another.

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
- Implementation should follow the issue -> spec -> code -> simplify -> verify -> PR workflow.
- Existing code and reconciled specs are contribution context for brownfield projects.
- Project-specific expectations should be summarized from steering where safe. If steering does not contain stack-specific guidance, keep the language stack-agnostic.

## Existing Guide Update

When `CONTRIBUTING.md` exists but lacks nmg-sdlc coverage:

1. Preserve the file byte-for-byte outside the inserted section.
2. Append one section named `## nmg-sdlc Contribution Workflow`.
3. Include issue, spec, steering, implementation, verification, and PR expectations.
4. Include a short note that existing code and reconciled specs are context when the caller is in brownfield or upgrade mode.
5. Do not rewrite headings, reformat custom project policies, delete sections, or move unrelated content.

If the existing file has no trailing newline, add one before appending the section.

## README Link

When `README.md` exists:

1. Search for any existing Markdown link or plaintext reference to `CONTRIBUTING.md`.
2. If one exists, report `README.md link: already present`.
3. If none exists, add a discoverable link to `CONTRIBUTING.md` in the most appropriate existing setup or contribution section.
4. If no setup or contribution section exists, append a concise `## Contributing` section with a link to `CONTRIBUTING.md`.
5. Re-read the README and verify that exactly one new contribution-guide link was added.

When `README.md` is absent, do not create it. Report `README.md link: skipped (README missing)` and add that to the caller's gaps list.

## Mode Behavior

Interactive mode:

- `onboard-project` applies this contract as part of lifecycle setup after steering exists.
- `upgrade-project` presents missing-guide creation, missing nmg-sdlc section insertion, and README-link insertion as non-destructive managed-artifact findings through its existing Step 8 approval flow.

Unattended mode:

- Do not call `request_user_input`.
- Auto-apply missing-guide creation, missing nmg-sdlc section insertion, and README-link insertion because they are non-destructive managed-artifact changes.
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
