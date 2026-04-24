# Defect Variant

**Read this when** the issue carries the `bug` label. The defect variant is a lighter alternative shape for all three phases — the goal is to capture root cause and the minimal correct fix, not to author a full feature spec for a one-off correction. Bug-labelled issues always create a new `bug-{slug}/` directory; they bypass `references/discovery.md` entirely and are never amended.

> **Complexity escape hatch.** For complex bugs that involve architectural changes, supplement the defect variant with sections from the full template as needed. The defect variant is a floor, not a ceiling — borrow from the feature template wherever the lighter shape can't carry the design.

## Detecting the variant

After reading the issue in Phase 1, check whether the issue has the `bug` label:

```bash
gh issue view #N --json labels --jq '.labels[].name'
```

If any label is `bug`, this is a **defect issue** and every phase below uses the defect variant.

## Phase mapping

| Phase | Feature (default) | Defect (bug label) |
|-------|-------------------|--------------------|
| SPECIFY | Full requirements template | Defect Requirements Variant — reproduction, expected vs actual, 2–3 ACs |
| PLAN | Full design template | Defect Design Variant — root cause analysis, fix strategy, blast radius |
| TASKS | 5-phase, 17-task breakdown | Defect Tasks Variant — flat 2–4 tasks: fix, regression test, verify |

## Phase 1 — Defect Requirements Variant

Use the Defect Requirements Variant from `templates/requirements.md`. Capture:

- **Reproduction steps** — the smallest sequence that triggers the bug.
- **Expected vs actual** — what the system should do, what it actually does.
- **Severity** — user-facing impact (data loss, blocked workflow, cosmetic).
- **2–3 acceptance criteria** — typically *bug fixed* + *no regression* + (optionally) *related behavior preserved*. Each in Given/When/Then form.
- **Lightweight functional requirements** — only what's needed to scope the fix.

Omit: NFRs table, UI/UX table, data requirements, success metrics. They're not load-bearing for a defect.

**Populate `**Related Spec**`** by actively searching for the related feature spec:

1. Extract keywords from the issue — file paths, function/method names, component names, module names.
2. Run file discovery for `specs/feature-*/requirements.md` and `specs/*/requirements.md` (covers both new `feature-` naming and legacy `{issue#}-` naming).
3. Run text search over those spec files using the extracted keywords.
4. Read the **first heading** of each matching file to determine its type:
   - `# Requirements:` → feature spec
   - `# Defect Report:` → defect spec
5. **If feature specs match** → use the best-matching feature spec. Set **Related Spec** to its directory (e.g., `specs/feature-dark-mode/`).
6. **If no feature specs match but defect specs do** → follow each matching defect spec's `**Related Spec**` link to find the root feature spec (chain-resolution: follow `Related Spec` links through defect specs until reaching a `# Requirements:` heading, maintaining a visited set to detect cycles). Use the resolved feature spec.
7. **If nothing matches** after filtering and chain following → set **Related Spec** to **N/A**.

## Phase 2 — Defect Design Variant

Use the Defect Design Variant from `templates/design.md`. Capture:

- **Root cause analysis** with specific code references — the smallest correct identification of where and why.
- **Minimal fix strategy** — the change scope, named files, and the rationale for *not* refactoring beyond it.
- **Blast radius** — what else the fix touches, even indirectly.
- **Regression risk table** — known-adjacent behaviors that might break and how the regression test will catch them.

Omit: component diagrams, data flow, API schemas, DB migrations, state management, UI components, security/performance checklists. Document alternatives only if multiple fix approaches exist.

## Phase 3 — Defect Tasks Variant

Use the flat Defect Tasks Variant from `templates/tasks.md` — typically:

- **T001: Fix** — apply the change strategy from the design.
- **T002: Regression test** — add the test that fails without the fix and passes with it.
- **T003: Verify** — confirm no adjacent behavior regressed.

Skip phasing entirely. Dependencies are linear (fix → test → verify).

In `feature.gherkin`, tag every scenario with `@regression` — this is required by `$nmg-sdlc:verify-code`'s bug-fix verification contract.

## Defect Workflow Summary

The pipeline shape is identical to features (SPECIFY → PLAN → TASKS with human review gates). Only the template sections used within each phase differ.

| Phase | Produces | Key Sections | Typical Size |
|-------|----------|-------------|--------------|
| SPECIFY | `requirements.md` | Reproduction, Expected vs Actual, 2–3 ACs, Lightweight FRs | ~50% of feature spec |
| PLAN | `design.md` | Root Cause, Fix Strategy, Blast Radius, Regression Risk | ~30% of feature design |
| TASKS | `tasks.md` + `feature.gherkin` | Fix (T001), Regression Test (T002), Verify (T003) | 2–4 tasks vs 15–17 |
